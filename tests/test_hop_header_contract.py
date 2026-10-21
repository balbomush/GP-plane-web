import unittest
from gp_control_plane_web.core_client import hop_by_hop_header_names

class HopHeaderContractTests(unittest.TestCase):
    def test_connection_named_headers_are_hop_by_hop(self):
                self.assertEqual(
                    hop_by_hop_header_names({"Connection": "X-A4-Private", "X-A4-Private": "not-forwarded"}),
                    frozenset({
                        "connection",
                        "keep-alive",
                        "proxy-authenticate",
                        "proxy-authorization",
                        "te",
                        "trailer",
                        "transfer-encoding",
                        "upgrade",
                        "x-a4-private",
                    }),
                )
