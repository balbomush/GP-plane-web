"""Retained listener call shape for transport consumers; config is never read."""
from .cli import create_web_runtime as _create_runtime

def create_web_runtime(config, host, port, *, core_url):
    del config
    return _create_runtime(host, port, core_url=core_url)

def serve_web_proxy(config, host, port, *, core_url):
    runtime = create_web_runtime(config, host, port, core_url=core_url)
    try:
        runtime.serve_forever()
    finally:
        runtime.stop()
