"""Browser fixture matrix served by a genuinely installed independent Web.

The API responses are explicit UI fixtures. Real Core/engine integration is a
separate mandatory qualification, never inferred from this matrix.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import os
import socket
import subprocess
import sys
import time
import zipfile
from process_guard import OwnedProcess

SUITES=('frontend-ui.cjs','frontend-bootstrap.cjs','frontend-lifetime.cjs',
        'frontend-operations.cjs','frontend-paging.cjs','frontend-security.cjs')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node',type=Path,required=True)
    parser.add_argument('--playwright-module',type=Path,required=True)
    parser.add_argument('--browsers',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--wheel',type=Path,required=True)
    parser.add_argument('--suites',nargs='+',choices=SUITES,default=list(SUITES))
    args=parser.parse_args()
    import gp_control_plane_web
    module=Path(gp_control_plane_web.__file__).resolve()
    assert module.is_relative_to(Path(sys.prefix).resolve()),module
    assert importlib.util.find_spec('gp_control_plane') is None
    wheel=args.wheel.resolve(strict=True)
    with zipfile.ZipFile(wheel) as archive:
        expected={name for name in archive.namelist() if name.startswith('gp_control_plane_web/') and not name.endswith('/')}
        actual={p.relative_to(module.parent.parent).as_posix() for p in module.parent.rglob('*') if p.is_file() and '__pycache__' not in p.parts}
        assert expected==actual,(expected-actual,actual-expected)
        for name in expected:assert (module.parent.parent/name).read_bytes()==archive.read(name),name
    node=args.node.resolve(strict=True)
    package=args.playwright_module.resolve(strict=True)
    browsers=args.browsers.resolve(strict=True)
    assert (package/'package.json').is_file()
    output=args.output.resolve();output.mkdir(parents=True,exist_ok=False)
    (output/'screenshots').mkdir()
    with socket.socket() as probe:
        probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
    env={key:value for key,value in os.environ.items() if key not in {'PYTHONPATH','PYTHONHOME'}}
    env.update(GP_TEST_WEB_URL=f'http://127.0.0.1:{port}',
               GP_WEB_STATIC_ROOT=str(module.parent/'static'),
               GP_PLAYWRIGHT_MODULE=str(package),PLAYWRIGHT_BROWSERS_PATH=str(browsers),
               GP_BROWSER_SCREENSHOTS=str(output/'screenshots'))
    rows=[];owner=None
    report={'kind':'installed independent Web/Python listener + production Svelte/browser; API fixtures',
            'module':str(module),'wheel_sha256':hashlib.sha256(wheel.read_bytes()).hexdigest(),'verified_product_files':len(expected),'complete_matrix':tuple(args.suites)==SUITES,
            'node_sha256':hashlib.sha256(node.read_bytes()).hexdigest(),
            'asset_manifest_sha256':hashlib.sha256((module.parent/'static/asset-manifest.json').read_bytes()).hexdigest(),
            'suites':rows,'status':'FAIL','cleanup':'PENDING'}
    try:
        with (output/'web.log').open('wb') as server_log:
            owner=OwnedProcess([sys.executable,'-I','-m','gp_control_plane_web.cli','--host','127.0.0.1','--port',str(port),'--core-url','http://127.0.0.1:18979'],cwd=output,env=env,stdout=server_log,stderr=server_log)
            deadline=time.monotonic()+10
            while True:
                assert owner.process.poll() is None,'installed Web exited'
                try:
                    with socket.create_connection(('127.0.0.1',port),timeout=.1):break
                except OSError:
                    assert time.monotonic()<deadline,'installed Web readiness timeout'
                    time.sleep(.02)
            for suite in args.suites:
                destination=output/(suite+'.json')
                with (output/(suite+'.log')).open('wb') as log:
                    run=subprocess.run([str(node),str(Path(__file__).with_name(suite)),str(destination)],cwd=output,env=env,stdout=log,stderr=log,timeout=480)
                rows.append({'suite':suite,'exit':run.returncode,'result':str(destination),
                             'controller_sha256':hashlib.sha256(Path(__file__).with_name(suite).read_bytes()).hexdigest()})
                assert run.returncode==0,'browser suite failed: '+suite
            report['status']='PASS'
    finally:
        try:
            if owner is not None:owner.close()
            with socket.socket() as probe:
                probe.settimeout(.2);assert probe.connect_ex(('127.0.0.1',port))!=0,'owned listener survived'
            report['cleanup']='PASS'
        finally:(output/'result.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    return 0


if __name__=='__main__':raise SystemExit(main())
