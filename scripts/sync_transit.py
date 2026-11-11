"""Reduce the official PID GTFS feed to one stop's tram timetable."""
import csv
from contextlib import closing
import io
import json
import os
from pathlib import Path
import sqlite3
import tempfile
from datetime import datetime, timezone
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
FEED_URL = "https://data.pid.cz/PID_GTFS.zip"
STOP_NAME = "Ortenovo náměstí"


def rows(archive, name):
    with archive.open(name) as source:
        yield from csv.DictReader(io.TextIOWrapper(source, encoding="utf-8-sig"))


def seconds(value):
    h, m, s = map(int, value.split(":"))
    return h * 3600 + m * 60 + s


def needs_sync():
    path = DATA / 'transit.sqlite'
    if not path.exists():
        return True
    try:
        with closing(sqlite3.connect(f'file:{path}?mode=ro', uri=True)) as connection:
            meta = dict(connection.execute('SELECT key,value FROM metadata'))
        age = datetime.now(timezone.utc) - datetime.fromisoformat(meta['downloaded_at'])
        return age.total_seconds() >= 21600
    except (sqlite3.Error, KeyError, ValueError):
        return True


def sync(download=True):
    DATA.mkdir(exist_ok=True)
    archive_path = DATA / "PID_GTFS.zip"
    if download or not archive_path.exists():
        print("Downloading official PID timetable…", flush=True)
        request = urllib.request.Request(FEED_URL, headers={"User-Agent": "eink-dashboard/1.0"})
        with urllib.request.urlopen(request, timeout=90) as response:
            with open(DATA / "PID_GTFS.zip.download", "wb") as target:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    target.write(chunk)
        os.replace(DATA / "PID_GTFS.zip.download", archive_path)

    with zipfile.ZipFile(archive_path) as archive:
        stops = {r["stop_id"]: r for r in rows(archive, "stops.txt")}
        selected = {key: r for key, r in stops.items() if r["stop_name"] == STOP_NAME}
        if len(selected) != 2:
            raise ValueError("Expected two Ortenovo náměstí platforms; inspect the new feed before replacing the timetable.")
        routes = {r["route_id"]: r for r in rows(archive, "routes.txt") if r["route_type"] == "0"}
        trips = {r["trip_id"]: r for r in rows(archive, "trips.txt") if r["route_id"] in routes}
        departures = []
        awaiting = {}
        print("Extracting tram departures for platforms A and B…", flush=True)
        for r in rows(archive, "stop_times.txt"):
            tid = r["trip_id"]
            if tid in awaiting:
                previous = awaiting.pop(tid)
                previous["next_stop"] = stops.get(r["stop_id"], {}).get("stop_name", "")
            if r["stop_id"] not in selected or tid not in trips:
                continue
            if r.get("pickup_type", "0") == "1":
                continue
            trip = trips[tid]
            departure = {
                "stop_id": r["stop_id"], "service_id": trip["service_id"],
                "trip_id": tid, "line": routes[trip["route_id"]]["route_short_name"],
                "destination": r.get("stop_headsign") or trip["trip_headsign"],
                "seconds": seconds(r["departure_time"]), "next_stop": "",
            }
            departures.append(departure)
            awaiting[tid] = departure

        fd, temporary = tempfile.mkstemp(dir=DATA, suffix=".sqlite")
        os.close(fd)
        try:
            connection = sqlite3.connect(temporary)
            with connection:
                connection.executescript("""
                    CREATE TABLE stops (stop_id TEXT PRIMARY KEY, platform TEXT, latitude REAL, longitude REAL);
                    CREATE TABLE departures (stop_id TEXT, service_id TEXT, trip_id TEXT, line TEXT,
                        destination TEXT, seconds INTEGER, next_stop TEXT);
                    CREATE INDEX departure_lookup ON departures(service_id, seconds);
                    CREATE TABLE calendar (service_id TEXT PRIMARY KEY, monday INTEGER, tuesday INTEGER,
                        wednesday INTEGER, thursday INTEGER, friday INTEGER, saturday INTEGER, sunday INTEGER,
                        start_date TEXT, end_date TEXT);
                    CREATE TABLE exceptions (service_id TEXT, date TEXT, exception_type INTEGER);
                    CREATE INDEX exception_lookup ON exceptions(date);
                    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT);
                """)
                connection.executemany("INSERT INTO stops VALUES (?,?,?,?)", [
                    (r["stop_id"], r["platform_code"], r["stop_lat"], r["stop_lon"]) for r in selected.values()
                ])
                connection.executemany("INSERT INTO departures VALUES (:stop_id,:service_id,:trip_id,:line,:destination,:seconds,:next_stop)", departures)
                for r in rows(archive, "calendar.txt"):
                    connection.execute("INSERT INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)", [r[key] for key in (
                        "service_id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "start_date", "end_date"
                    )])
                connection.executemany("INSERT INTO exceptions VALUES (:service_id,:date,:exception_type)", list(rows(archive, "calendar_dates.txt")))
                info = next(rows(archive, "feed_info.txt"))
                metadata = {**info, "downloaded_at": datetime.now(timezone.utc).isoformat(), "source": FEED_URL}
                connection.executemany("INSERT INTO metadata VALUES (?,?)", [(k, str(v)) for k, v in metadata.items()])
            connection.close()
            os.replace(temporary, DATA / "transit.sqlite")
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    print(json.dumps({"platforms": list(selected), "departures": len(departures), "valid_until": info["feed_end_date"]}, indent=2))


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true", help="Use the downloaded feed")
    sync(download=not parser.parse_args().offline)
