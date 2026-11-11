from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest

from world import describe, evolve, world_snapshot


class WorldTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 7, 14, tzinfo=timezone.utc)

    def weather(self, now=None, code=0, speed=5, bearing=30, status='ok'):
        return {'status': status, 'current': {
            'time': (now or self.now).timestamp(), 'weather_code': code,
            'precipitation': 0, 'wind_speed_10m': speed,
            'wind_direction_10m': bearing, 'apparent_temperature': 12,
        }}

    def test_rain_memory_survives_restart_and_expires_after_eighteen_hours(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'world.json'
            first = world_snapshot(self.weather(code=61), self.now, path)
            self.assertTrue(first['puddles'])
            tomorrow = self.now + timedelta(hours=15)
            second = world_snapshot(self.weather(tomorrow), tomorrow, path)
            self.assertTrue(second['puddles'])
            self.assertEqual(second['lastWetAt'], first['lastWetAt'])
            dry = tomorrow + timedelta(hours=4)
            self.assertFalse(world_snapshot(self.weather(dry), dry, path)['puddles'])

    def test_same_observation_does_not_move_leaf_or_write_again(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'world.json'
            first = world_snapshot(self.weather(), self.now, path)
            stamp = path.stat().st_mtime_ns
            second = world_snapshot(self.weather(), self.now + timedelta(minutes=1), path)
            self.assertEqual(first['leaf'], second['leaf'])
            self.assertEqual(path.stat().st_mtime_ns, stamp)

    def test_leaf_waits_for_strong_changed_wind(self):
        state = evolve(None, self.weather(), self.now)
        later = self.now + timedelta(minutes=15)
        gentle = evolve(state, self.weather(later, speed=5, bearing=150), later)
        self.assertEqual(state['leaf'], gentle['leaf'])
        strong = evolve(gentle, self.weather(later + timedelta(minutes=15), speed=25, bearing=150), later + timedelta(minutes=15))
        self.assertNotEqual(state['leaf']['position'], strong['leaf']['position'])
        self.assertEqual(strong['leaf']['bearing'], 150)

    def test_stale_or_old_weather_cannot_create_new_events(self):
        state = evolve(None, self.weather(), self.now)
        later = self.now + timedelta(hours=6)
        stale = evolve(state, self.weather(later, code=61, status='stale'), later)
        old = evolve(state, self.weather(self.now - timedelta(minutes=15), code=61), self.now)
        self.assertIsNone(stale['lastWetAt'])
        self.assertIsNone(old['lastWetAt'])

    def test_story_changes_once_per_prague_calendar_day(self):
        state = evolve(None, self.weather(), self.now)
        same = evolve(state, self.weather(), self.now + timedelta(hours=4))
        next_day = self.now + timedelta(days=1)
        changed = evolve(same, self.weather(next_day), next_day)
        self.assertEqual(len(same['journal']), 1)
        self.assertEqual(len(changed['journal']), 2)
        self.assertEqual(changed['journal'][-1]['transmission'], 175)
        self.assertNotEqual(changed['journal'][0]['message'], changed['journal'][1]['message'])

    def test_corrupt_memory_is_not_silently_reset(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'world.json'
            path.write_text('{bad json')
            with self.assertRaises(ValueError):
                world_snapshot(self.weather(), self.now, path)
            self.assertEqual(path.read_text(), '{bad json')

    def test_world_is_explicitly_fictional_and_connections_are_honest(self):
        state = evolve(None, self.weather(), self.now)
        result = describe(state, self.weather(), self.now)
        self.assertTrue(result['fictional'])
        self.assertEqual(result['connections'], {'nas': 'not-connected', 'indoor': 'not-connected'})
        self.assertEqual(result['cat']['favourite'], 'windowsill')

    def test_comic_episode_changes_at_each_three_hour_boundary(self):
        now = self.now.replace(hour=20)
        state = evolve(None, self.weather(now), now)
        episodes = [describe(state, self.weather(now), now + timedelta(hours=i * 3))['episode'] for i in range(5)]
        self.assertTrue(all(a != b for a, b in zip(episodes, episodes[1:])))

    def test_snow_does_not_invent_a_rain_puddle(self):
        weather = self.weather(code=73)
        weather['current']['precipitation'] = .5
        state = evolve(None, weather, self.now)
        self.assertIsNone(state['lastWetAt'])


if __name__ == '__main__':
    unittest.main()
