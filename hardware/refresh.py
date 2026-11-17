"""Render current HTML locally, then update the panel once. Run by systemd."""
import argparse
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import signal
import shutil
import subprocess
import sys
import tempfile
import time

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from display_settings import DISPLAY_DESIGNS, read_settings


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path, value):
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    os.replace(temporary, path)


def run_command(command, timeout):
    """Bound execution and clean up the renderer's browser descendants on failure."""
    with subprocess.Popen(command, cwd=ROOT, start_new_session=True) as process:
        try:
            result = process.wait(timeout=timeout)
            if result:
                raise subprocess.CalledProcessError(result, command)
        finally:
            # Chromium is a subprocess tree. Killing only Node can leave it behind.
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()


def validate_frame(image_path, metadata_path, now=None):
    with Image.open(image_path) as image:
        image.load()
        if image.size != (800, 480) or image.mode not in ('1', 'L'):
            raise ValueError('Renderer must produce an 800x480 monochrome image')
        if image.mode == 'L' and any(count for value, count in enumerate(image.histogram()) if value not in (0, 255)):
            raise ValueError('Rendered image contains gray pixels')
    data = json.loads(metadata_path.read_text())
    generated = datetime.fromisoformat(data['generatedAt'])
    age = ((now or datetime.now(timezone.utc)) - generated).total_seconds()
    if not -30 <= age <= 90:
        raise ValueError('Refusing to display a stale dashboard snapshot')
    return data


def archive_current_frame(images):
    """Preserve the original successful frame when upgrading from the old worker."""
    try:
        previous = json.loads((images / 'dashboard.json').read_text())
        design = previous.get('design')
        if design in DISPLAY_DESIGNS and not (images / f'{design}.png').exists():
            shutil.copyfile(images / 'dashboard.png', images / f'{design}.png')
            shutil.copyfile(images / 'dashboard.json', images / f'{design}.json')
    except (FileNotFoundError, ValueError):
        pass


def refresh(root=ROOT, design=None, url='http://127.0.0.1:8787', render_only=False):
    root = Path(root)
    data_dir, images = root / 'data', root / 'images'
    data_dir.mkdir(exist_ok=True)
    images.mkdir(exist_ok=True)
    with open(data_dir / 'refresh.lock', 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Refresh already running; skipping overlapping invocation.', flush=True)
            return
        from_settings = design is None
        if from_settings:
            design = read_settings(root)['design']
        if design not in (*DISPLAY_DESIGNS, 'daily', 'weather'):
            raise ValueError('Unsupported dashboard design')
        if not render_only:
            archive_current_frame(images)
        status_path = data_dir / ('render-status.json' if render_only else 'display-status.json')
        try:
            previous = json.loads(status_path.read_text())
        except (OSError, ValueError):
            previous = {}
        started = time.monotonic()
        print(f'Refresh started: design={design} render_only={render_only}', flush=True)
        status = {'state': 'rendering', 'startedAt': utc_now(),
                  'lastSuccess': previous.get('lastSuccess'), 'design': design,
                  'lastDisplayedDesign': previous.get('lastDisplayedDesign') or (previous.get('design') if previous.get('state') == 'ok' else None)}
        atomic_json(status_path, status)
        try:
            with tempfile.TemporaryDirectory(prefix='.refresh-', dir=images) as temporary:
                frame = Path(temporary) / 'dashboard.png'
                metadata = Path(temporary) / 'dashboard.json'
                run_command(['node', str(root / 'scripts/render.mjs'), f'--design={design}',
                             f'--url={url}', f'--output={frame}', f'--metadata={metadata}'], timeout=90)
                snapshot = validate_frame(frame, metadata)
                print(f'Frame validated: generatedAt={snapshot["generatedAt"]} '
                      f'render_seconds={time.monotonic() - started:.2f}', flush=True)
                if not render_only:
                    if from_settings and read_settings(root)['design'] != design:
                        status.update(state='superseded', finishedAt=utc_now())
                        atomic_json(status_path, status)
                        print('Dashboard choice changed during rendering; keeping the current screen until the next refresh.', flush=True)
                        return
                    status['state'] = 'updating'
                    atomic_json(status_path, status)
                    run_command([sys.executable, str(root / 'hardware/show_image.py'), str(frame)], timeout=145)
                # A render-only check must not replace the record of the shown image.
                name = 'preview' if render_only else 'dashboard'
                if render_only:
                    os.replace(frame, images / f'{name}.png')
                    os.replace(metadata, images / f'{name}.json')
                else:
                    for source, extension in ((frame, 'png'), (metadata, 'json')):
                        saved = images / f'{design}.{extension}'
                        os.replace(source, saved)
                        active = images / f'.dashboard.{extension}.next'
                        shutil.copyfile(saved, active)
                        os.replace(active, images / f'dashboard.{extension}')
                status.update(state='rendered' if render_only else 'ok',
                              generatedAt=snapshot['generatedAt'],
                              weather=snapshot['weather']['status'], transit=snapshot['transit']['status'],
                              durationSeconds=round(time.monotonic() - started, 2), finishedAt=utc_now())
                if not render_only:
                    status['lastSuccess'] = status['finishedAt']
                    status['lastDisplayedDesign'] = design
                atomic_json(status_path, status)
                print(json.dumps(status), flush=True)
        except Exception as error:
            status.update(state='error', error=f'{type(error).__name__}: {error}', finishedAt=utc_now())
            atomic_json(status_path, status)
            raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--design', choices=('station', 'mountain', 'daily', 'weather'), default=None,
                        help='One-off override; otherwise use the saved physical-dashboard choice')
    parser.add_argument('--url', default='http://127.0.0.1:8787')
    parser.add_argument('--render-only', action='store_true', help='Verify rendering without accessing GPIO')
    args = parser.parse_args()
    refresh(design=args.design, url=args.url, render_only=args.render_only)
