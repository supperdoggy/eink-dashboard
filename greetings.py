"""Three seasonal greetings per Prague-local day, stable across restarts."""
from datetime import datetime, timedelta, time
from functools import lru_cache
import hashlib
import json
from pathlib import Path
from zoneinfo import ZoneInfo

PRAGUE = ZoneInfo("Europe/Prague")
PHRASES_PATH = Path(__file__).resolve().parent / "public/phrases.json"
MOUNTAIN_PHRASES_PATH = PHRASES_PATH.with_name("mountain-phrases.json")
PERIODS = ((6, "morning"), (12, "afternoon"), (18, "evening"))


def season_for(day):
    return ("winter", "winter", "spring", "spring", "spring", "summer",
            "summer", "summer", "autumn", "autumn", "autumn", "winter")[day.month - 1]


@lru_cache(maxsize=2)
def load_phrases(theme="adventure"):
    if theme not in ("adventure", "mountain"):
        raise ValueError("Unknown greeting theme")
    phrases = json.loads(PHRASES_PATH.read_text(encoding="utf-8"))
    if theme == "mountain":
        phrases += json.loads(MOUNTAIN_PHRASES_PATH.read_text(encoding="utf-8"))
    if not phrases or len({p["text"] for p in phrases}) != len(phrases):
        raise ValueError("Greeting phrases must be nonempty and unique")
    for p in phrases:
        if p["season"] not in ("any", "spring", "summer", "autumn", "winter") or p["period"] not in ("morning", "afternoon", "evening"):
            raise ValueError("Unknown greeting season or time period")
    return phrases


def greeting(now=None, theme="adventure"):
    local = now or datetime.now(PRAGUE)
    if local.tzinfo is None:
        raise ValueError("A greeting timestamp must include its timezone")
    local = local.astimezone(PRAGUE)
    # Carry yesterday's evening into the night, including over month/year changes.
    cycle_day = local.date() - timedelta(days=1) if local.hour < 6 else local.date()
    start_hour, period = next(((h, p) for h, p in reversed(PERIODS) if local.hour >= h), PERIODS[-1])
    season = season_for(cycle_day)
    pool = [p for p in load_phrases(theme) if p["period"] == period and p["season"] in ("any", season)]
    # A stable shuffled deck visits every eligible phrase before it repeats.
    pool.sort(key=lambda p: hashlib.sha256(f'{season}/{period}/{p["text"]}'.encode()).digest())
    phrase = pool[cycle_day.toordinal() % len(pool)]
    start = datetime.combine(cycle_day, time(start_hour), PRAGUE)
    next_day = cycle_day + timedelta(days=1) if period == "evening" else cycle_day
    next_hour = 6 if period == "evening" else start_hour + 6
    return {"text": phrase["text"], "season": season, "period": period,
            "startsAt": start.isoformat(), "nextChangeAt": datetime.combine(next_day, time(next_hour), PRAGUE).isoformat()}
