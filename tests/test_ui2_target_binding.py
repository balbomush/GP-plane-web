"""Client update IDs are scoped to the configured Core, never just a Web port."""
import re
import unittest
from gp_control_plane_web.core_client import CoreClient
from gp_control_plane_web.web_app import create_web_app, WebAssets


class TargetBindingTests(unittest.TestCase):
    def target(self, url):
        app = create_web_app(CoreClient(url), assets=WebAssets(index=lambda: '<html><head></head></html>'))
        body = app.routes[0].callback().body.decode('utf8')
        match = re.search(r'<meta name="gp-core-target" content="([a-f0-9]{64})">', body)
        self.assertIsNotNone(match, 'No configured Core identity in shell')
        self.assertNotIn(url, body)
        return match.group(1)

    def test_same_target_stable_changed_target_separate(self):
        self.assertEqual(self.target('http://127.0.0.1:8081'), self.target('http://127.0.0.1:8081/'))
        self.assertNotEqual(self.target('http://127.0.0.1:8081'), self.target('http://127.0.0.1:8082'))
