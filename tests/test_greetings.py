from datetime import date, datetime, timedelta, timezone
import unittest

from greetings import PRAGUE, greeting, load_phrases


class GreetingTests(unittest.TestCase):
    def at(self, year, month, day, hour, minute=0):
        return greeting(datetime(year, month, day, hour, minute, tzinfo=PRAGUE))

    def test_one_hundred_unique_reviewable_phrases(self):
        phrases = load_phrases()
        self.assertEqual(len(phrases), 100)
        self.assertEqual(len({p['text'] for p in phrases}), 100)
        self.assertIn('Hello, Holešovice!', {p['text'] for p in phrases})
        self.assertIn('Good for one little adventure.', {p['text'] for p in phrases})

    def test_exactly_three_changes_with_no_midnight_change(self):
        evening_before = self.at(2026, 11, 6, 18)
        self.assertEqual(self.at(2026, 11, 7, 0), evening_before)
        self.assertEqual(self.at(2026, 11, 7, 5, 59), evening_before)
        morning = self.at(2026, 11, 7, 6)
        afternoon = self.at(2026, 11, 7, 12)
        evening = self.at(2026, 11, 7, 18)
        self.assertEqual(self.at(2026, 11, 7, 11, 59), morning)
        self.assertEqual(self.at(2026, 11, 7, 17, 59), afternoon)
        self.assertEqual(self.at(2026, 11, 8, 5, 59), evening)
        self.assertEqual(len({r['text'] for r in (evening_before, morning, afternoon, evening)}), 4)

    def test_seasons_change_at_morning_boundary(self):
        for month, previous, current in [(3, 'winter', 'spring'), (6, 'spring', 'summer'),
                                          (9, 'summer', 'autumn'), (12, 'autumn', 'winter')]:
            with self.subTest(month=month):
                self.assertEqual(self.at(2026, month, 1, 5, 59)['season'], previous)
                self.assertEqual(self.at(2026, month, 1, 6)['season'], current)
        self.assertEqual(self.at(2027, 1, 1, 0), self.at(2026, 12, 31, 18))

    def test_prague_dst_boundaries_keep_local_schedule(self):
        for day, offset in [(date(2026, 3, 29), '+02:00'), (date(2026, 10, 25), '+01:00')]:
            with self.subTest(day=day):
                before = datetime.combine(day - timedelta(days=1), datetime.min.time(), PRAGUE).replace(hour=18)
                carried = greeting(before)
                self.assertTrue(carried['nextChangeAt'].endswith('06:00:00' + offset))
                for hour in (0, 1, 2, 3, 4, 5):
                    self.assertEqual(greeting(datetime.combine(day, datetime.min.time(), PRAGUE).replace(hour=hour)), carried)
                local = datetime.combine(day, datetime.min.time(), PRAGUE).replace(hour=6)
                self.assertEqual(greeting(local), greeting(local.astimezone(timezone.utc)))
                self.assertEqual(greeting(local)['period'], 'morning')

    def test_full_year_uses_only_matching_seasons_and_visits_every_phrase(self):
        previous = None
        seen = set()
        catalog = {p['text']: p for p in load_phrases()}
        for delta in range(365):
            day = date(2026, 1, 1) + timedelta(days=delta)
            for hour in (6, 12, 18):
                result = greeting(datetime.combine(day, datetime.min.time(), PRAGUE).replace(hour=hour))
                phrase = catalog[result['text']]
                self.assertEqual(phrase['period'], result['period'])
                self.assertIn(phrase['season'], ('any', result['season']))
                self.assertNotEqual(result['text'], previous)
                previous = result['text']
                seen.add(result['text'])
        self.assertEqual(seen, set(catalog))

    def test_restart_keeps_the_same_phrase(self):
        now = datetime(2026, 11, 7, 14, tzinfo=PRAGUE)
        before = greeting(now)
        load_phrases.cache_clear()
        self.assertEqual(greeting(now), before)

    def test_mountain_combines_both_decks_and_keeps_seasonal_schedule(self):
        original = load_phrases()
        combined = load_phrases("mountain")
        self.assertEqual(len(combined), 200)
        self.assertEqual(combined[:100], original)
        self.assertEqual(len({p['text'] for p in combined}), 200)
        catalog = {p['text']: p for p in combined}
        previous, seen = None, set()
        for delta in range(365):
            day = date(2026, 1, 1) + timedelta(days=delta)
            for hour in (6, 12, 18):
                now = datetime.combine(day, datetime.min.time(), PRAGUE).replace(hour=hour)
                result = greeting(now, theme="mountain")
                phrase = catalog[result['text']]
                self.assertEqual(phrase['period'], result['period'])
                self.assertIn(phrase['season'], ('any', result['season']))
                self.assertNotEqual(result['text'], previous)
                self.assertEqual(greeting(now + timedelta(hours=5, minutes=59), theme="mountain"), result)
                if hour == 18:
                    self.assertEqual(greeting(now + timedelta(hours=11, minutes=59), theme="mountain"), result)
                self.assertEqual(greeting(now.astimezone(timezone.utc), theme="mountain"), result)
                previous = result['text']
                seen.add(result['text'])
        self.assertEqual(seen, set(catalog))
        before = greeting(now, theme="mountain")
        load_phrases.cache_clear()
        self.assertEqual(greeting(now, theme="mountain"), before)

    def test_unknown_theme_is_rejected(self):
        with self.assertRaises(ValueError):
            load_phrases("unknown")


if __name__ == '__main__':
    unittest.main()
