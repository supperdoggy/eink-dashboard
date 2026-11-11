from datetime import datetime, timedelta, timezone
import fcntl
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image
from hardware.refresh import refresh, validate_frame
from display_settings import save_design


class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.now = datetime.now(timezone.utc)

    def tearDown(self):
        self.temp.cleanup()

    def write_frame(self, frame, metadata, age=0, gray=False):
        Image.new('L', (800, 480), 128 if gray else 255).save(frame)
        metadata.write_text(json.dumps({
            'generatedAt': (self.now - timedelta(seconds=age)).isoformat(),
            'weather': {'status': 'stale'}, 'transit': {'status': 'ok'},
        }))

    def fake_render(self, command, timeout):
        options = dict(arg[2:].split('=', 1) for arg in command if arg.startswith('--'))
        self.write_frame(Path(options['output']), Path(options['metadata']))

    def test_invalid_or_old_frame_is_rejected(self):
        frame, metadata = self.root / 'frame.png', self.root / 'frame.json'
        self.write_frame(frame, metadata, age=120)
        with self.assertRaisesRegex(ValueError, 'stale'):
            validate_frame(frame, metadata, self.now)
        self.write_frame(frame, metadata, gray=True)
        with self.assertRaisesRegex(ValueError, 'gray'):
            validate_frame(frame, metadata, self.now)

    @patch('hardware.refresh.run_command')
    def test_failed_render_preserves_last_image_and_never_touches_gpio(self, run):
        (self.root / 'images').mkdir()
        previous = self.root / 'images/dashboard.png'
        previous.write_bytes(b'last successful image')
        run.side_effect = subprocess.CalledProcessError(1, ['node'])
        with self.assertRaises(subprocess.CalledProcessError):
            refresh(self.root)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(previous.read_bytes(), b'last successful image')
        self.assertEqual(json.loads((self.root / 'data/display-status.json').read_text())['state'], 'error')

    @patch('hardware.refresh.run_command')
    def test_driver_failure_does_not_publish_unshown_image(self, run):
        (self.root / 'images').mkdir()
        previous = self.root / 'images/dashboard.png'
        previous.write_bytes(b'last successful image')
        def command(args, timeout):
            if args[0] == 'node':
                self.fake_render(args, timeout)
            else:
                raise subprocess.CalledProcessError(1, args)
        run.side_effect = command
        with self.assertRaises(subprocess.CalledProcessError):
            refresh(self.root)
        self.assertEqual(run.call_count, 2)
        self.assertEqual(previous.read_bytes(), b'last successful image')

    @patch('hardware.refresh.run_command')
    def test_success_displays_new_frame_and_records_sources(self, run):
        def command(args, timeout):
            if args[0] == 'node':
                self.fake_render(args, timeout)
            else:
                self.assertTrue(Path(args[-1]).exists())
                self.assertFalse((self.root / 'images/dashboard.png').exists())
        run.side_effect = command
        refresh(self.root)
        self.assertEqual(run.call_count, 2)
        status = json.loads((self.root / 'data/display-status.json').read_text())
        self.assertEqual(status['state'], 'ok')
        self.assertEqual(status['weather'], 'stale')
        self.assertEqual(status['transit'], 'ok')
        self.assertIsNotNone(status['lastSuccess'])
        self.assertTrue((self.root / 'images/dashboard.png').exists())

    @patch('hardware.refresh.run_command')
    def test_render_only_keeps_display_record_and_avoids_gpio(self, run):
        (self.root / 'images').mkdir()
        previous = self.root / 'images/dashboard.png'
        previous.write_bytes(b'last successful image')
        run.side_effect = self.fake_render
        refresh(self.root, render_only=True)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(previous.read_bytes(), b'last successful image')
        self.assertTrue((self.root / 'images/preview.png').exists())
        self.assertFalse((self.root / 'data/display-status.json').exists())

    @patch('hardware.refresh.run_command')
    def test_saved_choice_is_read_for_each_refresh_and_images_remain_separate(self, run):
        def command(args, timeout):
            if args[0] == 'node':
                self.fake_render(args, timeout)
        run.side_effect = command
        save_design('station', self.root)
        refresh(self.root)
        previous = (self.root / 'images/station.png').read_bytes()
        save_design('mountain', self.root)
        refresh(self.root)
        render_calls = [call.args[0] for call in run.call_args_list if call.args[0][0] == 'node']
        self.assertIn('--design=station', render_calls[0])
        self.assertIn('--design=mountain', render_calls[1])
        self.assertEqual((self.root / 'images/station.png').read_bytes(), previous)
        self.assertTrue((self.root / 'images/mountain.png').exists())
        status = json.loads((self.root / 'data/display-status.json').read_text())
        self.assertEqual(status['lastDisplayedDesign'], 'mountain')

    @patch('hardware.refresh.run_command')
    def test_choice_changed_during_render_is_not_sent_to_panel(self, run):
        save_design('station', self.root)
        def command(args, timeout):
            self.fake_render(args, timeout)
            save_design('mountain', self.root)
        run.side_effect = command
        refresh(self.root)
        self.assertEqual(run.call_count, 1)
        self.assertFalse((self.root / 'images/dashboard.png').exists())
        status = json.loads((self.root / 'data/display-status.json').read_text())
        self.assertEqual(status['state'], 'superseded')

    @patch('hardware.refresh.run_command')
    def test_overlapping_refresh_is_skipped(self, run):
        (self.root / 'data').mkdir()
        with open(self.root / 'data/refresh.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            refresh(self.root)
        run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
