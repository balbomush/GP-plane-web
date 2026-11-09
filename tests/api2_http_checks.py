"""Assertions against the installed immutable Core and independent Web listeners."""
from http.client import HTTPConnection
import json,time
from urllib.parse import urlsplit


def verify(core_url,web_url,password='admin'):
    def connection(base):
        u=urlsplit(base);return HTTPConnection(u.hostname,u.port,timeout=8)
    def call(base,method,path,body=None,token=None,headers=None):
        c=connection(base);h=dict(headers or {})
        if token:h['Authorization']='Bearer '+token
        if body is not None:h['Content-Type']='application/json'
        try:
            c.request(method,path,json.dumps(body) if body is not None else None,h)
            r=c.getresponse();return r.status,r.read(),{k.lower():v for k,v in r.getheaders()}
        finally:c.close()
    code,raw,_=call(web_url,'POST','/api/v2/access/authentication',{'username':'admin','password':password})
    assert code==200
    token=json.loads(raw)['bearer_token']
    code,raw,headers=call(web_url,'GET','/api/v2/service/status')
    assert code==401 and headers.get('www-authenticate')=='Bearer'
    assert call(web_url,'GET','/api/core/status',token=token)[0]==404
    assert call(web_url,'GET','/api/internal/auth/verify-bearer',token=token)[0]==404
    code,_,headers=call(web_url,'GET','/api/v2/service/status',token=token,headers={'Origin':'https://untrusted.invalid'})
    assert code==200 and not any(k.lower()=='access-control-allow-origin' for k in headers)
    opened=[]
    def close(pair):
        pair[1].close();pair[0].close()
    def stream(base):
        c=connection(base);c.request('GET','/api/v2/search/events',headers={'Authorization':'Bearer '+token})
        r=c.getresponse()
        if r.status==200:
            lines=[]
            while True:
                line=r.readline();assert line
                lines.append(line)
                if line in (b'\n',b'\r\n') and any(l.startswith(b'data:') for l in lines):break
            assert any(l.startswith(b'event: search') for l in lines)
        return c,r
    results={}
    for name,base in [('core',core_url),('web',web_url)]:
        started=time.monotonic();deadline=started+5
        try:
            while True:
                opened=[stream(base),stream(base)]
                if all(r.status==200 for _,r in opened):break
                for pair in opened:close(pair)
                opened=[];assert time.monotonic()<deadline,'SSE permits not released after browser close'
                time.sleep(.1)
            extra=stream(base);assert extra[1].status==503;close(extra)
            assert call(web_url,'GET','/api/v2/service/status',token=token)[0]==200
            results[name]={'two_active':200,'third':503,'release_seconds':time.monotonic()-started}
        finally:
            for pair in opened:close(pair)
            opened=[]
    assert call(web_url,'GET','/api/v2/search/current',token=token)[0]==200
    return {'status':'PASS','missing_auth':401,'retired_routes':404,'cross_origin_read_denied':True,'slots':results}
