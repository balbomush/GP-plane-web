"""Execute the installer HTTP readiness code against actual compiled assets.

A deterministic monotonic clock expires only negative test deadlines; HTTP and
all production digest/cache/health assertions execute unchanged.
"""
from pathlib import Path
import http.server,json,os,subprocess,sys,threading,unittest
ROOT=Path(__file__).resolve().parents[1]
SOURCE=(ROOT/'scripts/install-linux.sh').read_text(encoding='utf-8')
CODE=SOURCE.split("import hashlib,json,sys,time,urllib.request\n",1)[1].split("\n' \"$HOST\" \"$PORT\"",1)[0]

class ReadinessExecutionTests(unittest.TestCase):
 def test_real_readiness_rejects_mixed_build_cache_and_core_failure(self):
  static=ROOT/'src/gp_control_plane_web/static'
  manifest=json.loads((static/'asset-manifest.json').read_text())
  for scenario in ('healthy','digest','cache','core'):
   with self.subTest(scenario=scenario):
    class Handler(http.server.BaseHTTPRequestHandler):
     def do_GET(self):
      if self.path=='/api/health':
       self.send_response(503 if scenario=='core' else 200);self.end_headers();self.wfile.write(b'{}');return
      name='index.html' if self.path=='/' else self.path.lstrip('/')
      assert name in manifest['assets']
      body=(static/name).read_bytes()
      if scenario=='digest' and name.endswith('.js'):body+=b'wrong build'
      self.send_response(200)
      self.send_header('Cache-Control','max-age=3600' if scenario=='cache' else 'no-store')
      self.end_headers();self.wfile.write(body)
     def log_message(self,*args):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
    try:
     clock='import time\n_tick=iter([0,61])\ntime.monotonic=lambda:next(_tick,61)\n' if scenario!='healthy' else ''
     code=clock+'import hashlib,json,sys,time,urllib.request\n'+CODE
     env={**os.environ,'PYTHONPATH':str(ROOT/'src')}
     result=subprocess.run([sys.executable,'-B','-c',code,'127.0.0.1',str(server.server_port)],cwd=ROOT.parent,env=env,capture_output=True,timeout=8)
     if scenario=='healthy':self.assertEqual(0,result.returncode,result.stderr)
     else:self.assertNotEqual(0,result.returncode,result.stderr)
    finally:server.shutdown();server.server_close();worker.join(timeout=2)

if __name__=='__main__':unittest.main()
