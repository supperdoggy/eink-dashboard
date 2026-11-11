from datetime import date, datetime, timedelta
import sqlite3
import tempfile
import unittest
from pathlib import Path

from dashboard import PRAGUE, active_services, format_weather, service_epoch, transit
from scripts.sync_transit import seconds


class TimetableTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "test.sqlite"
        self.db = sqlite3.connect(self.path)
        self.db.executescript("""
            CREATE TABLE calendar(service_id TEXT, monday INTEGER, tuesday INTEGER, wednesday INTEGER,
              thursday INTEGER, friday INTEGER, saturday INTEGER, sunday INTEGER, start_date TEXT, end_date TEXT);
            CREATE TABLE exceptions(service_id TEXT, date TEXT, exception_type INTEGER);
            CREATE TABLE stops(stop_id TEXT, platform TEXT, latitude REAL, longitude REAL);
            CREATE TABLE departures(stop_id TEXT, service_id TEXT, trip_id TEXT, line TEXT,
              destination TEXT, seconds INTEGER, next_stop TEXT);
            CREATE TABLE metadata(key TEXT, value TEXT);
            INSERT INTO metadata VALUES ('feed_start_date', '20261101'), ('feed_end_date', '20261120');
            INSERT INTO calendar VALUES ('daily',1,1,1,1,1,1,1,'20261101','20261120');
            INSERT INTO stops VALUES ('A','A',50,14), ('B','B',50,14);
        """)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def test_calendar_exceptions_add_and_remove_service(self):
        self.db.executescript("INSERT INTO exceptions VALUES ('daily','20261107',2), ('special','20261107',1);")
        self.assertEqual(active_services(self.db, date(2026, 11, 7)), {"special"})
        self.assertEqual(active_services(self.db, date(2026, 11, 8)), {"daily"})

    def test_night_departure_belongs_to_previous_service_day(self):
        self.db.execute("INSERT INTO departures VALUES ('A','daily','night','94','Night tram',?, 'Next stop')", (seconds("25:10:00"),))
        self.db.commit()
        now = datetime(2026, 11, 8, 1, 5, tzinfo=PRAGUE)
        result = transit(now, self.path)
        departures = result["platforms"][0]["departures"]
        self.assertEqual(len(departures), 1)
        self.assertEqual(departures[0]["time"], "2026-11-08T01:10:00+01:00")

    def test_expired_feed_is_not_presented_as_current(self):
        result = transit(datetime(2026, 11, 21, 10, tzinfo=PRAGUE), self.path)
        self.assertEqual(result["status"], "expired")
        self.assertEqual(result["platforms"], [])

    def test_departed_trams_excluded_and_platforms_kept_separate(self):
        self.db.executemany("INSERT INTO departures VALUES (?,?,?,?,?,?,?)", [
            ('A','daily','old','1','Past',seconds('13:59:00'),'North'),
            ('A','daily','north','1','North',seconds('14:05:00'),'North'),
            ('B','daily','south','5','South',seconds('14:10:00'),'South'),
        ])
        self.db.commit()
        result = transit(datetime(2026, 11, 7, 14, tzinfo=PRAGUE), self.path)
        self.assertEqual([d['destination'] for d in result['platforms'][0]['departures']], ['North'])
        self.assertEqual([d['destination'] for d in result['platforms'][1]['departures']], ['South'])

    def test_gtfs_origin_on_dst_transition_is_noon_minus_twelve_hours(self):
        day = date(2026, 10, 25)
        noon = datetime(2026, 10, 25, 12, tzinfo=PRAGUE)
        self.assertEqual(noon.timestamp() - service_epoch(day), 43200)


class WeatherTests(unittest.TestCase):
    def test_upcoming_intervals_and_midnight_snow_counted_for_today(self):
        now = datetime(2026, 11, 7, 22, 30, tzinfo=PRAGUE)
        start = datetime(2026, 11, 7, 22, tzinfo=PRAGUE)
        timestamps = [(start + timedelta(hours=i)).timestamp() for i in range(4)]
        saved = {"fetchedAt": now.isoformat(), "raw": {
            "current": {"time": now.timestamp()},
            "hourly": {"time": timestamps, "precipitation_probability": [100, 10, 60, 90], "snowfall": [5, 0, 0.2, 4]},
            "daily": {"temperature_2m_max": [8], "temperature_2m_min": [0], "sunset": [1]},
        }}
        result = format_weather(saved, now)
        self.assertEqual(result['hours'][0]['time'], timestamps[1])
        self.assertEqual(result['today']['peakPrecipitationProbability'], 60)
        self.assertEqual(result['today']['snowfallCm'], .2)
        self.assertEqual(format_weather(saved, now, stale=True)['status'], 'stale')


if __name__ == '__main__':
    unittest.main()
