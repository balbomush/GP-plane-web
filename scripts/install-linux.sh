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
# Serialize only this Web installer; the root-owned config directory is outside
# the disposable program tree. No Core lock, state or service is involved.
lock=/etc/default/.gp-web-install.lock
[ -d /etc/default ] && [ ! -L /etc/default ] && [ "$(stat -c %u /etc/default)" = 0 ] || fail 'unsafe Web config directory'
if [ -e "$lock" ] || [ -L "$lock" ]; then
  [ -f "$lock" ] && [ ! -L "$lock" ] && [ "$(stat -c %u "$lock")" = 0 ] && [ "$(stat -c %h "$lock")" = 1 ] || fail 'foreign Web installer lock'
fi
(umask 077; touch -- "$lock")
exec 9<> "$lock"
flock -n 9 || fail 'another Web install/remove is running; nothing stopped'
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
python3 "$(dirname "$(readlink -f "$0")")/check-web-service.py" --unit-path "$unit" --install-root "$root" --install-user "$INSTALL_USER" --config-path "$config"
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
shopt -s nullglob
previous_installs=("$root"/.previous.*)
[ "${#previous_installs[@]}" -eq 0 ] || fail 'previous Web switch needs inspection; retained files were not removed; nothing stopped'
RUNTIME_LOCK="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)/requirements-runtime.lock"
[ -f "$RUNTIME_LOCK" ] && [ ! -L "$RUNTIME_LOCK" ] || fail 'packaged runtime lock is required; use the complete source distribution'
[ -f "$WHEEL" ] && [ ! -L "$WHEEL" ] && [ -d "$WHEELHOUSE" ] && [ ! -L "$WHEELHOUSE" ] || fail 'prepared artifacts are required'
printf '%s' "$SHA256" | grep -Eq '^[0-9a-f]{64}$' || fail 'exact wheel sha256 is required'
[ "$(sha256sum "$WHEEL" | cut -d' ' -f1)" = "$SHA256" ] || fail 'wheel checksum mismatch; nothing stopped'
prepare=$(mktemp -d /tmp/gp-web-prepare.XXXXXX)
runtime= previous= created_root=no switched=no phase=preparation
cleanup() {
  local result=$?
  trap - EXIT
  if ! rm -rf --one-file-system -- "$prepare"; then
    printf 'ERROR: retained preparation directory: %s\n' "$prepare" >&2
    result=1
  fi
  if [ "$switched" = no ]; then
    [ -z "$runtime" ] || rm -rf --one-file-system -- "$runtime"
    if [ "$created_root" = yes ]; then
      rm -f -- "$root/.gp-web-owned"
      rmdir -- "$root" || printf 'ERROR: retained incomplete first-install directory: %s\n' "$root" >&2
    fi
  fi
  return "$result"
}
trap cleanup EXIT
report_failure() {
  printf "ERROR: Web install failed; phase=%s switched=%s program=%s previous=%s runtime=%s; config preserved; no rollback performed\n" "$phase" "$switched" "$root" "$previous" "$runtime" >&2
}
trap report_failure ERR
trap 'report_failure; exit 130' INT
trap 'report_failure; exit 143' TERM
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
install -d -m 0700 -o "$INSTALL_USER" -g "$group" "$prepare/runtime/pip-cache" "$prepare/runtime/pip-tmp"
target_home="$home"
# pip must not inherit user/site/global config or redirecting PIP_* options.
# Preserve only explicit network/proxy trust settings; all writes stay in the
# selected venv or this user-owned preparation namespace (including build children).
pip_user() {
  local pip_python="$1"; shift
  local pip_proxy
  local -a pip_environment=("PATH=$PATH" "HOME=$target_home" "USER=$INSTALL_USER" "LOGNAME=$INSTALL_USER"
    "PIP_CONFIG_FILE=/dev/null" "PIP_CACHE_DIR=$prepare/runtime/pip-cache"
    "TMPDIR=$prepare/runtime/pip-tmp" "TMP=$prepare/runtime/pip-tmp" "TEMP=$prepare/runtime/pip-tmp"
    "PIP_NO_INPUT=1" "PIP_DISABLE_PIP_VERSION_CHECK=1")
  for pip_proxy in http_proxy https_proxy all_proxy no_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY SSL_CERT_FILE REQUESTS_CA_BUNDLE; do
    if [[ -v "$pip_proxy" ]]; then pip_environment+=("$pip_proxy=${!pip_proxy}"); fi
  done
  runuser -u "$INSTALL_USER" -- env -i "${pip_environment[@]}" "$pip_python" -I -m pip "$@"
}
# Keep the venv at its final physical path: console scripts and activation files
# contain absolute paths. Only the canonical .venv link changes at activation.
if [ ! -e "$root" ]; then
  install -d -m 0755 -o "$INSTALL_USER" -g "$group" "$root"
  printf '%s\n' 'GP Plane Web' > "$root/.gp-web-owned"
  chown "$INSTALL_USER:$group" "$root/.gp-web-owned"
  created_root=yes
