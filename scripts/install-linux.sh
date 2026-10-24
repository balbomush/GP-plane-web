#!/usr/bin/env bash
# Independent Web install/update/remove. Never manages Core, engines or helper.
set -Eeuo pipefail
PATH=/usr/sbin:/usr/bin:/sbin:/bin
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || fail 'run through sudo as the single installation privilege stage'
INSTALL_USER= WHEEL= WHEELHOUSE= SHA256= CORE_URL=http://127.0.0.1:8081 HOST=0.0.0.0 PORT=8080 OP=install
while [ "$#" -gt 0 ]; do
  [ "$#" -ge 2 ] || fail 'option value is missing'
  case "$1" in
    --install-user) INSTALL_USER=$2;; --wheel) WHEEL=$2;; --wheelhouse) WHEELHOUSE=$2;;
    --sha256) SHA256=$2;; --core-url) CORE_URL=$2;; --host) HOST=$2;; --port) PORT=$2;; --operation) OP=$2;;
    *) fail 'unknown option';;
  esac
  shift 2
done
case "$INSTALL_USER" in ''|root|*[!A-Za-z0-9_-]*) fail 'invalid install user';; esac
case "$OP" in install|remove) ;; *) fail 'operation must be install or remove';; esac
case "$HOST" in 0.0.0.0|127.0.0.1) ;; *) fail 'unsupported listen address';; esac
printf '%s' "$PORT" | grep -Eq '^[0-9]{1,5}$' || fail 'invalid Web port'
[ "$PORT" -gt 1023 ] && [ "$PORT" -le 65535 ] || fail 'Web port must be unprivileged'
home=$(getent passwd "$INSTALL_USER" | cut -d: -f6)
[ -n "$home" ] && [ -d "$home" ] && [ ! -L "$home" ] && [ "$(readlink -f "$home")" = "$home" ] || fail 'unsafe install home'
group=$(id -gn "$INSTALL_USER")
root="$home/gp/GP-plane-web"
for d in "$home/gp" "$root"; do
  if [ -e "$d" ] || [ -L "$d" ]; then
    [ -d "$d" ] && [ ! -L "$d" ] && [ "$(readlink -f "$d")" = "$d" ] || fail 'unsafe Web installation path'
  fi
done
unit=/etc/systemd/system/gp-web.service
config=/etc/default/gp-web
for f in "$unit" "$config"; do
  if [ -e "$f" ] || [ -L "$f" ]; then
    [ -f "$f" ] && [ ! -L "$f" ] && [ "$(stat -c %u "$f")" = 0 ] &&
      grep -qx '# Managed by GP Plane Web' "$f" || fail 'foreign Web unit/config; nothing stopped'
  fi
done
if [ -e "$config" ]; then
  mapfile -t saved < <(python3 - "$config" <<'PY'
import shlex,sys
from pathlib import Path
values={}
for line in Path(sys.argv[1]).read_text().splitlines():
    if not line.strip() or line.startswith('#'): continue
    key,sep,value=line.partition('=')
    if not sep or key not in {'GP_WEB_CORE_URL','GP_WEB_HOST','GP_WEB_PORT'} or key in values: raise SystemExit(1)
    parts=shlex.split(value)
    if len(parts)!=1: raise SystemExit(1)
    values[key]=parts[0]
for key in ['GP_WEB_CORE_URL','GP_WEB_HOST','GP_WEB_PORT']: print(values[key])
PY
  )
  [ "${#saved[@]}" -eq 3 ] || fail 'invalid existing Web config; nothing stopped'
  CORE_URL=${saved[0]}; HOST=${saved[1]}; PORT=${saved[2]}
  case "$HOST" in 0.0.0.0|127.0.0.1) ;; *) fail 'invalid saved Web host';; esac
  printf '%s' "$PORT" | grep -Eq '^[0-9]{1,5}$' && [ "$PORT" -gt 1023 ] && [ "$PORT" -le 65535 ] || fail 'invalid saved Web port'
