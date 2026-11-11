"""A small fictional world, remembering real model weather on the local disk."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
import threading
from zoneinfo import ZoneInfo

PRAGUE = ZoneInfo('Europe/Prague')
STATE = Path(__file__).resolve().parent / 'data/world.json'
LOCK = threading.RLock()
RAIN_CODES = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99}
SNOW_CODES = {71, 73, 75, 77, 85, 86}
STORY = (
    'Signal found. Someone has left a light on.',
    'A second cup appeared beside the receiver.',
    'The cat is listening to an empty frequency.',
    'At dawn, a reply arrived from the courtyard.',
    'It said: the bench remembers everyone.',
    'A small key turned up beneath the plant pot.',
    'The key opens nothing we have found. Yet.',
    'Tonight, the receiver is warm without power.',
    'Someone has been drawing a mountain on the map.',
    'The road on the map now has a petrol station.',
    'A van arrived with no driver. The tea was still hot.',
    'In the glove box: a postcard of this very window.',
    'The cat has been here before. It knows the way.',
    'We are leaving the light on for whoever comes next.',
)


def pick(value, size):
    return int.from_bytes(hashlib.sha256(value.encode()).digest()[:4], 'big') % size


def finite(value):
    return isinstance(value, (int, float)) and math.isfinite(value)


def evolve(saved, weather, now):
    """Pure transition function; the weather-study UI never calls this with fixtures."""
    local = now.astimezone(PRAGUE)
    day = local.date().isoformat()
    state = deepcopy(saved) if saved else {
        'version': 1, 'born': day, 'lastObservation': None, 'lastWetAt': None,
        'leaf': {'position': 0, 'bearing': None, 'visible': local.month in (9, 10, 11)},
        'journal': [],
    }
    elapsed_days = (local.date() - datetime.fromisoformat(state['born']).date()).days
    sequence = max(0, elapsed_days)
    if not state['journal'] or state['journal'][-1]['date'] != day:
        cycle, chapter = divmod(sequence, len(STORY))
        message = STORY[chapter] if not cycle else (
            'The receiver has a new message: ' + (
                'leave room for a visitor.', 'the key is still under the pot.',
                'the road keeps going.', 'the cat has chosen the windowsill again.',
                'someone remembers the light.', 'listen again tomorrow.',
            )[pick(day, 6)])
        state['journal'].append({'date': day, 'transmission': 174 + sequence, 'message': message})
        state['journal'] = state['journal'][-30:]
    current = weather.get('current') or {}
    observed = current.get('time')
    # A stale forecast must not create new puddles or wind events.
    previous_observation = state['lastObservation']
    if (weather.get('status') == 'ok' and finite(observed)
            and -300 <= now.timestamp() - observed <= 3600
            and (previous_observation is None or observed > previous_observation)):
        state['lastObservation'] = observed
        wet = current.get('weather_code') in RAIN_CODES
        if finite(current.get('precipitation')):
            wet = wet or (current['precipitation'] > 0 and current.get('weather_code') not in SNOW_CODES)
        if wet:
            state['lastWetAt'] = observed
        speed, bearing = current.get('wind_speed_10m'), current.get('wind_direction_10m')
        leaf = state['leaf']
        if finite(speed) and finite(bearing):
            previous = leaf['bearing']
            change = 0 if previous is None else abs((bearing - previous + 180) % 360 - 180)
            if previous is None:
                leaf['bearing'] = bearing
            elif speed >= 14 and change >= 50:
                leaf['position'] = (leaf['position'] + 1 + pick(str(observed), 2)) % 4
                leaf['bearing'] = bearing
    return state


def describe(state, weather, now):
    local = now.astimezone(PRAGUE)
    current = weather.get('current') or {}
    wet_at = state['lastWetAt']
    wet_age = max(0, now.timestamp() - wet_at) if wet_at is not None else None
    puddles = wet_age is not None and wet_age < 18 * 3600
    period = 'morning' if 6 <= local.hour < 12 else 'afternoon' if 12 <= local.hour < 18 else 'evening'
    code = current.get('weather_code')
    cold = finite(current.get('apparent_temperature')) and current['apparent_temperature'] < 8
    cat_spot = 'windowsill' if period == 'evening' or code in RAIN_CODES | SNOW_CODES or cold else (
        'bench' if pick(local.date().isoformat() + period, 3) else 'doorstep')
    # Vehicle and episode choices are stable throughout each three-hour interval.
    slot = f'{local.date().isoformat()}:{local.hour // 3}'
    if puddles:
        memory = 'Rain left a puddle. The courtyard kept it.' if wet_age >= 3600 else 'Fresh rain is leaving its mark.'
    elif state['lastWetAt'] is not None:
        memory = 'The puddle has dried. The cat has not noticed.'
    else:
        memory = 'The courtyard is getting to know the weather.'
    return {
        'status': 'ok', 'fictional': True, 'born': state['born'],
        'transmission': state['journal'][-1]['transmission'], 'message': state['journal'][-1]['message'],
        'journal': state['journal'][-5:], 'puddles': puddles, 'lastWetAt': wet_at,
        'lastObservation': state['lastObservation'], 'leaf': state['leaf'],
        'cat': {'name': 'Miso', 'spot': cat_spot, 'favourite': 'windowsill'},
        'vehicle': ('none', 'hatchback', 'van', 'motorbike', 'hatchback')[pick(slot, 5)],
        'episode': (local.date().toordinal() * 8 + local.hour // 3) % 3,
        'period': period, 'memory': memory,
        'connections': {'nas': 'not-connected', 'indoor': 'not-connected'},
    }


def world_snapshot(weather, now=None, path=STATE):
    now = now or datetime.now(timezone.utc)
    path = Path(path)
    with LOCK:
        try:
            saved = json.loads(path.read_text())
            if saved.get('version') != 1 or not isinstance(saved.get('journal'), list):
                raise ValueError('Unsupported world state')
        except FileNotFoundError:
            saved = None
        state = evolve(saved, weather, now)
        if state != saved:
            path.parent.mkdir(exist_ok=True)
            descriptor, temporary = tempfile.mkstemp(prefix='.world-', dir=path.parent)
            try:
                with os.fdopen(descriptor, 'w') as target:
                    json.dump(state, target)
                    target.flush()
                    os.fsync(target.fileno())
                os.replace(temporary, path)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
        return describe(state, weather, now)
