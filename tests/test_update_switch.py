"""Run the product Bash switch on owned files with explicit service/probe seams.

Windows uses an NTFS junction for the directory-alias operation (MSYS ln copies
instead of symlinking). This is executable switch coverage, NOT Linux/systemd
or actual pip/venv proof. Linux uses real ln; those platform claims stay separate.
"""
import os,shlex,shutil,subprocess,sys,tempfile,unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=(ROOT/'scripts/install-linux.sh').read_text(encoding='utf-8')
BASH=shutil.which('bash') or (r'C:\Program Files\Git\bin\bash.exe' if sys.platform=='win32' else None)

@unittest.skipUnless(BASH and Path(BASH).is_file(),'existing Bash required')
class SwitchExecutionTests(unittest.TestCase):
 def bash(self,source):
  return subprocess.run([BASH,'-s'],input=source.encode(),capture_output=True,timeout=20,
                        env={**os.environ,'MSYS_NO_PATHCONV':'1'})
 def test_switch_success_fresh_repeated_and_post_switch_failures(self):
  for scenario in ('fresh','update','repeat','start-failure','probe-failure','partial-move','stop-failure','inactive','cleanup-failure','term'):
   with self.subTest(scenario=scenario),tempfile.TemporaryDirectory(prefix='web-switch-') as raw:
    base=Path(raw);root=base/'program';root.mkdir();(root/'.gp-web-owned').write_text('GP Plane Web\n')
    unit=base/'gp-web.service';config=base/'gp-web';sentinel=base/'Core-never-change';sentinel.write_bytes(b'unchanged Core state/helper fixture')
    if scenario!='fresh':
     unit.write_text('# Managed by GP Plane Web\nRestart=always\nEnvironment=LANG=C\n');config.write_text("# Managed by GP Plane Web\nGP_WEB_CORE_URL='http://localhost:19881'\nGP_WEB_HOST='127.0.0.1'\nGP_WEB_PORT='19880'\n")
     old=root/'.venv';old.mkdir();(old/'old-only').write_bytes(b'old runtime');(root/'obsolete-file').write_bytes(b'old program')
    original_unit=unit.read_bytes() if unit.exists() else None;original_config=config.read_bytes() if config.exists() else None
    switches=2 if scenario=='repeat' else 1
    for index in range(switches):
     runtime=root/('.web-runtime.fixture'+str(index));(runtime/'.venv/bin').mkdir(parents=True)
     console=runtime/'.venv/bin/gp-web';console.write_text('#!/bin/sh\nprintf "gp-web 0.1.0-test\\n"\n');console.chmod(0o755)
     (runtime/'.venv/new-only').write_text(str(index));trace=base/('trace'+str(index))
     definitions={k:str(v).replace('\\','/') for k,v in {'root':root,'runtime':runtime,'unit':unit,'config':config,'prepare':base/'prepare','trace':trace}.items()}
     source='set -Eeuo pipefail\n'+''.join(k+'='+shlex.quote(v)+'\n' for k,v in definitions.items())
     source+="INSTALL_USER=fixture\nCORE_URL=http://localhost:19881\nHOST=127.0.0.1\nPORT=19880\ntarget_version=0.1.0-test\ncreated_root=no\nswitched=no\nprevious=\nphase=preparation\n"
     # The real product EXIT/ERR cleanup is included; only privilege/systemd and
     # HTTP readiness are explicit seams. File operations remain native.
     cleanup=SCRIPT.split('cleanup() {',1)[1].split('chmod 0755 "$prepare"',1)[0]
     source+='cleanup() {'+cleanup
     source+="fail() { printf 'ERROR: %s\\n' \"$*\" >&2; exit 1; }\n"
     source+='SCENARIO='+shlex.quote(scenario)+r'''
systemctl() {
  printf '%s\n' "$*" >> "$trace"
  if [ "$SCENARIO" = stop-failure ] && [ "$1" = stop ]; then return 42; fi
  if [ "$SCENARIO" = inactive ] && [ "$1" = is-active ]; then return 42; fi
  if [ "$SCENARIO" = start-failure ] && [ "$1" = start ]; then return 42; fi
}
runuser() {
  [ "$1" = -u ] && [ "$3" = -- ]; shift 3
  if [[ "$1" = */bin/gp-web ]]; then "$@"; return; fi
  [ "$1" = "$runtime/.venv/bin/python" ] || return 40
  if [ "$SCENARIO" = term ]; then kill -TERM "$$"; fi
  printf '%s\n' readiness >> "$trace"
  [ "$SCENARIO" != probe-failure ]
}
rm() {
  if [ "$SCENARIO" = cleanup-failure ] && [[ "$*" = *'/.previous.'* ]]; then return 45; fi
  command rm "$@"
}
MOVES=0
mv() {
  MOVES=$((MOVES+1))
  if [ "$SCENARIO" = partial-move ] && [ "$MOVES" -eq 2 ]; then return 43; fi
  command mv "$@"
}
'''
     if sys.platform=='win32':
      # No privilege changes: CreateJunction is an ordinary owned-directory
      # alias, used only because Windows cannot exercise POSIX symlinks here.
      source+='PYTHON='+shlex.quote(sys.executable.replace('\\','/'))+r'''
ln() {
  [ "$1" = -s ] && [ "$2" = -- ]; shift 2
  "$PYTHON" -c 'import _winapi,sys;_winapi.CreateJunction(sys.argv[1],sys.argv[2])' "$(cygpath -w "$1")" "$(cygpath -w "$2")"
}
'''
     source+='# Switching boundary:'+SCRIPT.split('# Switching boundary:',1)[1]
     result=self.bash(source)
     if scenario in ('fresh','update','repeat'):
      self.assertEqual(0,result.returncode,result.stderr.decode(errors='replace'))
      self.assertIn(b'Web installation complete',result.stdout)
      self.assertFalse((root/'obsolete-file').exists());self.assertFalse(list(root.glob('.previous.*')))
      self.assertEqual(str(index),(root/'.venv/new-only').read_text());self.assertTrue(runtime.exists())
      if index:self.assertFalse((root/('.web-runtime.fixture'+str(index-1))).exists())
      if original_unit is not None:self.assertEqual(original_unit,unit.read_bytes());self.assertNotIn('enable',trace.read_text());self.assertNotIn('disable',trace.read_text())
      self.assertLess(trace.read_text().index('readiness'),len(trace.read_text()))
     elif scenario=='stop-failure':
      self.assertNotEqual(0,result.returncode);self.assertFalse(runtime.exists());self.assertTrue((root/'.venv/old-only').exists());self.assertFalse(list(root.glob('.previous.*')));self.assertNotIn(b'Web installation complete',result.stdout)
     else:
      self.assertNotEqual(0,result.returncode)
      self.assertNotIn(b'Web installation complete',result.stdout)
      if scenario!='inactive':self.assertIn(b'no rollback performed',result.stderr)
      self.assertTrue(runtime.exists());previous=list(root.glob('.previous.*'));self.assertEqual(1,len(previous))
      self.assertTrue((previous[0]/'.venv/old-only').exists() or (root/'.venv/old-only').exists())
     if original_config is not None:self.assertEqual(original_config,config.read_bytes())
     self.assertEqual(b'unchanged Core state/helper fixture',sentinel.read_bytes())

 def test_previous_partial_switch_refuses_before_any_service_command(self):
  with tempfile.TemporaryDirectory(prefix='web-switch-partial-') as raw:
   root=Path(raw);(root/'.previous.failed').mkdir();(root/'.previous.failed/evidence').write_bytes(b'preserved')
   guard=SCRIPT.split('shopt -s nullglob\nprevious_installs=',1)[1].split('RUNTIME_LOCK=',1)[0]
   source='set -Eeuo pipefail\nroot='+shlex.quote(root.as_posix())+"\nfail() { echo \"$*\" >&2; exit 1; }\nshopt -s nullglob\nprevious_installs="+guard
   result=self.bash(source);self.assertNotEqual(0,result.returncode);self.assertIn(b'previous Web switch needs inspection',result.stderr)
   self.assertEqual(b'preserved',(root/'.previous.failed/evidence').read_bytes())

if __name__=='__main__':unittest.main()
