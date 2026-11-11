"""Saved physical-dashboard choice, shared by the HTTP server and minute worker."""
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parent
DISPLAY_CHOICES = (
    {'id': 'station', 'name': 'Little Adventure', 'preview': '/?design=station'},
    {'id': 'mountain', 'name': 'Daylight Mountain', 'preview': '/worlds.html?view=mountain'},
)
DISPLAY_DESIGNS = tuple(choice['id'] for choice in DISPLAY_CHOICES)


def read_settings(root=ROOT):
    path = Path(root) / 'data/display-settings.json'
    try:
        value = json.loads(path.read_text())
    except FileNotFoundError:
        return {'design': 'station', 'updatedAt': None}
    if not isinstance(value, dict) or value.get('design') not in DISPLAY_DESIGNS:
        raise ValueError('Unsupported saved dashboard choice')
    return value


def save_design(design, root=ROOT):
    if design not in DISPLAY_DESIGNS:
        raise ValueError('Choose station or mountain')
    data = Path(root) / 'data'
    data.mkdir(exist_ok=True)
    with open(data / 'display-settings.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        settings = {'design': design, 'updatedAt': datetime.now(timezone.utc).isoformat()}
        descriptor, temporary = tempfile.mkstemp(prefix='.display-settings-', dir=data)
        try:
            with os.fdopen(descriptor, 'w') as target:
                json.dump(settings, target)
                target.flush()
                os.fsync(target.fileno())
            os.replace(temporary, data / 'display-settings.json')
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    return settings
