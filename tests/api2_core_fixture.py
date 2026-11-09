"""Installed immutable Core, existing test-adapter seam, synthetic state only.

No Core product changes and no helper/engine/kernel use. HTTP/storage/auth are real.
"""
from hashlib import sha256
import json,socket,sys,threading
from pathlib import Path
from gp_control_plane.application.api2_search import SearchController
from gp_control_plane.application.operation_admission import OperationAdmission
from gp_control_plane.application.core_update import CoreUpdate
from gp_control_plane.http.api_v2.app import create_api2_app
from gp_control_plane.http.asgi import CoreHttpServer
from gp_control_plane.storage import connect_api2


class BrowserTestEngine:
    def prepare(self,code,parameters):return 'web-api2-test-adapter-v1'
    def run(self,job):
        start=len(job.checkpoint['trail']) if job.checkpoint else 0
        for index in range(start,start+3):
            if job.cancel.wait(.3):return 'stopped'
            args='--filter-tcp='+str(80+index)
            job.check(sha256(args.encode()).hexdigest(),'http',args,{},dict.fromkeys(job.domains,True))
            job.log('fixture strategy '+str(index+1))
        job.cancel.wait(45)
        return 'stopped' if job.cancel.is_set() else 'completed'


state=Path(sys.argv[1]);state.mkdir(parents=True,exist_ok=False)
with connect_api2(state):pass
admission=OperationAdmission()
search=SearchController(state,admission,BrowserTestEngine())
app=create_api2_app(state,admission=admission,search=search,updater=CoreUpdate(state,admission))
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
server=CoreHttpServer(app,'127.0.0.1',port)
thread=threading.Thread(target=server.serve_forever);thread.start()
print(json.dumps({'kind':'ready','port':port,'package':__import__('gp_control_plane').__file__}),flush=True)
try:
    for line in sys.stdin:
        if line.strip()=='stop':break
        if line.strip()=='schema':print(json.dumps(app.openapi()),flush=True)
finally:
    server.stop();thread.join(10);assert not thread.is_alive()
