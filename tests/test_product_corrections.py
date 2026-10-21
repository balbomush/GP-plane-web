from __future__ import annotations
import errno,http.client,io,json,socket,tempfile,threading,time,unittest
from unittest import mock
from wsgiref.util import setup_testing_defaults
from gp_control_plane_web.cheroot_connection import WebStreamLifecycle
from gp_control_plane_web.core_client import CoreClient,CoreResponse
from gp_control_plane_web.stream_admission import ClosingIterator,StreamAdmission,stream_kind
from gp_control_plane_web.web_app import _CoreResponseStream,create_web_app

class WebProductCorrectionTests(unittest.TestCase):
    def test_abort_detaches_owned_descriptor_once_and_preserves_close_errors(self):
        for fail_close in (False, True):
            with self.subTest(fail_close=fail_close):
                events = []
                class OwnedSocket:
                    def shutdown(self, how):
                        events.append(("shutdown", how))
                    def detach(self):
                        events.append(("detach", 424242))
                        return 424242
                    def close(self):
                        raise AssertionError("detached socket wrapper must not close descriptor")
                response = mock.Mock()
                response.close.side_effect = lambda: events.append(("response-close", None))
                connection = mock.Mock()
                connection.sock = None
                connection.close.side_effect = lambda: events.append(("connection-close", None))
                upstream = CoreResponse(connection, response, OwnedSocket())
                unexpected = OSError(errno.EIO, "descriptor close failure")
                def close(descriptor):
                    events.append(("descriptor-close", descriptor))
                    if fail_close:
                        raise unexpected
                with mock.patch("gp_control_plane_web.core_client.socket.close", side_effect=close):
                    if fail_close:
                        with self.assertRaises(OSError) as caught:
                            upstream.abort()
                        self.assertIs(caught.exception, unexpected)
                    else:
                        upstream.abort()
                    upstream.abort()
                    upstream.close()
                    self.assertEqual(events, [("shutdown", socket.SHUT_RDWR), ("detach", 424242), ("descriptor-close", 424242)])
                    self.assertTrue(upstream.abort_pending)
                    upstream.finish_abort()
                    upstream.finish_abort()
                self.assertEqual(events[-2:], [("response-close", None), ("connection-close", None)])
                self.assertFalse(upstream.abort_pending)


    def test_relay_error_and_unstarted_abort_release_exactly_once(self):
        admission = StreamAdmission()
        for abort in (False, True):
            upstream = mock.Mock(spec=CoreResponse)
            upstream.response = io.BytesIO(b"")
            upstream.abort_pending = False
            stream = _CoreResponseStream(upstream, None, None, admission.acquire("sse"))
            (stream.abort if abort else stream.close)()
            stream.close()
        permits = [admission.acquire("sse"), admission.acquire("sse")]
        self.assertTrue(all(permits))
        for permit in permits:
            permit.release()
        upstream = mock.Mock(spec=CoreResponse)
        upstream.response = mock.Mock()
        upstream.response.read1.side_effect = OSError("unexpected failure")
        upstream.abort_pending = False
        stream = _CoreResponseStream(upstream, None, None, admission.acquire("sse"))
        with self.assertRaisesRegex(OSError, "unexpected failure"):
            stream.read()
        self.assertIsNotNone(admission.acquire("sse"))
        self.assertIsNotNone(admission.acquire("sse"))


    def test_early_sse_start_response_and_write_failure_close_before_handoff(self):
        def environ():
            value = {}
            setup_testing_defaults(value)
            value.update(PATH_INFO="/api/web/events/stream", HTTP_AUTHORIZATION="Bearer valid", REMOTE_ADDR="127.0.0.1", REMOTE_PORT="43210")
            return value

        for failure_at in ("start", "write"):
            with self.subTest(failure_at=failure_at), tempfile.TemporaryDirectory() as raw:
                web_lifecycle = WebStreamLifecycle()
                upstreams = []
                def open_stream(*args, **kwargs):
                    upstream = mock.Mock(spec=CoreResponse)
                    upstream.status = 200
                    upstream.headers.return_value = [("Content-Type", "text/event-stream")]
                    upstream.response = io.BytesIO(b"event: fixture\ndata: {}\n\n")
                    upstream.abort_pending = False
                    upstreams.append(upstream)
                    return upstream
                client = mock.Mock(spec=CoreClient)
                client.open_web_view.side_effect = open_stream
                verified = mock.Mock(spec=CoreResponse)
                verified.status = 200
                web = create_web_app(client, lambda _: verified, stream_lifecycle=web_lifecycle)
                failure = BrokenPipeError("header handoff failed")
                def fail_start(*_):
                    if failure_at == "start":
                        raise failure
                    def write(_):
                        raise failure
                    return write
                for app, owner in ((web, web_lifecycle),):
                    for _ in range(2):
                        with self.assertRaises(BrokenPipeError) as caught:
                            app(environ(), fail_start)
                        self.assertIs(caught.exception, failure)
                        owner.close_peer(("127.0.0.1", 43210))
                        self.assertEqual(owner.active_count(), 0)
                    statuses = []
                    def start(status, headers, exc_info=None):
                        statuses.append(status)
                        return lambda _: None
                    stream = app(environ(), start)
                    self.assertTrue(statuses[0].startswith("200"), statuses)
                    stream.close()
                    self.assertEqual(owner.active_count(), 0)
                self.assertTrue(all(item.close.call_count == 1 for item in upstreams))
