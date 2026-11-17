"""Weather and timetable data; runtime requires only Python 3.9+."""
from contextlib import closing
from datetime import datetime, timedelta, timezone
import json
import logging
from pathlib import Path
import sqlite3
import time
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
from greetings import greeting
from world import world_snapshot

ROOT = Path(__file__).resolve().parent
PRAGUE = ZoneInfo("Europe/Prague")
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
logger = logging.getLogger(__name__)
WEATHER_REFRESH_SECONDS = 600
WEATHER_RETRY_SECONDS = 60
_weather_cache = None


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


def weather(now=None):
    """Read the last complete forecast without waiting on the weather provider."""
    now = (now or datetime.now(PRAGUE)).astimezone(PRAGUE)
    cached = _weather_cache
    if cached:
        saved, fetched_at, refresh_failed = cached
        if fetched_at.date() == now.date():
            age = now.timestamp() - fetched_at.timestamp()
            return format_weather(saved, now, stale=refresh_failed or age >= WEATHER_REFRESH_SECONDS)
    return {"status": "unavailable", "error": "Weather unavailable. Check the internet connection."}


def maintain_weather():
    """The server's single weather worker publishes completed forecasts for its readers."""
    global _weather_cache
    path = ROOT / "data/weather.json"
    try:
        saved = json.loads(path.read_text())
        fetched_at = datetime.fromisoformat(saved["fetchedAt"]).astimezone(PRAGUE)
        format_weather(saved)
        _weather_cache = (saved, fetched_at, False)
    except FileNotFoundError:
        pass
    except (OSError, ValueError, KeyError, TypeError, IndexError):
        logger.exception("Could not load the saved forecast")

    params = {
        "latitude": 50.107826, "longitude": 14.447080,
        "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,precipitation,is_day",
        "hourly": "temperature_2m,apparent_temperature,precipitation_probability,rain,snowfall,weather_code,is_day",
        "daily": "temperature_2m_max,temperature_2m_min,sunrise,sunset",
        "timezone": "Europe/Prague", "forecast_days": 2, "timeformat": "unixtime",
    }
    request = Request(WEATHER_URL + "?" + urlencode(params), headers={"User-Agent": "eink-dashboard/1.0"})
    while True:
        started = time.monotonic()
        try:
            with urlopen(request, timeout=12) as response:
                raw = json.load(response)
            fetched_at = datetime.now(PRAGUE)
            saved = {"raw": raw, "fetchedAt": fetched_at.isoformat()}
            format_weather(saved, fetched_at)
        except Exception as error:
            if isinstance(error, (URLError, TimeoutError)):
                logger.warning("Open-Meteo refresh failed after %.2fs: %s",
                               time.monotonic() - started, error)
            else:
                logger.exception("Open-Meteo forecast could not be processed")
            if _weather_cache:
                previous, previous_time, _ = _weather_cache
                _weather_cache = (previous, previous_time, True)
            time.sleep(WEATHER_RETRY_SECONDS)
            continue

        _weather_cache = (saved, fetched_at, False)
        logger.info("Open-Meteo refresh completed in %.2fs", time.monotonic() - started)
        try:
            path.parent.mkdir(exist_ok=True)
            temporary = path.with_suffix(".json.tmp")
            temporary.write_text(json.dumps(saved))
            temporary.replace(path)
        except OSError:
            logger.exception("Could not persist the latest forecast")

        midnight = datetime.combine(fetched_at.date() + timedelta(days=1), datetime.min.time(), PRAGUE)
        next_refresh = min(fetched_at.timestamp() + WEATHER_REFRESH_SECONDS, midnight.timestamp())
        time.sleep(max(1, next_refresh - time.time()))


def snapshot():
    try:
        departures = transit()
    except Exception:
        logger.exception("Could not read the tram timetable")
        departures = {"status": "unavailable", "error": "Cannot read the timetable. Run npm run sync.", "platforms": []}
    now = datetime.now(timezone.utc)
    conditions = weather(now)
    try:
        world = world_snapshot(conditions, now)
    except (OSError, ValueError, KeyError):
        logger.exception("Could not update illustrated world memory")
        world = {'status': 'unavailable', 'error': 'World memory unavailable; weather and trams still work.'}
    return {"generatedAt": now.isoformat(), "timezone": "Europe/Prague", "greeting": greeting(now),
            "mountainGreeting": greeting(now, theme="mountain"),
            "location": "Ortenovo náměstí, Praha 7", "weather": conditions, "transit": departures,
            "world": world}
