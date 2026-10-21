"""Web-owned CLI/config. No Core state path or helper configuration."""
import argparse
import os
from urllib.parse import urlsplit
from . import __version__
from .core_client import CoreClient
from .web_app import create_web_app
from .cheroot_connection import WebStreamLifecycle, require_pinned_cheroot
from .http_runtime import WebHttpRuntime
from .assets import validate_assets

def create_web_runtime(host: str, port: int, *, core_url: str) -> WebHttpRuntime:
    url = urlsplit(core_url)
    if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in {"", "/"}:
        raise ValueError("GP_WEB_CORE_URL must be an http(s) origin without credentials/path")
    require_pinned_cheroot()
    validate_assets()
    streams = WebStreamLifecycle()
    return WebHttpRuntime(create_web_app(CoreClient(core_url.rstrip('/')), stream_lifecycle=streams), host, port, stream_lifecycle=streams)

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="gp-web")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument("--host", default=os.environ.get("GP_WEB_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("GP_WEB_PORT", "8080")))
    parser.add_argument("--core-url", default=os.environ.get("GP_WEB_CORE_URL", "http://127.0.0.1:8081"))
    args = parser.parse_args(argv)
    try:
        runtime = create_web_runtime(args.host, args.port, core_url=args.core_url)
    except (ValueError, OSError) as error:
        parser.error(str(error))
    try:
        runtime.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        runtime.stop()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
