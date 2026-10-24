"""Delivery and compatibility failures must be caught before activation."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from gp_control_plane_web import assets, compatibility


class PackageContractTests(unittest.TestCase):
    def test_declared_core_contract_rejects_unknown_version_or_missing_operation(self):
        declaration=compatibility.declaration()
        contract={"info":{"version":"0.4.4"},"paths":{
            path:{method:{} for method in methods} for path,methods in declaration["required_operations"].items()}}
        for version in ("0.4.4", "0.4.5a1", "0.4.5a2", "0.4.5"):
            with self.subTest(version=version):
                contract["info"]["version"]=version
                compatibility.validate_core_contract(contract)
        for version in ("999.0.0", "0.4.5", "0.4.5a3", "0.4.5a1+unqualified"):
            with self.subTest(version=version):
                contract["info"]["version"]=version
                with self.assertRaisesRegex(ValueError,"unsupported Core API"):
                    compatibility.validate_core_contract(contract)
        for version in ("0.4.4", "0.4.5a1", "0.4.5a2", "0.4.5"):
            contract["info"]["version"]=version
            broken=json.loads(json.dumps(contract))
            del broken["paths"]["/api/auth/change-password"]
            with self.subTest(missing_operation_version=version):
                with self.assertRaisesRegex(ValueError,"operation is unavailable"):
                    compatibility.validate_core_contract(broken)

    def test_missing_corrupt_or_traversing_asset_manifest_fails_closed(self):
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);static=root/"static";static.mkdir();(static/"assets").mkdir()
            (static/"index.html").write_bytes(b"compiled index")
            (static/"assets/app-abc.js").write_bytes(b"compiled script")
            manifest={"assets":{name:hashlib.sha256((static/name).read_bytes()).hexdigest() for name in ["index.html","assets/app-abc.js"]}}
            def write(): (static/"asset-manifest.json").write_text(json.dumps(manifest),encoding="utf-8")
            write()
            with patch.object(assets,"files",return_value=root):
                assets.validate_assets()
                (static/"assets/app-abc.js").write_bytes(b"damaged")
                with self.assertRaisesRegex(ValueError,"checksum mismatch"):assets.validate_assets()
                manifest["assets"]["../outside.js"]="0"*64;write()
                # The index is valid, so a traversal is rejected before opening it.
                manifest["assets"]["assets/app-abc.js"]=hashlib.sha256(b"damaged").hexdigest();write()
                with self.assertRaisesRegex(ValueError,"manifest path"):assets.validate_assets()
                (static/"asset-manifest.json").unlink()
                with self.assertRaises(FileNotFoundError):assets.validate_assets()

    def test_assets_are_package_only_and_missing_old_hash_never_returns_html(self):
        for name in ["../index.html","%2e%2e","old-no-longer-packaged.js","index.html","app.js.map"]:
            with self.subTest(name=name):
                response=assets.asset_response(name)
                self.assertEqual(404,response.status_code)
                self.assertEqual(b"",response.body)


if __name__=="__main__":unittest.main()
