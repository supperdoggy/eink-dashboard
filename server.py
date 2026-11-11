"""Local dashboard server. No production Python packages required."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import threading
from urllib.parse import parse_qs, urlparse

from dashboard import snapshot
from display_settings import DISPLAY_CHOICES, read_settings, save_design
from scripts.sync_transit import needs_sync, sync

ROOT = Path(__file__).resolve().parent
DESIGNS = ("daily", "weather", "station", "transmission", "courtyard", "petrol", "comic", "mountain")
render_lock = threading.Lock()


def display_configuration():
    settings = read_settings(ROOT)
    try:
        status = json.loads((ROOT / 'data/display-status.json').read_text())
    except (FileNotFoundError, ValueError):
        status = {'state': 'not-started'}
    return {**settings, 'choices': DISPLAY_CHOICES, 'display': status,
            'hardwareEnabled': os.environ.get('EINK_HARDWARE') == '1'}


def request_display_refresh():
    """Start only the fixed, installed service; the timer also retries each minute."""
    if os.environ.get('EINK_HARDWARE') != '1':
        return False
    try:
        subprocess.run(['/usr/bin/sudo', '-n', '/usr/bin/systemctl', 'start', '--no-block', 'eink-refresh.service'],
                       check=True, timeout=10, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except (OSError, subprocess.SubprocessError):
        return False


def maintain_timetable():
    while True:
        try:
            if needs_sync():
                sync()
        except Exception as error:
            print(f'Timetable refresh failed; keeping the previous database: {type(error).__name__}', flush=True)
        # The old DB is replaced atomically; readers can continue during refresh.
        threading.Event().wait(3600)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "public"), **kwargs)

    def send_bytes(self, body, mime, status=200, attachment=None):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if attachment:
            self.send_header("Content-Disposition", f'attachment; filename="{attachment}"')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/display/settings":
            try:
                self.send_bytes(json.dumps(display_configuration()).encode(), 'application/json')
            except (OSError, ValueError):
                self.send_bytes(b'{"error":"Cannot read the saved display choice."}', 'application/json', 503)
        elif parsed.path == "/api/dashboard":
            self.send_bytes(json.dumps(snapshot()).encode(), "application/json; charset=utf-8")
        elif parsed.path == "/api/display":
            try:
                self.send_bytes((ROOT / "data/display-status.json").read_bytes(), "application/json")
            except FileNotFoundError:
                self.send_bytes(b'{"state":"not-started"}', "application/json")
        elif parsed.path == "/display.png":
            try:
                self.send_bytes((ROOT / "images/dashboard.png").read_bytes(), "image/png")
            except FileNotFoundError:
                self.send_bytes(b"No completed display update yet", "text/plain", 503)
        elif parsed.path == "/api/render":
            design = parse_qs(parsed.query).get("design", ["station"])[0]
            if design not in DESIGNS:
                self.send_bytes(b"Unknown design", "text/plain", 400)
                return
            output = ROOT / "data" / f"export-{design}.png"
            output.parent.mkdir(exist_ok=True)
            try:
                with render_lock:
                    subprocess.run(["node", str(ROOT / "scripts/render.mjs"), f"--design={design}",
                                    f"--output={output}", f"--url=http://127.0.0.1:{self.server.server_port}"],
                                   check=True, timeout=60, cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    self.send_bytes(output.read_bytes(), "image/png", attachment=f"{design}-800x480.png")
            except (subprocess.SubprocessError, OSError):
                self.send_bytes(b"PNG export needs npm install and Chrome/Chromium. See README.md for CHROME_PATH.", "text/plain", 503)
        elif parsed.path == "/health":
            self.send_bytes(b'{"status":"ok"}', "application/json")
        else:
            super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != '/api/display/settings':
            self.send_bytes(b'{"error":"Unknown endpoint."}', 'application/json', 404)
            return
        origin = self.headers.get('Origin')
        if origin and urlparse(origin).netloc.lower() != self.headers.get('Host', '').lower():
            self.send_bytes(b'{"error":"Use the dashboard page to change the display."}', 'application/json', 403)
            return
        if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/json':
            self.send_bytes(b'{"error":"Send a JSON dashboard choice."}', 'application/json', 415)
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 1024:
                raise ValueError('Invalid request size')
            value = json.loads(self.rfile.read(length))
            if not isinstance(value, dict):
                raise ValueError('Expected an object')
            save_design(value.get('design'), ROOT)
        except (ValueError, TypeError):
            self.send_bytes(b'{"error":"Choose Little Adventure or Daylight Mountain."}', 'application/json', 400)
            return
        except OSError:
            self.send_bytes(b'{"error":"Cannot save the display choice. Try again."}', 'application/json', 503)
            return
        queued = request_display_refresh()
        self.send_bytes(json.dumps({**display_configuration(), 'refreshQueued': queued}).encode(), 'application/json', 202)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    threading.Thread(target=maintain_timetable, daemon=True).start()
    print(f"Dashboard: http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
