"""Web-owned CoreClient assertions; parent owns actual headless Core fixture."""
import http.client,json,os,select,unittest
from unittest import mock
from gp_control_plane_web.core_client import CoreClient
class SegmentedClientTests(unittest.TestCase):
    def test_segmented_body_auth_rejection_is_complete_and_connection_is_single_use(self):
            observed = []
            base_connection = http.client.HTTPConnection
            class SegmentedConnection(base_connection):
                def putheader(self, header, *values):
                    if header.lower() == "connection":
                        observed.append(("connection", values[0]))
                    return super().putheader(header, *values)

                def send(self, data):
                    if data == b"{}":
                        # Send headers first. A body-bearing rejection must wait
                        # for its two already-bounded request bytes before replying.
                        observed.append(("reply_before_body", bool(select.select([self.sock], [], [], 0.1)[0])))
                    return super().send(data)

            with mock.patch("gp_control_plane_web.core_client.http.client.HTTPConnection", SegmentedConnection):
                port=int(__import__("urllib.parse",fromlist=["urlsplit"]).urlsplit(os.environ["GP_TEST_CORE_URL"]).port)
                client = CoreClient(f"http://127.0.0.1:{port}")
                upstream = client.open("POST", "/api/core/strategy-discovery/stop-current-run", body=b"{}", headers={"Content-Type": "application/json"})
                owned_socket = upstream.response_socket
                connection = upstream.connection
                try:
                    self.assertEqual(upstream.status, 401)
                    headers = dict((key.lower(), value) for key, value in upstream.headers())
                    body = upstream.response.read()
                    self.assertEqual(len(body), int(headers["content-length"]))
                    self.assertEqual(json.loads(body)["error"]["code"], "authentication_required")
                    self.assertEqual(headers["www-authenticate"], "Bearer")
                finally:
                    upstream.close()
                    upstream.close()
                self.assertEqual(observed, [("connection", "keep-alive"), ("reply_before_body", False)])
                self.assertIsNone(connection.sock)
                self.assertEqual(owned_socket.fileno(), -1)
                self.assertIsNone(upstream.connection)
                observed.clear()
                upstream = client.open("GET", "/api/web/events/stream")
                try:
                    self.assertEqual(upstream.status, 401)
                    upstream.response.read()
                finally:
                    upstream.close()
                self.assertEqual(observed, [("connection", "close")])
if __name__=="__main__":unittest.main()
