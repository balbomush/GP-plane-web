"""Hash-qualified preparation must precede independent Web activation."""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]

class RuntimeLockInstallTests(unittest.TestCase):
    def test_one_prepared_runtime_stays_at_its_final_path(self):
        script=(ROOT/'scripts/install-linux.sh').read_text(encoding='utf-8')
        lock_check='--require-hashes -r "$prepare/runtime.lock"'
        self.assertEqual(1,script.count(lock_check))
        self.assertIn('install -m 0644 "$RUNTIME_LOCK" "$prepare/runtime.lock"',script)
        self.assertIn('cmp -s "$RUNTIME_LOCK" "$prepare/runtime.lock"',script)
        self.assertLess(script.index('exit 0'),script.index('RUNTIME_LOCK='),'remove must not require runtime inputs')
        boundary=script.index('# Switching boundary:')
        self.assertLess(script.index(lock_check),boundary)
        self.assertEqual(1,script.count('--no-deps --find-links "$WHEELHOUSE" "$WHEEL"'))
        self.assertIn('pip_user "$runtime/.venv/bin/python" check',script)
        self.assertIn('ln -s -- "$runtime/.venv" "$root/.venv"',script)
        self.assertNotIn('pip_user ',script[boundary:])
        self.assertNotIn('-m venv',script[boundary:])
        self.assertLess(script.index('systemctl is-active --quiet'),script.index('rm -rf --one-file-system -- "$previous"'))

if __name__=='__main__':unittest.main()
