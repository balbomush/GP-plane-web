"""Installed Core/Web outside source cwd; reuse the existing owned-process/metrics harness."""
from pathlib import Path
import json,os,socket,subprocess,sys,time
from process_guard import OwnedProcess
from api2_http_checks import verify

root=Path(sys.argv[1]).resolve();root.mkdir(parents=True,exist_ok=False)
tests=Path(__file__).resolve().parent
attempt=root.parent
env=dict(os.environ);env.pop('PYTHONPATH',None);env['PYTHONUNBUFFERED']='1';env['PYTHONUTF8']='1'
core_python=attempt/'core-venv/Scripts/python.exe'
web_python=attempt/'web-venv/Scripts/python.exe'
if os.name!='nt':core_python=attempt/'core-venv/bin/python';web_python=attempt/'web-venv/bin/python'
def ready(owner):
    row=json.loads(owner.process.stdout.readline());assert row['kind']=='ready'
    deadline=time.monotonic()+15
    while True:
        try:
            with socket.create_connection(('127.0.0.1',row['port']),timeout=.2):return row
        except OSError:
            assert owner.process.poll() is None and time.monotonic()<deadline
            time.sleep(.05)
def command(owner,text):
    owner.process.stdin.write(text+'\n');owner.process.stdin.flush()
    return json.loads(owner.process.stdout.readline())
core=web=None
with (root/'core.stderr').open('w',encoding='utf8') as ce,(root/'web.stderr').open('w',encoding='utf8') as we:
 try:
    core=OwnedProcess([str(core_python),'-I',str(tests/'api2_core_fixture.py'),str(root/'synthetic-state')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=ce,text=True,cwd=root,env=env)
    cr=ready(core)
    command(core,'schema') # consume the freshly generated schema below separately
    core.process.stdin.write('schema\n');core.process.stdin.flush()
    generated=json.loads(core.process.stdout.readline())
    (root/'generated-openapi.json').write_text(json.dumps(generated,ensure_ascii=False,indent=2),encoding='utf8')
    pinned=json.loads((tests.parent/'src/gp_control_plane_web/openapi.json').read_text(encoding='utf8'))
    assert generated==pinned,'Core generation differs from pinned API2 export'
    web=OwnedProcess([str(web_python),'-I',str(tests/'metrics_listener.py'),str(cr['port'])],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=we,text=True,cwd=root,env=env)
    wr=ready(web)
    config={'url':'http://127.0.0.1:'+str(wr['port']),'coreUrl':'http://127.0.0.1:'+str(cr['port']),'output':str(root)}
    (root/'browser-config.json').write_text(json.dumps(config),encoding='utf8')
    with (root/'browser.log').open('w',encoding='utf8') as log:
        r=subprocess.run(['node',str(tests/'ui2/runner.cjs'),str(root/'browser-config.json')],stdout=log,stderr=subprocess.STDOUT,cwd=root,env=env,timeout=900)
    metrics=command(web,'settled-metrics');(root/'metrics.json').write_text(json.dumps(metrics,indent=2))
    assert metrics['metrics']['active_web_streams']==0,metrics
    assert r.returncode==0,'browser assertions failed; see durable browser.log'
    credentials=json.loads((root/'final-password.json').read_text())
    http_checks=verify('http://127.0.0.1:'+str(cr['port']),config['url'],credentials['password'])
    (root/'final-password.json').unlink()  # own synthetic handoff only, not durable evidence
    (root/'http-checks.json').write_text(json.dumps(http_checks,indent=2))
    metrics=command(web,'settled-metrics');(root/'metrics-after-http.json').write_text(json.dumps(metrics,indent=2))
    deadline=time.monotonic()+5
    while metrics['metrics']['active_web_streams'] and time.monotonic()<deadline:
        time.sleep(.1);metrics=command(web,'metrics')
    assert metrics['metrics']['active_web_streams']==0
    print('INSTALLED_API2_BROWSER_PASS')
 finally:
    if web:
        try:command(web,'stop');web.process.wait(timeout=10)
        finally:web.close()
    if core:
        try:core.process.stdin.write('stop\n');core.process.stdin.flush();core.process.wait(timeout=15)
        finally:core.close()
