"""Process-isolated numeric DSL; not an arbitrary-Python security sandbox.

Only JSON integers and a restricted AST reach the worker. The capability-free
language denies I/O, imports, attributes, loops and user-defined functions.
Windows Job Objects enforce resource limits, not OS file/network permissions.
On POSIX rlimits likewise do not establish a filesystem/network namespace.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time


class WindowsJob:
    """Assign the waiting worker before any untrusted input is sent."""

    def __init__(self, process):
        import ctypes
        from ctypes import wintypes

        class BasicLimits(ctypes.Structure):
            _fields_ = [
                ("PerProcessUserTimeLimit", ctypes.c_longlong),
                ("PerJobUserTimeLimit", ctypes.c_longlong),
                ("LimitFlags", wintypes.DWORD),
                ("MinimumWorkingSetSize", ctypes.c_size_t),
                ("MaximumWorkingSetSize", ctypes.c_size_t),
                ("ActiveProcessLimit", wintypes.DWORD),
                ("Affinity", ctypes.c_size_t),
                ("PriorityClass", wintypes.DWORD),
                ("SchedulingClass", wintypes.DWORD),
            ]

        class IOCounters(ctypes.Structure):
            _fields_ = [(name, ctypes.c_ulonglong) for name in (
                "ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
                "ReadTransferCount", "WriteTransferCount", "OtherTransferCount",
            )]

        class ExtendedLimits(ctypes.Structure):
            _fields_ = [
                ("BasicLimitInformation", BasicLimits),
                ("IoInfo", IOCounters),
                ("ProcessMemoryLimit", ctypes.c_size_t),
                ("JobMemoryLimit", ctypes.c_size_t),
                ("PeakProcessMemoryUsed", ctypes.c_size_t),
                ("PeakJobMemoryUsed", ctypes.c_size_t),
            ]

        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
        kernel.CreateJobObjectW.restype = wintypes.HANDLE
        kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
        kernel.SetInformationJobObject.restype = wintypes.BOOL
        kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        kernel.AssignProcessToJobObject.restype = wintypes.BOOL
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel.CloseHandle.restype = wintypes.BOOL
        handle = kernel.CreateJobObjectW(None, None)
        if not handle:
            raise OSError(ctypes.get_last_error(), "CreateJobObjectW failed")
        self.kernel = kernel
        self.handle = handle
        info = ExtendedLimits()
        info.BasicLimitInformation.LimitFlags = 0x00000002 | 0x00000008 | 0x00000100 | 0x00002000
        info.BasicLimitInformation.PerProcessUserTimeLimit = 2 * 10_000_000
        info.BasicLimitInformation.ActiveProcessLimit = 1
        info.ProcessMemoryLimit = 128 * 1024 * 1024
        if not kernel.SetInformationJobObject(handle, 9, ctypes.byref(info), ctypes.sizeof(info)):
            self.close()
            raise OSError(ctypes.get_last_error(), "SetInformationJobObject failed")
        if not kernel.AssignProcessToJobObject(handle, wintypes.HANDLE(int(process._handle))):
            self.close()
            raise OSError(ctypes.get_last_error(), "AssignProcessToJobObject failed")

    def close(self):
        if getattr(self, "handle", None):
            self.kernel.CloseHandle(self.handle)
            self.handle = None


def run_expression(code, amounts, timeout=2):
    """Run an expression on cents-valued data, returning a structured receipt.

    File and network denial are language capabilities, not an OS namespace.
    Setup failures return ``failed`` and never run uncontained input.
    """
    started = time.monotonic()
    isolation = {
        "language": "numeric-ast-v1",
        "general_python": False,
        "file_access": "not_in_language",
        "network_access": "not_in_language",
        "os_filesystem_namespace": False,
        "os_network_namespace": False,
        "resource_backend": "windows-job-object" if sys.platform == "win32" else "posix-rlimit",
        "resource_limits_applied": False,
        "memory_limit_bytes": 128 * 1024 * 1024,
        "cpu_limit_seconds": 2,
    }

    def finish(status, **fields):
        return {"status": status, **fields, "isolation": isolation,
                "duration_ms": round((time.monotonic() - started) * 1000, 3)}

    if type(code) is not str or not code.strip() or len(code) > 4096:
        return finish("rejected", error="expression must contain 1-4096 characters")
    if type(amounts) is not list or len(amounts) > 10_000:
        return finish("rejected", error="amounts must be a list with at most 10000 integers")
    if any(type(v) is not int or abs(v) > 10**12 for v in amounts):
        return finish("rejected", error="amounts must contain integers within +/- 10^12")
    if type(timeout) not in (int, float) or not 0.01 <= timeout <= 5:
        return finish("rejected", error="timeout must be from 0.01 to 5 seconds")
    payload = json.dumps({"code": code, "amounts": amounts}, ensure_ascii=True).encode("utf-8")
    if len(payload) > 262_144:
        return finish("rejected", error="input exceeds byte limit")
    worker = Path(__file__).with_name("sandbox_worker.py").resolve()
    env = {k: os.environ[k] for k in ("SystemRoot", "WINDIR", "SYSTEMDRIVE") if k in os.environ}
    process = None
    job = None
    try:
        # Some managed Windows hosts virtualize the system temp directory into
        # an AppContainer whose entries cannot be removed by this process.
        # Keep private scratch inside the application's ignored runtime area.
        scratch_root = Path(__file__).resolve().parent.parent / "data" / "sandbox"
        scratch_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="analysis-", dir=scratch_root) as workdir:
            # Windows venv python.exe is a redirector that may spawn the base
            # interpreter. Start the trusted base executable directly so the
            # active-process limit of one cannot race the redirector startup.
            executable = getattr(sys, "_base_executable", sys.executable) if sys.platform == "win32" else sys.executable
            process = subprocess.Popen(
                [executable, "-I", "-S", str(worker)],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                cwd=workdir, env=env,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
            try:
                if sys.platform == "win32":
                    job = WindowsJob(process)
                    isolation["resource_limits_applied"] = True
                try:
                    output, _ = process.communicate(payload, timeout=float(timeout))
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.communicate()
                    return finish("timeout", error="analysis exceeded wall-clock limit")
                if process.returncode != 0 or len(output) > 262_144:
                    return finish("failed", error="worker stopped or exceeded output limit")
                receipt = json.loads(output)
                if sys.platform != "win32":
                    isolation["resource_limits_applied"] = receipt.get("resource_limits") is True
                if not isolation["resource_limits_applied"]:
                    return finish("failed", error="OS resource controls unavailable; execution refused")
                status = receipt.get("status")
                if status not in {"succeeded", "rejected", "failed"}:
                    return finish("failed", error="invalid worker receipt")
                if status == "succeeded":
                    return finish(status, result=receipt.get("result"))
                return finish(status, error=receipt.get("error", "analysis failed"))
            finally:
                # Release the worker's cwd before TemporaryDirectory removes it,
                # including when resource assignment failed before stdin send.
                if process.poll() is None:
                    process.kill()
                    process.communicate()
                if job is not None:
                    job.close()
    except (OSError, ValueError, TypeError):
        return finish("failed", error="resource setup or worker transport failed; execution refused")
    finally:
        if process is not None and process.poll() is None:
            process.kill()
            process.communicate()
        if job is not None:
            job.close()


class Sandbox:
    run_expression = staticmethod(run_expression)
