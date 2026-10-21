"""Declared consumer contract, checked before installer activation.

This is a read-only contract check, not a Core loader or dependency installer.
"""
from importlib.resources import files
import json


def declaration() -> dict:
    return json.loads(files(__package__).joinpath("compatibility.json").read_text(encoding="utf-8"))


def validate_core_contract(contract: dict) -> None:
    supported = declaration()
    if contract.get("info", {}).get("version") not in supported["core_api_versions"]:
        raise ValueError("unsupported Core API version; previous Web was preserved")
    paths = contract.get("paths", {})
    for path, methods in supported["required_operations"].items():
        if not all(method in paths.get(path, {}) for method in methods):
            raise ValueError(f"Core operation is unavailable: {path}; previous Web was preserved")
