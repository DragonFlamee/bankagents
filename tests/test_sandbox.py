import sys

import pytest

from banking_agent.sandbox import run_expression


@pytest.mark.parametrize("code,amounts,expected", [
    ("sum(amounts)", [1050, 250, -100], 1200),
    ("len(amounts)", [1, 2, 3], 3),
    ("max(amounts)-min(amounts)", [100, 400, 200], 300),
    ("round(sum(amounts)/len(amounts),2)", [100, 101, 104], 101.67),
    ("sum([1, 2, 3]) + abs(-4)", [], 10),
    ("sorted(amounts)", [3, 1, 2], [1, 2, 3]),
    ("sum(amounts)", [10**12] * 10000, 10**16),
])
def test_numeric_expression_isolated_and_limited(code, amounts, expected):
    result = run_expression(code, amounts)
    assert result["status"] == "succeeded", result
    assert result["result"] == expected
    info = result["isolation"]
    assert info["resource_limits_applied"] is True
    assert info["resource_backend"] == ("windows-job-object" if sys.platform == "win32" else "posix-rlimit")
    assert info["general_python"] is False
    assert info["os_filesystem_namespace"] is False
    assert result["duration_ms"] > 0


@pytest.mark.parametrize("code", [
    "open('secret.txt').read()",
    "__import__('os').system('whoami')",
    "amounts.__class__",
    "sum.__globals__",
    "import socket",
    "while True: pass",
    "[x for x in amounts]",
    "lambda: 1",
    "(lambda: 1)()",
    "sum(amounts, start=5)",
    "[0]*1000000000",
    "amounts * 1000000000",
    "2 ** 1000000000",
    "10 ** (10 ** 10)",
    "True + 1",
    "'secret'",
    "1e309",
    "sum(amounts)/0",
    "round(1, 1000000)",
    "unknown",
    "2 << 1000000",
    "max([])",
])
def test_non_language_and_resource_attacks_rejected(code):
    result = run_expression(code, [1, 2, 3])
    assert result["status"] == "rejected", result
    assert "result" not in result
    assert result["isolation"]["resource_limits_applied"] is True


@pytest.mark.parametrize("code,amounts", [
    ("1" * 4097, []),
    ("sum(amounts)", [1] * 10001),
    ("sum(amounts)", [True]),
    ("sum(amounts)", [1.2]),
    ("sum(amounts)", [10**13]),
    ("sum(amounts)", "[1,2]"),
    ("", []),
])
def test_input_limits_reject_before_subprocess(code, amounts):
    result = run_expression(code, amounts)
    assert result["status"] == "rejected"
    assert result["isolation"]["resource_limits_applied"] is False


def test_expression_size_limit():
    result = run_expression("+".join(["1"] * 140), [])
    assert result["status"] == "rejected"


def test_expression_depth_limit():
    result = run_expression("abs(" * 30 + "1" + ")" * 30, [])
    assert result["status"] == "rejected"


@pytest.mark.parametrize("timeout", [0, 6, True, float("nan")])
def test_wall_clock_limit_cannot_be_disabled(timeout):
    assert run_expression("1", [], timeout=timeout)["status"] == "rejected"


def test_wall_clock_timeout_terminates_worker():
    result = run_expression("sum(amounts)", list(range(10000)), timeout=0.01)
    assert result["status"] == "timeout", result
    assert "result" not in result


def test_setup_failure_fails_closed(monkeypatch):
    import banking_agent.sandbox as module

    if sys.platform == "win32":
        def broken_job(_):
            raise OSError("simulated resource policy failure")
        monkeypatch.setattr(module, "WindowsJob", broken_job)
    else:
        def broken_popen(*args, **kwargs):
            raise OSError("simulated resource policy failure")
        monkeypatch.setattr(module.subprocess, "Popen", broken_popen)
    result = run_expression("sum(amounts)", [1, 2])
    assert result["status"] == "failed"
    assert "result" not in result
    assert result["isolation"]["resource_limits_applied"] is False


def test_worker_environment_contains_no_parent_secret(monkeypatch):
    monkeypatch.setenv("TRACEBANK_PRIVATE_TEST_SECRET", "never-pass-this-to-worker")
    result = run_expression("__import__('os').environ", [])
    assert result["status"] == "rejected"


def test_report_is_explicit_about_no_namespace_isolation():
    result = run_expression("1", [])
    assert result["isolation"]["file_access"] == "not_in_language"
    assert result["isolation"]["network_access"] == "not_in_language"
    assert result["isolation"]["os_network_namespace"] is False
