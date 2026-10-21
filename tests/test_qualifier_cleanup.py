"""A green browser scenario cannot hide failed owned-listener cleanup."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
import qualify_frontend as runner


class QualifierCleanupTests(unittest.TestCase):
    def test_delayed_release_is_waited_but_persistent_listener_fails(self):
        owner=Mock()
        with patch.object(runner.socket,'socket') as socket, patch.object(runner.time,'sleep'):
            socket.return_value.__enter__.return_value.connect_ex.side_effect=[0,0,1]
            runner.cleanup_owned(owner,12345)
            owner.close.assert_called_once()
            self.assertEqual(socket.call_count,3)
        with patch.object(runner.socket,'socket') as socket, patch.object(runner.time,'monotonic',side_effect=[0,3]):
            socket.return_value.__enter__.return_value.connect_ex.return_value=0
            with self.assertRaisesRegex(AssertionError,'survived'):runner.cleanup_owned(owner,12345)

    def test_report_pass_requires_cleanup_and_preserves_primary_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            output=Path(folder)
            for primary in (None,AssertionError('original scenario failure')):
                with self.subTest(primary=primary), patch.object(runner,'cleanup_owned',side_effect=RuntimeError('close failed')):
                    report={'status':'FAIL','cleanup':'PENDING'}
                    if primary is None:
                        with self.assertRaisesRegex(RuntimeError,'close failed'):runner.finish_report(report,None,1,output)
                    else:
                        runner.finish_report(report,None,1,output,primary)
                        self.assertIn('original scenario failure',report['error'])
                        self.assertIn('cleanup failed: close failed',primary.__notes__)
                    stored=json.loads((output/'result.json').read_text(encoding='utf-8'))
                    self.assertEqual((stored['status'],stored['cleanup']),('FAIL','FAIL'))
                    self.assertEqual(stored['cleanup_error'],'close failed')
            with patch.object(runner,'cleanup_owned'):
                report={};runner.finish_report(report,None,1,output)
                self.assertEqual(report,{'status':'PASS','cleanup':'PASS'})
                primary=AssertionError('suite failed')
                runner.finish_report(report,None,1,output,primary)
                self.assertEqual((report['status'],report['cleanup']),('FAIL','PASS'))
