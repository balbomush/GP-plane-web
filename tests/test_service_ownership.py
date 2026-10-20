"""Loaded-unit ownership independent of port availability or /etc file presence."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

path=Path(__file__).resolve().parents[1]/'scripts/check-web-service.py'
spec=importlib.util.spec_from_file_location('web_service_check',path)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class ServiceOwnershipTests(unittest.TestCase):
    def test_vendor_or_stopped_foreign_unit_is_rejected_without_a_local_unit_file(self):
        for load in ['loaded','masked','error']:
            with self.subTest(load=load), tempfile.TemporaryDirectory() as raw:
                root=Path(raw);unit=root/'etc/gp-web.service';install=root/'app'
                values={'LoadState':load,'FragmentPath':'/usr/lib/systemd/system/gp-web.service'}
                def show(argv,**kwargs):
                    name=next(v.split('=',1)[1] for v in argv if v.startswith('--property='))
                    return subprocess.CompletedProcess(argv,0,values[name]+'\n','')
                with patch.object(module.subprocess,'run',side_effect=show):
                    with self.assertRaisesRegex(ValueError,'foreign|unsupported'):module.check(unit,install,'gpuser')
                self.assertFalse(unit.exists())

    def test_owned_stopped_unit_checks_user_and_full_command(self):
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);unit=root/'gp-web.service';unit.write_text('# owned fixture')
            install=root/'app';install.mkdir();(install/'.gp-web-owned').write_text('GP Plane Web\n')
            exe=str(install/'.venv/bin/python')
            values={'LoadState':'loaded','FragmentPath':str(unit),'User':'gpuser',
                    'ExecStart':f'{{ path={exe} ; argv[]={exe} -m gp_control_plane_web.cli ; ignore_errors=no ; }}'}
            def show(argv,**kwargs):
                name=next(v.split('=',1)[1] for v in argv if v.startswith('--property='))
                return subprocess.CompletedProcess(argv,0,values[name]+'\n','')
            with patch.object(module.subprocess,'run',side_effect=show):
                module.check(unit,install,'gpuser')
                values['User']='foreign'
                with self.assertRaisesRegex(ValueError,'another user'):module.check(unit,install,'gpuser')
                values['User']='gpuser';values['ExecStart']=f'{{ path={exe} ; argv[]={exe} -m foreign ; }}'
                with self.assertRaisesRegex(ValueError,'foreign ExecStart'):module.check(unit,install,'gpuser')

if __name__=='__main__':unittest.main()
