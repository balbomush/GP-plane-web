"""Execute full installer on owned files; explicit UID/systemd/pip seams.

Checks validation/order and old-file/HTTP preservation. This is not a claim of
actual Linux privilege switching, pip installation, flock or service-manager proof.
"""
import hashlib,http.server,os,shlex,shutil,subprocess,sys,tempfile,threading,unittest,urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BASH=shutil.which('bash') or (r'C:\Program Files\Git\bin\bash.exe' if sys.platform=='win32' else None)
SOURCE=(ROOT/'scripts/install-linux.sh').read_text(encoding='utf-8')

@unittest.skipUnless(BASH and Path(BASH).is_file(),'existing Bash required')
class PreparationExecutionTests(unittest.TestCase):
 def run_case(self,scenario,source=SOURCE):
  with tempfile.TemporaryDirectory(prefix='web-prepare-') as raw:
   base=Path(raw)
   def posix(p):
    if sys.platform!='win32':return str(p)
    r=subprocess.run([BASH,'-c','cygpath -u "$1"','fixture',str(p)],capture_output=True,check=True)
    return r.stdout.decode().strip()
   home=base/'home';root=home/'gp/GP-plane-web';root.mkdir(parents=True);(root/'.gp-web-owned').write_text('GP Plane Web\n',newline='\n');(root/'old-program').write_bytes(b'working old kit')
   etc=base/'etc';etc.mkdir();unit=etc/'gp-web.service';config=etc/'gp-web'
   unit.write_text('# Managed by GP Plane Web\nRestart=always\n',newline='\n');config.write_text("# Managed by GP Plane Web\nGP_WEB_CORE_URL='http://127.0.0.1:19881'\nGP_WEB_HOST='127.0.0.1'\nGP_WEB_PORT='19880'\n",newline='\n')
   before=(unit.read_bytes(),config.read_bytes());core=base/'Core';core.mkdir();(core/'data-and-helper').write_bytes(b'Core must not change')
   package=base/'source';(package/'scripts').mkdir(parents=True);(package/'requirements-runtime.lock').write_bytes((ROOT/'requirements-runtime.lock').read_bytes())
   tmp=base/'tmp';tmp.mkdir();wheel=base/'gp_plane_web-0.1.0-py3-none-any.whl';wheel.write_bytes(b'exact synthetic delivery bytes');house=base/'house';house.mkdir()
   if scenario=='unsafe-house':(house/'not-a-wheel.whl').mkdir()
   if scenario=='foreign-root':(root/'.gp-web-owned').write_text('foreign')
   trace=base/'trace'
   text=source.replace('PATH=/usr/sbin:/usr/bin:/sbin:/bin','PATH="$PATH"').replace('/etc/default',posix(etc)).replace('/etc/systemd/system/gp-web.service',posix(unit)).replace('/tmp/gp-web-prepare.XXXXXX',posix(tmp/'gp-web-prepare.XXXXXX'))
   installer=package/'scripts/install-linux.sh';installer.write_text(text,encoding='utf-8',newline='\n')
   variables={'FIXTURE_HOME':posix(home),'PYTHON':str(Path(sys.executable)).replace('\\','/'),'SCENARIO':scenario,'TRACE':posix(trace)}
   shell='set -Eeuo pipefail\n'+''.join(k+'='+shlex.quote(v)+'\n' for k,v in variables.items())+r'''
id() { if [ "$1" = -u ]; then echo 0; else echo fixture; fi; }
getent() { printf 'fixture:x:1000:1000::%s:/bin/bash\n' "$FIXTURE_HOME"; }
stat() { if [ "$1" = -c ] && [ "$2" = %u ]; then echo 0; else command stat "$@"; fi; }
flock() { [ "$SCENARIO" != busy ]; }
chown() { :; }
install() {
 local -a args=()
 while [ "$#" -gt 0 ]; do
  case "$1" in -o|-g) shift 2;; *) args+=("$1"); shift;; esac
 done
 command install "${args[@]}"
}
systemctl() { printf '%s\n' "$*" >> "$TRACE"; return 0; }
python3() {
 if [[ "$1" = */check-web-service.py ]]; then return 0; fi
 local -a args=(); local arg
 for arg in "$@"; do
  if [ "$NATIVE_WINDOWS" = yes ] && [[ "$arg" = /* ]]; then arg=$(cygpath -w "$arg"); fi
  args+=("$arg")
 done
 if [ "$NATIVE_WINDOWS" = yes ]; then
  "$PYTHON" "${args[@]}" | sed 's/\r$//'
 else
  "$PYTHON" "${args[@]}"
 fi
}
runuser() {
 [ "$1" = -u ] && [ "$3" = -- ]; shift 3
 if [ "$1" = python3 ] && [ "$2" = -m ] && [ "$3" = venv ]; then
  mkdir -p "$4/bin"; return 0
 fi
 if [ "$1" = env ]; then
  printf '%s\n' pip >> "$TRACE"
  [ "$SCENARIO" != dependency ]; return
 fi
 if [[ "$1" = */bin/gp-web ]]; then echo 'gp-web 0.1.0'; return 0; fi
 if [[ "$*" = *'from importlib.metadata import version'* ]]; then echo 0.1.0; return 0; fi
 # This is precisely the preparation runtime/actual Core-contract check seam.
 # Contract parsing itself is covered by PackageContractTests, not faked here.
 printf '%s\n' compatibility >> "$TRACE"
 return 44
}
'''
   shell+='NATIVE_WINDOWS='+('yes' if sys.platform=='win32' else 'no')+'\n'
   digest='0'*64 if scenario=='checksum' else hashlib.sha256(wheel.read_bytes()).hexdigest()
   shell+='set -- --install-user fixture --wheel '+shlex.quote(posix(wheel))+' --sha256 '+digest+' --wheelhouse '+shlex.quote(posix(house))+'\n. '+shlex.quote(posix(installer))+'\n'
   class OldWeb(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
     data=(root/'old-program').read_bytes();self.send_response(200);self.end_headers();self.wfile.write(data)
    def log_message(self,*args):pass
   server=http.server.ThreadingHTTPServer(('127.0.0.1',0),OldWeb);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
   try:
    result=subprocess.run([BASH,'-s'],input=shell.encode(),capture_output=True,timeout=30,env={**os.environ,'MSYS_NO_PATHCONV':'1'})
    self.assertNotEqual(0,result.returncode)
    self.assertNotIn(b'Web installation complete',result.stdout)
    expected={'checksum':b'wheel checksum mismatch','unsafe-house':b'unsafe dependency wheel','foreign-root':b'foreign install directory','busy':b'another Web install/remove','dependency':b'phase=preparation','compatibility':b'phase=preparation'}[scenario]
    self.assertIn(expected,result.stderr,result.stderr.decode(errors='replace'))
    actions=trace.read_text() if trace.exists() else ''
    self.assertNotIn('stop gp-web',actions);self.assertNotIn('disable',actions);self.assertNotIn('start gp-web',actions)
    self.assertEqual(before,(unit.read_bytes(),config.read_bytes()))
    self.assertEqual(b'working old kit',(root/'old-program').read_bytes())
    with urllib.request.urlopen('http://127.0.0.1:'+str(server.server_port),timeout=2) as response:self.assertEqual(b'working old kit',response.read())
    self.assertFalse(list(root.glob('.previous.*')));self.assertFalse(list(root.glob('.web-runtime.*')))
    self.assertEqual(b'Core must not change',(core/'data-and-helper').read_bytes())
    return result
   finally:server.shutdown();server.server_close();thread.join(timeout=2)
 def test_failures_preserve_old_kit_config_and_live_http(self):
  for scenario in ('checksum','unsafe-house','foreign-root','busy','dependency','compatibility'):
   with self.subTest(scenario=scenario):self.run_case(scenario)

if __name__=='__main__':unittest.main()
