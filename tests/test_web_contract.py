"""Web-owned assertion groups formerly embedded in Core test_web_ui."""
import unittest
from unittest import mock
from gp_control_plane_web.core_client import CoreClient
from gp_control_plane_web import resource_budget,docs,http_body,web_app


class WebContractTests(unittest.TestCase):
    def test_invalid_core_url_is_rejected_before_any_listener(self):
        with mock.patch('gp_control_plane_web.http_runtime.WebHttpRuntime') as runtime:
            with self.assertRaisesRegex(ValueError,r'core_url must be an http\(s\) URL with host'):
                CoreClient('127.0.0.1:8081')
            runtime.assert_not_called()

    def test_existing_swagger_controls_are_available_with_core_offline(self):
        html=docs.swagger_ui_html()
        for text in ['SwaggerUIBundle',"url: '/openapi.json'",'persistAuthorization: true','tryItOutEnabled: true','Raw OpenAPI']:
            self.assertIn(text,html)

    def test_proxy_ingress_keeps_real_json_and_backup_budgets(self):
        self.assertEqual(resource_budget.JSON_REQUEST_MAX_BYTES,1024*1024)
        self.assertEqual(resource_budget.BACKUP_UPLOAD_MAX_BYTES,64*1024*1024)
        self.assertEqual(http_body.JSON_REQUEST_MAX_BYTES,resource_budget.JSON_REQUEST_MAX_BYTES)
        self.assertEqual(http_body.BACKUP_UPLOAD_MAX_BYTES,resource_budget.BACKUP_UPLOAD_MAX_BYTES)
        self.assertEqual(web_app.PROXY_STREAM_CHUNK_BYTES,resource_budget.PROXY_STREAM_CHUNK_BYTES)
