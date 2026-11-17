"""Demand-driven tracking for the flight dashboard previews."""
from functools import lru_cache
import json
import logging
import math
import random
import re
import threading
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)
POSITIONS = "https://api.adsb.lol/v2"
ROUTES = "https://api.adsbdb.com/v0"
POLL_SECONDS = 185  # At most 468 position requests/day in steady operation.
ARRIVAL_HOLD = 10 * 60
SIGNAL_TIMEOUT = 45 * 60
MAX_FLIGHT_AGE = 12 * 3600


def get_json(url, *, timeout=6):
    request = Request(url, headers={"User-Agent": "eink-dashboard/1.0", "Accept": "application/json"})
    with urlopen(request, timeout=timeout) as response:
        return json.load(response)


def distance(a, b):
    lat_a, lat_b = map(math.radians, (a["lat"], b["lat"]))
    dlon = math.radians(b["lon"] - a["lon"])
    h = math.sin((lat_b - lat_a) / 2) ** 2 + math.cos(lat_a) * math.cos(lat_b) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(min(1, math.sqrt(h)))


def airport(row):
    return {
        "code": row.get("iata_code") or row["icao_code"], "city": row.get("municipality") or row["name"],
        "country": row["country_name"], "lat": row["latitude"], "lon": row["longitude"],
    }


@lru_cache(maxsize=256)
def route(callsign, day):
    try:
        response = get_json(f"{ROUTES}/callsign/{callsign}")["response"]["flightroute"]
        return airport(response["origin"]), airport(response["destination"])
    except HTTPError as error:
        if error.code != 404:
            raise
        return None
    except (KeyError, TypeError):
        return None


def observation(row, now):
    lat, lon = row.get("lat"), row.get("lon")
    age = row.get("seen_pos")
    if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in (lat, lon, age)):
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180 and 0 <= age <= 120):
        return None
    altitude = row.get("alt_baro")
    return {"lat": lat, "lon": lon, "altitude": altitude if isinstance(altitude, (int, float)) else None,
            "speed": row.get("gs"), "heading": row.get("track"), "ground": altitude == "ground",
            "seenAt": now - age}


def position_rows(path):
    data = get_json(f"{POSITIONS}/{path}", timeout=16)
    now = time.time()
    provider_time = data.get("now")
    if not isinstance(provider_time, (int, float)):
        raise ValueError("Aircraft feed did not include a timestamp")
    if provider_time > 1e12:
        provider_time /= 1000
    if abs(now - provider_time) > 120:
        raise ValueError("Aircraft feed snapshot is too old")
    return data["ac"], provider_time


def select_flight(previous):
    rows, now = position_rows("point/48.35/11.79/180")
    random.shuffle(rows)
    candidates = []
    for row in rows:
        callsign, hex_id = (row.get("flight") or "").strip(), row.get("hex", "")
        point = observation(row, now)
        if (not re.fullmatch(r"[A-Z]{3}[A-Z0-9]{1,6}", callsign)
                or not re.fullmatch(r"[a-fA-F0-9]{6}", hex_id) or hex_id == previous
                or not point or (point["altitude"] or 0) < 2500):
            continue
        candidates.append((row, callsign, hex_id, point))

    for row, callsign, hex_id, point in candidates[:16]:
        airports = route(callsign, int(now // 86400))
        if not airports:
            continue
        origin, destination = airports
        if not all(33 <= a["lat"] <= 72 and -24 <= a["lon"] <= 43 for a in airports):
            continue
        length = distance(origin, destination)
        remaining = distance(point, destination)
        if not (160 <= length <= 4500 and 30 < remaining <= 1500
                and distance(origin, point) + remaining <= length * 1.32 + 35):
            continue
        aircraft = row.get("desc") or row.get("t") or "Unknown aircraft"
        if not row.get("desc"):
            try:
                details = get_json(f"{ROUTES}/aircraft/{hex_id}")["response"]["aircraft"]
                aircraft = details.get("type") or aircraft
            except (OSError, ValueError, KeyError, TypeError):
                pass  # The transponder type code still identifies the model.
        return {"id": hex_id, "callsign": callsign, "aircraft": aircraft,
                "origin": origin, "destination": destination, "position": point,
                "trail": [point], "startedAt": now, "landedAt": None}
    return None


def advance(flight, rows, now):
    for row in rows:
        if row.get("hex", "").lower() != flight["id"].lower():
            continue
        if (row.get("flight") or "").strip() not in ("", flight["callsign"]):
            continue
        point = observation(row, now)
        if not point or point["seenAt"] <= flight["position"]["seenAt"]:
            continue
        trail = flight["trail"]
        if distance(trail[-1], point) > 0.1:
            trail = [*trail[-119:], point]
        landed = now if point["ground"] and distance(point, flight["destination"]) <= 8 else None
        return {**flight, "position": point, "trail": trail, "landedAt": landed}
    return flight


class FlightTracker:
    def __init__(self):
        self.lock = threading.Lock()
        self.flight = None
        self.error = None
        self.busy = False
        self.next_poll = 0

    def snapshot(self):
        with self.lock:
            now = time.time()
            if not self.busy and time.monotonic() >= self.next_poll:
                self.busy = True
                self.next_poll = time.monotonic() + POLL_SECONDS
                threading.Thread(target=self.poll, name="flight-preview", daemon=True).start()
            flight = self.flight
            if flight and flight["landedAt"]:
                status = "arrived"
            elif flight:
                status = "tracking" if now - flight["position"]["seenAt"] < 2 * POLL_SECONDS else "signal lost"
            else:
                status = "unavailable" if self.error else "looking"
            return {"flight": flight, "status": status, "error": self.error, "now": now}

    def poll(self):
        flight = self.flight
        error = None
        try:
            now = time.time()
            if flight and flight["landedAt"] and now - flight["landedAt"] < ARRIVAL_HOLD:
                with self.lock:
                    self.next_poll = time.monotonic() + ARRIVAL_HOLD - (now - flight["landedAt"])
                return
            if (not flight or flight["landedAt"] or now - flight["position"]["seenAt"] >= SIGNAL_TIMEOUT
                    or now - flight["startedAt"] >= MAX_FLIGHT_AGE):
                flight = select_flight(flight["id"] if flight else None)
            else:
                rows, observed_at = position_rows(f"icao/{flight['id']}")
                flight = advance(flight, rows, observed_at)
        except (OSError, ValueError, KeyError, TypeError) as exc:
            logger.warning("Flight preview feed failed: %s", exc)
            error = "The live flight feed is temporarily unavailable."
            if isinstance(exc, HTTPError) and exc.code == 429:
                try:
                    delay = int(exc.headers.get("Retry-After", "900"))
                except ValueError:
                    delay = 900
                with self.lock:
                    self.next_poll = time.monotonic() + max(POLL_SECONDS, delay)
        finally:
            with self.lock:
                self.flight, self.error, self.busy = flight, error, False


tracker = FlightTracker()