fi
if [ -e "$root" ]; then
  [ -f "$root/.gp-web-owned" ] && [ ! -L "$root/.gp-web-owned" ] &&
    [ "$(cat "$root/.gp-web-owned")" = 'GP Plane Web' ] || fail 'foreign install directory; nothing stopped'
fi
python3 "$(dirname "$(readlink -f "$0")")/check-web-service.py" --unit-path "$unit" --install-root "$root" --install-user "$INSTALL_USER"
if [ "$OP" = remove ]; then
  # Removal requires ownership proof even when a prior partial install has no root.
  [ -e "$root/.gp-web-owned" ] || { [ ! -e "$unit" ] && [ ! -e "$config" ]; } || fail 'incomplete ownership; nothing stopped'
  if [ -e "$unit" ]; then systemctl disable --now gp-web.service; fi
  rm -f -- "$unit" "$config"
  rm -rf --one-file-system -- "$root"
  systemctl daemon-reload
  printf '%s\n' 'Web removed; Core and its data/helper were not changed'
  exit 0
fi
RUNTIME_LOCK="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)/requirements-runtime.lock"
[ -f "$RUNTIME_LOCK" ] && [ ! -L "$RUNTIME_LOCK" ] || fail 'packaged runtime lock is required; use the complete source distribution'
[ -f "$WHEEL" ] && [ ! -L "$WHEEL" ] && [ -d "$WHEELHOUSE" ] && [ ! -L "$WHEELHOUSE" ] || fail 'prepared artifacts are required'
printf '%s' "$SHA256" | grep -Eq '^[0-9a-f]{64}$' || fail 'exact wheel sha256 is required'
[ "$(sha256sum "$WHEEL" | cut -d' ' -f1)" = "$SHA256" ] || fail 'wheel checksum mismatch; nothing stopped'
prepare=$(mktemp -d /tmp/gp-web-prepare.XXXXXX)
trap 'rm -rf --one-file-system -- "$prepare"' EXIT
chmod 0755 "$prepare"
# Own a stable offline input set before any removal, including nested source inputs.
install -d -m 0755 "$prepare/wheels"
python3 - "$WHEEL" "$WHEELHOUSE" "$prepare/wheels" "$SHA256" <<'PY'
import hashlib,shutil,sys
from pathlib import Path
wheel,house,dest,expected=sys.argv[1:]; source=Path(wheel).resolve(strict=True); dest=Path(dest)
for p in Path(house).resolve(strict=True).glob('*.whl'):
    if p.is_symlink() or not p.is_file(): raise ValueError('unsafe dependency wheel')
    shutil.copyfile(p,dest/p.name)
shutil.copyfile(source,dest/source.name)
assert hashlib.sha256((dest/source.name).read_bytes()).hexdigest()==expected, 'staged Web wheel checksum mismatch'
PY
WHEEL="$prepare/wheels/$(basename "$WHEEL")"
WHEELHOUSE="$prepare/wheels"
install -m 0644 "$RUNTIME_LOCK" "$prepare/runtime.lock"
cmp -s "$RUNTIME_LOCK" "$prepare/runtime.lock" || fail 'staged Web runtime lock mismatch; nothing stopped'
install -d -m 0700 -o "$INSTALL_USER" -g "$group" "$prepare/runtime"
runuser -u "$INSTALL_USER" -- python3 -m venv "$prepare/runtime/venv"
runuser -u "$INSTALL_USER" -- "$prepare/runtime/venv/bin/python" -m pip install --no-index --find-links "$WHEELHOUSE" --require-hashes -r "$prepare/runtime.lock"
runuser -u "$INSTALL_USER" -- "$prepare/runtime/venv/bin/python" -m pip install --no-index --no-deps --find-links "$WHEELHOUSE" "$WHEEL"
runuser -u "$INSTALL_USER" -- "$prepare/runtime/venv/bin/python" -m pip check
runuser -u "$INSTALL_USER" -- "$prepare/runtime/venv/bin/python" -I -c '
import importlib.util, json, socket, sys, urllib.request
from urllib.parse import urlsplit
from importlib.resources import files
from gp_control_plane_web.cli import create_web_runtime
from gp_control_plane_web.compatibility import validate_core_contract
url,host,port=sys.argv[1:]; parsed=urlsplit(url)
assert parsed.scheme=="http" and parsed.hostname in {"127.0.0.1","localhost"} and parsed.path in {"","/"}, "Core must be local"
assert importlib.util.find_spec("gp_control_plane") is None, "Web must not install Core"
assert files("gp_control_plane_web").joinpath("static/index.html").is_file(), "compiled assets missing"
with urllib.request.urlopen(url.rstrip("/")+"/openapi.json",timeout=5) as r:
    contract=json.load(r)
