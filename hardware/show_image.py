"""Show one 800x480 image on a Waveshare 7.5-inch V2 monochrome panel."""
import argparse
import fcntl
import importlib
import json
import os
from pathlib import Path
import sys
import signal
import time

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('image', type=Path)
parser.add_argument('--driver', choices=['epd7in5_V2', 'epd7in5_V2_old'], default='epd7in5_V2')
args = parser.parse_args()
image = Image.open(args.image)
image.load()
if image.size != (800, 480):
    parser.error(f'Expected an 800x480 image; got {image.size}')
image = image.convert('1', dither=Image.Dither.NONE)

# Both manual updates and the timer use this lock before importing GPIO code.
lock_path = Path(__file__).resolve().parents[1] / 'data/panel.lock'
lock_path.parent.mkdir(exist_ok=True)
hardware_lock = open(lock_path, 'a')
try:
    fcntl.flock(hardware_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    parser.exit(1, 'Another process is updating the panel.\n')
signal.signal(signal.SIGTERM, lambda *_: sys.exit('Display update interrupted'))

os.environ.setdefault('GPIOZERO_PIN_FACTORY', 'lgpio')
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'vendor'))
from waveshare_epd import epdconfig
driver = importlib.import_module('waveshare_epd.' + args.driver)


class BoundedEPD(driver.EPD):
    def ReadBusy(self):
        start = time.monotonic()
        saw_busy = False
        while True:
            # Waveshare's Driver HAT FAQ recommends omitting 0x71 when BUSY
            # gets stuck. Poll the dedicated BUSY GPIO without SPI commands.
            if epdconfig.digital_read(self.busy_pin) != 0:
                break
            saw_busy = True
            if time.monotonic() - start > 40:
                raise TimeoutError('Panel BUSY stayed low for 40 seconds')
            time.sleep(.01)
        print(json.dumps({'busy_released': True, 'saw_busy': saw_busy,
                          'wait_seconds': round(time.monotonic() - start, 3)}), flush=True)
        epdconfig.delay_ms(20)

    def send_data2(self, data):
        # Normalize the manufacturer's inverted buffer into actual SPI bytes.
        super().send_data2(bytes(value & 0xff for value in data))


panel = BoundedEPD()
try:
    print(f'Initializing {args.driver}…', flush=True)
    if panel.init() != 0:
        raise RuntimeError('Panel initialization failed')
    print('Sending dashboard and performing full refresh…', flush=True)
    panel.display(panel.getbuffer(image))
    print('Refresh finished. Putting the panel into deep sleep…', flush=True)
    panel.sleep()
    print('Display update complete; image remains on the panel.', flush=True)
finally:
    epdconfig.module_exit(cleanup=True)
