"""Allow only the pinned public Core API2 contract at the proxy boundary."""
from dataclasses import dataclass
from importlib.resources import files
import json,re
from .docs import SWAGGER_PATHS
@dataclass(frozen=True)
class RouteSpec:
    path: str
    methods: frozenset[str]
    namespace: str = "api2"
    dispatch: str = "proxy"
    openapi: bool = True
    allowed_in_core: bool = True
    auth_required: bool = True
_contract=json.loads(files(__package__).joinpath("openapi.json").read_text(encoding="utf8"))
ROUTES=tuple(RouteSpec("/api/v2"+path, frozenset(m.upper() for m in value if m in {"get","post","put","delete"}),auth_required=path!="/access/authentication") for path,value in _contract["paths"].items())+(RouteSpec('/api/health',frozenset({'GET','HEAD'}),openapi=False,auth_required=False),)
_patterns=tuple((re.compile("^"+re.sub(r"\\\{[^}]+\\\}","[^/]+",re.escape(row.path))+"$"),row) for row in ROUTES)
def route_for(method,path):
    return next((row for pattern,row in _patterns if method.upper() in row.methods and pattern.fullmatch(path)),None)
def openapi_operations(*,core_only=False):
    return {(row.path,method) for row in ROUTES if row.openapi for method in row.methods}
def route_paths(*,method=None,namespace=None,dispatch=None):
    return {row.path for row in ROUTES if (not method or method.upper() in row.methods) and (not namespace or row.namespace==namespace) and (not dispatch or row.dispatch==dispatch)}
UPLOAD_ROUTE_PATHS=frozenset({"/api/v2/backup/restore-file"})
JSON_GET_ROUTE_PATHS=frozenset(route_paths(method="GET"))
JSON_POST_ROUTE_PATHS=frozenset(route_paths(method="POST"))
JSON_HEAD_ROUTE_PATHS=frozenset()
