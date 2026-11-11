"""Weather and timetable data; runtime requires only Python 3.9+."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sqlite3
import threading
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
from greetings import greeting
from world import world_snapshot

ROOT = Path(__file__).resolve().parent
PRAGUE = ZoneInfo("Europe/Prague")
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
_weather_cache = {"value": None, "at": 0}
_weather_lock = threading.Lock()


def format_weather(saved, now=None, stale=False):
    now = now or datetime.now(PRAGUE)
    raw = saved["raw"]
    hourly = raw["hourly"]
    hours = [{"time": timestamp, **{k: values[i] for k, values in hourly.items() if k != "time"}}
             for i, timestamp in enumerate(hourly["time"])]
    # Precipitation applies to the preceding hour. Show future interval end times,
    # including midnight (the final interval of today), rather than a past interval.
    remaining = [r for r in hours if r["time"] >= now.timestamp()]
    midnight = datetime.combine(now.date() + timedelta(days=1), datetime.min.time(), PRAGUE).timestamp()
    today = [r for r in remaining if r["time"] <= midnight]
    daily = raw['daily']
    result = {
        "status": "stale" if stale else "ok", "current": raw["current"], "hours": remaining[:6],
        "today": {
            "peakPrecipitationProbability": max((r["precipitation_probability"] for r in today if r["precipitation_probability"] is not None), default=None),
            "snowfallCm": round(sum(r["snowfall"] or 0 for r in today), 1),
            "high": raw["daily"]["temperature_2m_max"][0], "low": raw["daily"]["temperature_2m_min"][0],
            "sunset": raw["daily"]["sunset"][0],
            "sunrise": daily.get('sunrise', [None])[0],
        },
        "fetchedAt": saved["fetchedAt"], "source": "Open-Meteo", "modelBased": True,
    }
    if stale:
        result["error"] = "Weather refresh failed; showing last saved forecast."
    return result


def active_services(connection, day):
    date = day.strftime("%Y%m%d")
    weekday = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")[day.weekday()]
    services = {r[0] for r in connection.execute(
        f"SELECT service_id FROM calendar WHERE {weekday}=1 AND start_date<=? AND end_date>=?", (date, date)
    )}
    for service, exception in connection.execute("SELECT service_id,exception_type FROM exceptions WHERE date=?", (date,)):
        if exception == 1:
            services.add(service)
        elif exception == 2:
            services.discard(service)
    return services


def service_epoch(day):
    # GTFS defines a service day's origin as local noon minus twelve elapsed hours.
    return datetime(day.year, day.month, day.day, 12, tzinfo=PRAGUE).timestamp() - 43200


def transit(now=None, database=None):
    now = now or datetime.now(PRAGUE)
    path = Path(database) if database else ROOT / "data/transit.sqlite"
    if not path.exists():
        return {"status": "unavailable", "error": "Timetable not downloaded. Run npm run sync.", "platforms": []}
    with closing(sqlite3.connect(f"file:{path}?mode=ro", uri=True)) as connection:
        connection.row_factory = sqlite3.Row
        meta = dict(connection.execute("SELECT key,value FROM metadata"))
        date = now.strftime("%Y%m%d")
        if not meta["feed_start_date"] <= date <= meta["feed_end_date"]:
            return {"status": "expired", "error": "Timetable expired. Run npm run sync.", "platforms": [], "feed": meta}
        platforms = {r["stop_id"]: {"id": r["stop_id"], "platform": r["platform"], "departures": []} for r in connection.execute("SELECT * FROM stops ORDER BY platform")}
        # Previous service days include night trams with GTFS times above 24:00.
        for offset in (-2, -1, 0, 1):
            day = now.date() + timedelta(days=offset)
            services = active_services(connection, day)
            if not services:
                continue
            epoch = service_epoch(day)
            lower, upper = now.timestamp() - epoch, now.timestamp() + 7200 - epoch
            marks = ",".join("?" for _ in services)
            query = f"SELECT * FROM departures WHERE service_id IN ({marks}) AND seconds>=? AND seconds<=? ORDER BY seconds"
            for row in connection.execute(query, [*services, lower, upper]):
                departure = datetime.fromtimestamp(epoch + row["seconds"], PRAGUE)
                platforms[row["stop_id"]]["departures"].append({
                    "line": row["line"], "destination": row["destination"],
                    "time": departure.isoformat(), "nextStop": row["next_stop"],
                    "scheduled": True,
                })
        for platform in platforms.values():
            platform["departures"].sort(key=lambda r: r["time"])
            platform["departures"] = platform["departures"][:4]
            next_stops = [r["nextStop"] for r in platform["departures"] if r["nextStop"]]
            platform["direction"] = max(set(next_stops), key=next_stops.count) if next_stops else "No departures in the next 2 hours"
        return {"status": "ok", "mode": "scheduled", "platforms": list(platforms.values()), "feed": meta,
                "fetchedAt": now.isoformat(), "source": "PID / ROPID"}


def weather():
    with _weather_lock:
        if (_weather_cache["value"] and time.monotonic() - _weather_cache["at"] < 600
                and datetime.fromisoformat(_weather_cache["value"]["fetchedAt"]).astimezone(PRAGUE).date() == datetime.now(PRAGUE).date()):
            return format_weather(_weather_cache["value"])
        params = {
            "latitude": 50.107826, "longitude": 14.447080,
            "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,precipitation,is_day",
            "hourly": "temperature_2m,apparent_temperature,precipitation_probability,rain,snowfall,weather_code,is_day",
            "daily": "temperature_2m_max,temperature_2m_min,sunrise,sunset",
            "timezone": "Europe/Prague", "forecast_days": 2, "timeformat": "unixtime",
        }
        try:
            request = Request(WEATHER_URL + "?" + urlencode(params), headers={"User-Agent": "eink-dashboard/1.0"})
            with urlopen(request, timeout=12) as response:
                raw = json.load(response)
            now = datetime.now(PRAGUE)
            saved = {"raw": raw, "fetchedAt": now.isoformat()}
            result = format_weather(saved, now)
            _weather_cache.update(value=saved, at=time.monotonic())
            cache = ROOT / "data/weather.json"
            cache.parent.mkdir(exist_ok=True)
            cache.write_text(json.dumps(saved))
            return result
        except Exception:
            previous = _weather_cache["value"]
            cache = ROOT / "data/weather.json"
            if previous is None and cache.exists():
                try:
                    previous = json.loads(cache.read_text())
                except (OSError, ValueError):
                    pass
            if previous:
                # Do not turn an old saved forecast into today's forecast.
                if "raw" in previous and datetime.fromisoformat(previous["fetchedAt"]).astimezone(PRAGUE).date() == datetime.now(PRAGUE).date():
                    return format_weather(previous, stale=True)
            return {"status": "unavailable", "error": "Weather unavailable. Check the internet connection."}


def snapshot():
    with ThreadPoolExecutor(max_workers=2) as pool:
        weather_result = pool.submit(weather)
        transit_result = pool.submit(transit)
        try:
            departures = transit_result.result()
        except Exception:
            departures = {"status": "unavailable", "error": "Cannot read the timetable. Run npm run sync.", "platforms": []}
        now = datetime.now(timezone.utc)
        conditions = weather_result.result()
        try:
            world = world_snapshot(conditions, now)
        except (OSError, ValueError, KeyError):
            world = {'status': 'unavailable', 'error': 'World memory unavailable; weather and trams still work.'}
        return {"generatedAt": now.isoformat(), "timezone": "Europe/Prague", "greeting": greeting(now),
                "mountainGreeting": greeting(now, theme="mountain"),
                "location": "Ortenovo náměstí, Praha 7", "weather": conditions, "transit": departures,
                "world": world}