validate_core_contract(contract)
runtime=create_web_runtime(host,int(port),core_url=url)
runtime.stop()
' "$CORE_URL" "$HOST" "$PORT"
# A busy port is allowed only for our identified existing Web. Never stop a foreign owner.
python3 - "$PORT" "$root" <<'PY'
import pathlib,re,socket,subprocess,sys
port,root=sys.argv[1:]
with socket.socket() as s:
    s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
    try: s.bind(('0.0.0.0',int(port)))
    except OSError:
        pid=subprocess.check_output(['systemctl','show','--property=MainPID','--value','gp-web.service'],text=True).strip()
        assert pid.isdigit() and int(pid)>1, 'foreign occupied Web port; nothing stopped'
        args=(pathlib.Path('/proc')/pid/'cmdline').read_bytes().split(b'\0')
        assert str(pathlib.Path(root)/'.venv/bin/python').encode() in args and b'gp_control_plane_web.cli' in args, 'foreign Web process'
        rows=subprocess.check_output(['ss','-H','-ltnp',f'sport = :{port}'],text=True).splitlines()
        assert rows and all(set(re.findall(r'pid=(\d+)',r))=={pid} for r in rows), 'foreign Web listener'
PY
# Destructive boundary: only Web-owned objects below, never gp-control-plane-*.
if [ -e "$unit" ]; then systemctl disable --now gp-web.service; fi
rm -rf --one-file-system -- "$root"
install -d -m 0755 -o "$INSTALL_USER" -g "$group" "$root"
runuser -u "$INSTALL_USER" -- python3 -m venv "$root/.venv"
runuser -u "$INSTALL_USER" -- "$root/.venv/bin/python" -m pip install --no-index --find-links "$WHEELHOUSE" --require-hashes -r "$prepare/runtime.lock"
runuser -u "$INSTALL_USER" -- "$root/.venv/bin/python" -m pip install --no-index --no-deps --find-links "$WHEELHOUSE" "$WHEEL"
runuser -u "$INSTALL_USER" -- "$root/.venv/bin/python" -m pip check
printf '%s\n' 'GP Plane Web' > "$root/.gp-web-owned"
chown "$INSTALL_USER:$group" "$root/.gp-web-owned"
if [ ! -e "$config" ]; then
  cat > "$config" <<EOF
# Managed by GP Plane Web
GP_WEB_CORE_URL='$CORE_URL'
GP_WEB_HOST='$HOST'
GP_WEB_PORT='$PORT'
EOF
  chmod 0644 "$config"
fi
cat > "$unit" <<EOF
# Managed by GP Plane Web
[Unit]
Description=GP Plane Web
After=network-online.target
[Service]
User=$INSTALL_USER
WorkingDirectory=$root
EnvironmentFile=$config
ExecStart=$root/.venv/bin/python -m gp_control_plane_web.cli
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now gp-web.service
printf '%s\n' 'Web installation complete; Core and its state/helper were not changed'
