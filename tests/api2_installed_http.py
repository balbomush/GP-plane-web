"""Native installed-package integration; no browser/board/helper requirement."""
from pathlib import Path
from http.client import HTTPConnection
from urllib.parse import urlsplit
from zipfile import ZipFile
from io import BytesIO
import json,os,socket,subprocess,sys,time
from process_guard import OwnedProcess
from api2_http_checks import verify

root=Path(sys.argv[1]).resolve();root.mkdir(parents=True,exist_ok=False)
attempt=root.parent;tests=Path(__file__).resolve().parent
suffix='Scripts/python.exe' if os.name=='nt' else 'bin/python'
env=dict(os.environ);env.pop('PYTHONPATH',None);env['PYTHONUTF8']='1';env['PYTHONUNBUFFERED']='1'
core=web=None
def ready(owner):
    row=json.loads(owner.process.stdout.readline());assert row['kind']=='ready'
    deadline=time.monotonic()+20
    while True:
        try:
            with socket.create_connection(('127.0.0.1',row['port']),timeout=.2):return row
        except OSError:
            assert owner.process.poll() is None and time.monotonic()<deadline
            time.sleep(.1)
token=None
def call(method,path,body=None,media=None):
    c=HTTPConnection('127.0.0.1',wr['port'],timeout=35)
    h={'Authorization':'Bearer '+token} if token else {}
    data=body
    if body is not None:
        if not isinstance(body,bytes):data=json.dumps(body).encode();media='application/json'
        h['Content-Type']=media
    try:
        c.request(method,'/api/v2'+path,data,h);r=c.getresponse();return r.status,r.read()
    finally:c.close()
def checked(method,path,body=None,status=200,media=None):
    s,b=call(method,path,body,media);assert s==status,(method,path,s,b)
    return json.loads(b) if b else None
def progress(rid,minimum):
    deadline=time.monotonic()+35
    while time.monotonic()<deadline:
        row=checked('GET','/search/current')
        assert row['active'] and row['run']['id']==rid
        if (row['run']['progress']['checked'] or 0)>=minimum:return row['run']['progress']['checked']
        time.sleep(.2)
    raise AssertionError('no committed fixture progress')
def stop(rid):
    r=checked('POST','/search/stop')['run'];assert r['id']==rid and r['status']=='stopped'
    assert not checked('GET','/search/current')['active']
with (root/'core.stderr').open('w',encoding='utf8') as ce,(root/'web.stderr').open('w',encoding='utf8') as we:
 try:
    core=OwnedProcess([str(attempt/'core-venv'/suffix),'-I',str(tests/'api2_core_fixture.py'),str(root/'synthetic-state')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=ce,text=True,env=env,cwd=root)
    cr=ready(core)
    web=OwnedProcess([str(attempt/'web-venv'/suffix),'-I',str(tests/'metrics_listener.py'),str(cr['port'])],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=we,text=True,env=env,cwd=root)
    wr=ready(web)
    token=checked('POST','/access/authentication',{'username':'admin','password':'admin'})['bearer_token']
    domainlist=checked('POST','/data/domain-lists',{'name':'native API2 list','domains':[{'domain':'one.example'},{'domain':'two.example'}]},201)
    changed=checked('PUT','/data/domain-lists/'+str(domainlist['id']),{'name':'renamed native list','domains':[{'domain':'one.example'},{'domain':'two.example'}]})
    assert changed['id']==domainlist['id']
    assert len(checked('GET','/data/domain-lists/'+str(changed['id'])+'/domains')['items'])==2
    invalid,_=call('POST','/engines/blockcheck2/start',{'domains':['!invalid'],'parameters':{}});assert invalid==400
    params={'include_quic':False,'enable_http':True,'enable_tls12':False,'debug_stdout':True}
    stock=checked('POST','/engines/blockcheck2/start',{'domains':['one.example'],'parameters':params})['id']
    progress(stock,1);stop(stock)
    assert not checked('GET','/data/runs/'+stock)['resume_available']
    gp=checked('POST','/engines/blockcheck2-gp/start',{'domains':['one.example','two.example'],'parameters':params})['id']
    first=progress(gp,3)
    slots=verify('http://127.0.0.1:'+str(cr['port']),'http://127.0.0.1:'+str(wr['port']))
    assert checked('GET','/search/current')['run']['id']==gp
    stop(gp);assert checked('GET','/data/runs/'+gp)['resume_available']
    assert checked('POST','/engines/blockcheck2-gp/runs/'+gp+'/resume')['id']==gp
    after=progress(gp,first+1);stop(gp)
    archive_id=checked('GET','/data/strategies?domains=one.example&domains=two.example&match=all')['items'][0]['id']
    s,b=call('GET','/data/strategies/'+archive_id+'/archive');assert s==200
    with ZipFile(BytesIO(b)) as z:assert 'manifest.json' in z.namelist()
    backup=checked('POST','/backup');assert backup['size_bytes']>0
    s,backup_bytes=call('GET','/backup/file');assert s==200
    s,b=call('POST','/backup/restore-file',b'invalid archive','application/octet-stream')
    assert s==409 and json.loads(b)['error']['code']=='archive_incomplete'
    assert checked('POST','/backup/restore-file',backup_bytes,media='application/octet-stream')['restored']
    assert checked('POST','/backup/restore')['restored']
    checked('DELETE','/backup',status=204)
    checked('DELETE','/data/domain-lists/'+str(changed['id']),status=204)
    slots_after=verify('http://127.0.0.1:'+str(cr['port']),'http://127.0.0.1:'+str(wr['port']))
    web.process.stdin.write('settled-metrics\n');web.process.stdin.flush();metrics=json.loads(web.process.stdout.readline())
    deadline=time.monotonic()+5
    while metrics['metrics']['active_web_streams'] and time.monotonic()<deadline:
        time.sleep(.1);web.process.stdin.write('metrics\n');web.process.stdin.flush();metrics=json.loads(web.process.stdout.readline())
    assert metrics['metrics']['active_web_streams']==0
    result={'status':'PASS','core_package':cr['package'],'stock':stock,'gp':gp,'resume_progress':[first,after],'slots_active':slots,'slots_after':slots_after,'metrics':metrics}
    (root/'result.json').write_text(json.dumps(result,indent=2));print('INSTALLED_CORE_WEB_API2_HTTP_PASS')
 finally:
    for owner in (web,core):
        if owner:
            try:
                owner.process.stdin.write('stop\n');owner.process.stdin.flush()
                if owner is web:owner.process.stdout.readline()
                owner.process.wait(timeout=15)
            finally:owner.close()
