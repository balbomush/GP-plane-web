"""Hash-qualified preparation must precede independent Web activation."""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]

class RuntimeLockInstallTests(unittest.TestCase):
    def test_one_staged_lock_for_prepared_and_final_runtime(self):
        script=(ROOT/'scripts/install-linux.sh').read_text(encoding='utf-8')
        lock_check='--require-hashes -r "$prepare/runtime.lock"'
        self.assertEqual(2,script.count(lock_check))
        self.assertIn('install -m 0644 "$RUNTIME_LOCK" "$prepare/runtime.lock"',script)
        self.assertIn('cmp -s "$RUNTIME_LOCK" "$prepare/runtime.lock"',script)
        self.assertLess(script.index('exit 0'),script.index('RUNTIME_LOCK='),'remove must not require runtime inputs')
        self.assertLess(script.index(lock_check),script.index('# Destructive boundary:'))
        self.assertEqual(2,script.count('--no-deps --find-links "$WHEELHOUSE" "$WHEEL"'))
        self.assertIn('pip_user "$prepare/runtime/venv/bin/python" check',script)
        self.assertIn('pip_user "$root/.venv/bin/python" check',script)

if __name__=='__main__':unittest.main()
