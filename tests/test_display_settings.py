from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

import server
from display_settings import read_settings, save_design


class DisplaySettingsTests(unittest.TestCase):
    def test_default_and_persistence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(read_settings(root)['design'], 'station')
            save_design('mountain', root)
            self.assertEqual(read_settings(Path(directory))['design'], 'mountain')
            save_design('station', root)
            self.assertEqual(read_settings(root)['design'], 'station')

    def test_invalid_choice_cannot_replace_a_saved_dashboard(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            save_design('mountain', root)
            with self.assertRaises(ValueError):
                save_design('../../other', root)
            self.assertEqual(read_settings(root)['design'], 'mountain')


class DisplaySettingsApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.root_patch = patch.object(server, 'ROOT', self.root)
        self.root_patch.start()
        self.refresh_patch = patch.object(server, 'request_display_refresh', return_value=True)
        self.refresh = self.refresh_patch.start()
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.refresh_patch.stop()
        self.root_patch.stop()
        self.temp.cleanup()

    def request(self, method, body=None, headers=None):
        connection = HTTPConnection('127.0.0.1', self.http.server_port, timeout=5)
        try:
            connection.request(method, '/api/display/settings', body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def test_api_saves_both_options_and_requests_refresh(self):
        status, value = self.request('GET')
        self.assertEqual(status, 200)
        self.assertEqual(value['design'], 'station')
        for design in ('mountain', 'station'):
            status, value = self.request('POST', json.dumps({'design': design}), {'Content-Type': 'application/json'})
            self.assertEqual(status, 202)
            self.assertEqual(value['design'], design)
            self.assertTrue(value['refreshQueued'])
            self.assertEqual(self.request('GET')[1]['design'], design)
        self.assertEqual(self.refresh.call_count, 2)

    def test_cross_origin_and_non_json_actions_are_rejected(self):
        for headers, expected in (
            ({'Content-Type': 'application/json', 'Origin': 'https://another.example'}, 403),
            ({'Content-Type': 'text/plain'}, 415),
        ):
            status, _ = self.request('POST', '{"design":"mountain"}', headers)
            self.assertEqual(status, expected)
        self.assertEqual(read_settings(self.root)['design'], 'station')
        self.refresh.assert_not_called()

    def test_bad_json_and_unknown_design_leave_setting_unchanged(self):
        save_design('mountain', self.root)
        for body in ('{broken', '{"design":"comic"}', '[]'):
            status, _ = self.request('POST', body, {'Content-Type': 'application/json'})
            self.assertEqual(status, 400)
        self.assertEqual(read_settings(self.root)['design'], 'mountain')
        self.refresh.assert_not_called()
