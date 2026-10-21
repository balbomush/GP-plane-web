"""Exercise the real listener process and its non-daemon worker teardown."""
from __future__ import annotations

import os
from contextlib import nullcontext
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request


@unittest.skipUnless(sys.platform == 'linux', 'requires native Linux SIGINT semantics')
class ListenerInterruptTests(unittest.TestCase):
    def test_web_cli_sigint_reaps_listener_workers(self) -> None:
        self._assert_sigint(active_stream=False)

    def test_web_cli_sigint_reaps_active_sse_worker(self) -> None:
        self._assert_sigint(active_stream=True)

    def _assert_sigint(self, *, active_stream: bool) -> None:
        from tests.test_a5_web_transport import _running_controlled_stream_core

        core = _running_controlled_stream_core() if active_stream else nullcontext(1)
        with core as core_port, tempfile.TemporaryDirectory() as raw:
            with socket.socket() as reservation:
                reservation.bind(('127.0.0.1', 0))
                port = reservation.getsockname()[1]
            source = Path(__file__).resolve().parents[1] / 'src'
            env = {**os.environ, 'HOME':raw}
            env.pop('PYTHONPATH',None)
            if os.environ.get('GP_TEST_INSTALLED')!='1':env['PYTHONPATH']=str(source)
            with open(Path(raw)/'web.log', 'w+') as log:
                process = subprocess.Popen([
                    sys.executable, '-c',
                    'from gp_control_plane_web.cli import main; raise SystemExit(main())',
                    '--host','127.0.0.1',
                    '--port',str(port),'--core-url',f'http://127.0.0.1:{core_port}',
                ], env=env, stdout=log, stderr=subprocess.STDOUT)
                stream = None
                try:
                    deadline = time.monotonic()+10
                    while True:
                        self.assertIsNone(process.poll(), 'listener exited before readiness')
                        try:
                            with urllib.request.urlopen(f'http://127.0.0.1:{port}/',timeout=.5) as reply:
                                self.assertEqual(reply.status,200)
                                self.assertTrue(reply.read())
                            break
                        except (OSError, urllib.error.URLError):
                            if time.monotonic() >= deadline:
                                self.fail('listener did not become ready')
                            time.sleep(.02)
                    if active_stream:
                        stream = urllib.request.urlopen(urllib.request.Request(
                            f'http://127.0.0.1:{port}/api/web/events/stream',
                            headers={'Authorization':'Bearer transport-probe'},
                        ), timeout=2)
                        self.assertEqual(stream.status,200)
                        self.assertEqual(stream.headers.get_content_type(),'text/event-stream')
                        self.assertTrue(stream.readline().startswith(b'event: probe'))
                        self.assertIsNone(process.poll())
                        # Keep both upstream and downstream open until after
                        # SIGINT. The listener must release its active worker.
                    process.send_signal(signal.SIGINT)
                    # Standalone Web CLI (accepted S2A) handles SIGINT and returns
                    # zero after runtime.stop. A lingering non-daemon worker
                    # still keeps this actual process alive beyond the bound.
                    self.assertEqual(process.wait(timeout=10),0)
                finally:
                    if process.poll() is None:
                        process.kill()
                        process.wait(timeout=5)
                    if stream is not None:
                        stream.close()


if __name__ == '__main__':
    unittest.main()
