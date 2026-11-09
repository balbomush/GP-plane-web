"""Public API2 routing must not depend on Core-private Web facades."""
import unittest
from unittest.mock import patch
from gp_control_plane_web.routes import route_for, openapi_operations
from gp_control_plane_web.stream_admission import stream_kind
from gp_control_plane_web.http_body import request_body_limit
from gp_control_plane_web.web_app import core_auth_adapter
from gp_control_plane_web.core_client import CoreClient


class Api2ContractTests(unittest.TestCase):
    def test_all_public_methods_including_dynamic_put_and_delete(self):
        self.assertEqual(41,len(openapi_operations()))
        for method,path in [('POST','/api/v2/access/authentication'),('PUT','/api/v2/access/change_password'),
                            ('DELETE','/api/v2/data/runs/run-123'),('PUT','/api/v2/data/domain-lists/7'),
                            ('GET','/api/v2/data/strategies/abc/archive')]:
            self.assertIsNotNone(route_for(method,path),(method,path))
        for path in ('/api/internal/auth/verify-bearer','/api/web/status','/api/core/status','/api/v2/unknown'):
            self.assertIsNone(route_for('GET',path))

    def test_stream_and_upload_budgets_follow_api2(self):
        self.assertEqual('sse',stream_kind('GET','/api/v2/search/events'))
        self.assertEqual('long',stream_kind('GET','/api/v2/data/strategies/abc/archive'))
        self.assertEqual('long',stream_kind('GET','/api/v2/backup/file'))
        self.assertEqual(64*1024*1024,request_body_limit('/api/v2/backup/restore-file'))
        self.assertEqual(1024*1024,request_body_limit('/api/v2/engines/blockcheck2/start'))

    def test_unknown_path_auth_check_is_public_core_operation(self):
        client=CoreClient('http://127.0.0.1:8081')
        with patch.object(client,'open') as opened:
            core_auth_adapter(client)({'Authorization':'Bearer example'})
        opened.assert_called_once_with('GET','/api/v2/service/status',headers={'Authorization':'Bearer example'})
