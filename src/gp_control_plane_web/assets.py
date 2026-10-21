"""Serve only compiled, package-owned files. No cwd or filesystem fallback."""
from importlib.resources import files
import hashlib
import json
import re
from bottle import HTTPResponse


def validate_assets() -> None:
    """Refuse partial/corrupt package installation before opening a listener."""
    root = files(__package__).joinpath("static")
    manifest = json.loads(root.joinpath("asset-manifest.json").read_text(encoding="utf-8"))
    assets = manifest["assets"]
    if "index.html" not in assets or not any(name.endswith(".js") for name in assets):
        raise ValueError("Web production assets are incomplete")
    for name, expected in assets.items():
        if not re.fullmatch(r"index\.html|assets/[A-Za-z0-9_-]+\.(?:js|css)", name):
            raise ValueError("invalid Web asset manifest path")
        if hashlib.sha256(root.joinpath(*name.split("/")).read_bytes()).hexdigest() != expected:
            raise ValueError(f"Web asset checksum mismatch: {name}")

def index_html() -> str:
    return files(__package__).joinpath("static/index.html").read_text(encoding="utf-8")

def asset_response(name: str) -> HTTPResponse:
    if not re.fullmatch(r"[A-Za-z0-9_-]+\.(?:js|css)", name):
        return HTTPResponse(status=404, body=b"")
    resource = files(__package__).joinpath("static/assets", name)
    if not resource.is_file():
        return HTTPResponse(status=404, body=b"")
    content = resource.read_bytes()
    return HTTPResponse(body=content, status=200, headers={
        "Content-Type": "text/javascript; charset=utf-8" if name.endswith(".js") else "text/css; charset=utf-8",
        "Content-Length": str(len(content)), "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
    })
