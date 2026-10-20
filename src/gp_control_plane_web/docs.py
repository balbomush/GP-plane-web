"""Packaged snapshot of the existing HTTP contract, no Core source lookup."""
from importlib.resources import files

OPENAPI_JSON_CONTENT_TYPE = "application/json; charset=utf-8"
SWAGGER_HTML_CONTENT_TYPE = "text/html; charset=utf-8"
SWAGGER_PATHS = {"/swagger", "/swagger/"}

def openapi_json_bytes() -> bytes:
    return files(__package__).joinpath("openapi.json").read_bytes()

def swagger_ui_html() -> str:
    return '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Web API</title><a href="/openapi.json">Контракт API</a></html>'