fi
runtime=$(mktemp -d "$root/.web-runtime.XXXXXXXX")
chown "$INSTALL_USER:$group" "$runtime"
runuser -u "$INSTALL_USER" -- python3 -m venv "$runtime/.venv"
pip_user "$runtime/.venv/bin/python" install --no-index --find-links "$WHEELHOUSE" --require-hashes -r "$prepare/runtime.lock"
pip_user "$runtime/.venv/bin/python" install --no-index --no-deps --find-links "$WHEELHOUSE" "$WHEEL"
pip_user "$runtime/.venv/bin/python" check
target_version=$(runuser -u "$INSTALL_USER" -- "$runtime/.venv/bin/python" -I -c 'from importlib.metadata import version;from gp_control_plane_web import __version__;assert __version__==version("gp-plane-web");print(__version__)')
[ "$(runuser -u "$INSTALL_USER" -- "$runtime/.venv/bin/gp-web" --version)" = "gp-web $target_version" ] || fail 'prepared Web entrypoint version mismatch; nothing stopped'
runuser -u "$INSTALL_USER" -- "$runtime/.venv/bin/python" -I -c '
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
# Switching boundary: no venv creation or pip after this point. Retain every old
# program entry until the new service has passed HTTP/resource readiness.
phase=switch
if [ -e "$unit" ]; then systemctl stop gp-web.service; fi
switched=yes
previous=$(mktemp -d "$root/.previous.XXXXXXXX")
shopt -s dotglob nullglob
for entry in "$root"/*; do
  case "$entry" in "$runtime"|"$previous"|"$root/.gp-web-owned") continue;; esac
  mv -- "$entry" "$previous/"
done
ln -s -- "$runtime/.venv" "$root/.venv"
if [ ! -e "$config" ]; then
  cat > "$config" <<EOF
# Managed by GP Plane Web
GP_WEB_CORE_URL='$CORE_URL'
GP_WEB_HOST='$HOST'
GP_WEB_PORT='$PORT'
EOF
  chmod 0644 "$config"
fi
new_unit=no
if [ ! -e "$unit" ]; then
  new_unit=yes
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
fi
phase=startup
if [ "$new_unit" = yes ]; then
  systemctl daemon-reload
  systemctl enable --now gp-web.service
else
  # Keep the existing unit bytes, drop-ins and enabled/disabled choice intact.
  systemctl start gp-web.service
fi
[ "$(runuser -u "$INSTALL_USER" -- "$root/.venv/bin/gp-web" --version)" = "gp-web $target_version" ] || fail 'activated Web entrypoint version mismatch; previous program retained'
runuser -u "$INSTALL_USER" -- "$runtime/.venv/bin/python" -I -c '
import hashlib,json,sys,time,urllib.request
from importlib.resources import files
host,port=sys.argv[1:];host="127.0.0.1" if host=="0.0.0.0" else host
base=f"http://{host}:{port}";assets=files("gp_control_plane_web").joinpath("static")
manifest=json.loads(assets.joinpath("asset-manifest.json").read_text())
deadline=time.monotonic()+60
while True:
    try:
        for name,digest in manifest["assets"].items():
            path="/" if name=="index.html" else "/"+name
            with urllib.request.urlopen(base+path,timeout=2) as response:
                data=response.read(8*1024**2+1)
                assert len(data)<=8*1024**2 and response.status==200
                assert hashlib.sha256(data).hexdigest()==digest, "served Web build mismatch"
                if name=="index.html": assert response.headers.get("Cache-Control")=="no-store"
        with urllib.request.urlopen(base+"/api/health",timeout=2) as response:
            assert response.status==200
        break
    except Exception:
        if time.monotonic()>=deadline: raise
        time.sleep(.25)
' "$HOST" "$PORT"
systemctl is-active --quiet gp-web.service || fail 'new Web service is not active; old program retained'
phase=cleanup
rm -rf --one-file-system -- "$previous"
cleanup
printf '%s\n' 'Web installation complete; Core and its state/helper were not changed'
