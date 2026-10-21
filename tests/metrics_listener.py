"""Test-only Web listener + bounded lifecycle metrics, no Core imports."""
import ctypes,gc,importlib.util,json,os,socket,sys,threading,time
from ctypes import wintypes
from pathlib import Path
from gp_control_plane_web.cheroot_connection import WebStreamLifecycle
from gp_control_plane_web.http_runtime import WebHttpRuntime
from gp_control_plane_web.web_app import create_web_app
from gp_control_plane_web.core_client import CoreClient
assert importlib.util.find_spec('gp_control_plane') is None
class _WindowsProcessMemoryCounters(ctypes.Structure):
    _fields_ = [
        ("cb", wintypes.DWORD),
        ("PageFaultCount", wintypes.DWORD),
        ("PeakWorkingSetSize", ctypes.c_size_t),
        ("WorkingSetSize", ctypes.c_size_t),
        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
        ("QuotaPagedPoolUsage", ctypes.c_size_t),
        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
        ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
        ("PagefileUsage", ctypes.c_size_t),
        ("PeakPagefileUsage", ctypes.c_size_t),
    ]

def _process_metrics() -> dict[str, int]:
    """Capture current Windows process resources without adding a dependency."""

    if os.name != "nt":
        import resource

        return {
            "rss_bytes": int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) * 1024,
            "threads": threading.active_count(),
            # A Windows HANDLE is not a Linux descriptor.  The R1 Linux FD
            # measurement is deliberately deferred to its Linux/Pi gate.
            "linux_fd_count": len(tuple(Path("/proc/self/fd").iterdir())),
        }

    # Loading a WinDLL on every sample itself increments process handles.
    # Cache the two stable process APIs so this observer cannot manufacture
    # the leak it is intended to detect.
    libraries = getattr(_process_metrics, "_windows_libraries", None)
    if libraries is None:
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        psapi = ctypes.WinDLL("psapi", use_last_error=True)
        kernel32.GetCurrentProcess.restype = wintypes.HANDLE
        kernel32.GetProcessHandleCount.argtypes = (wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD))
        kernel32.GetProcessHandleCount.restype = wintypes.BOOL
        psapi.GetProcessMemoryInfo.argtypes = (
            wintypes.HANDLE,
            ctypes.POINTER(_WindowsProcessMemoryCounters),
            wintypes.DWORD,
        )
        psapi.GetProcessMemoryInfo.restype = wintypes.BOOL
        libraries = (kernel32, psapi, _WindowsProcessMemoryCounters)
        setattr(_process_metrics, "_windows_libraries", libraries)
    kernel32, psapi, counter_type = libraries
    counters = counter_type()
    counters.cb = ctypes.sizeof(counters)
    handle_count = wintypes.DWORD()
    process = kernel32.GetCurrentProcess()
    if not psapi.GetProcessMemoryInfo(process, ctypes.byref(counters), counters.cb):
        raise ctypes.WinError(ctypes.get_last_error())
    if not kernel32.GetProcessHandleCount(process, ctypes.byref(handle_count)):
        raise ctypes.WinError(ctypes.get_last_error())
    return {
        "rss_bytes": int(counters.WorkingSetSize),
        "threads": threading.active_count(),
        "windows_handles": int(handle_count.value),
    }
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
lifecycle=WebStreamLifecycle()
runtime=WebHttpRuntime(create_web_app(CoreClient('http://127.0.0.1:'+sys.argv[1]),stream_lifecycle=lifecycle),'127.0.0.1',port,stream_lifecycle=lifecycle)
thread=threading.Thread(target=runtime.serve_forever,daemon=True);thread.start()
deadline=time.monotonic()+5
while True:
    try:
        with socket.create_connection(('127.0.0.1',port),timeout=.1):break
    except OSError:
        assert time.monotonic()<deadline;time.sleep(.01)
def emit(kind):
    print(json.dumps({'kind':kind,'metrics':{**_process_metrics(),'active_web_streams':lifecycle.active_count(),'pool_min':runtime._server.requests.min,'pool_max':runtime._server.requests.max,'pool_queue':runtime._server.requests._queue.maxsize}}),flush=True)
print(json.dumps({'kind':'ready','port':port}),flush=True)
try:
    for command in sys.stdin:
        command=command.strip()
        if command=='stop':
            runtime.stop();thread.join(5);assert not thread.is_alive();gc.collect();emit('stopped');break
        assert command in {'metrics','settled-metrics'}
        if command=='settled-metrics':gc.collect()
        emit('metrics')
finally:
    runtime.stop();thread.join(5);assert not thread.is_alive()
