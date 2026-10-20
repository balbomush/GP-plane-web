#!/usr/bin/env python3
"""Read-only ownership of a loaded Web unit, including vendor/stopped units."""
import argparse
from pathlib import Path
import re
import subprocess


def check(unit_path: Path, install_root: Path, install_user: str) -> None:
    def value(name):
        return subprocess.run(['systemctl','show','--property='+name,'--value','gp-web.service'],
                              check=True,capture_output=True,text=True,timeout=5).stdout.strip()
    load=value('LoadState')
    fragment=value('FragmentPath')
    if load=='not-found' and not fragment:
        return
    if load!='loaded' or fragment!=str(unit_path):
        raise ValueError('foreign or unsupported loaded gp-web.service; nothing stopped')
    if not unit_path.is_file() or unit_path.is_symlink():
        raise ValueError('loaded Web fragment is not our regular unit file')
    marker=install_root/'.gp-web-owned'
    if marker.is_symlink() or not marker.is_file() or marker.read_text().strip()!='GP Plane Web':
        raise ValueError('loaded Web unit has no owned installation')
    if value('User')!=install_user:
        raise ValueError('loaded Web unit belongs to another user')
    executable=str(install_root/'.venv/bin/python')
    command=value('ExecStart')
    if not re.search(r'\bpath='+re.escape(executable)+r'\s*;',command) or not re.search(
            r'argv\[\]='+re.escape(executable)+r' -m gp_control_plane_web\.cli\s*;',command):
        raise ValueError('loaded Web unit has a foreign ExecStart')


if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--unit-path',required=True,type=Path)
    p.add_argument('--install-root',required=True,type=Path)
    p.add_argument('--install-user',required=True)
    args=p.parse_args()
    try:check(args.unit_path,args.install_root,args.install_user)
    except (OSError,ValueError,subprocess.SubprocessError) as error:p.exit(1,f'ERROR: {error}\n')
