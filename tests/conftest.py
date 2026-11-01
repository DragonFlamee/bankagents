"""Unit tests must not inherit a developer's live-model setting."""
import pytest


@pytest.fixture(autouse=True)
def offline_by_default(monkeypatch):
    monkeypatch.setenv("TRACEBANK_PLANNER", "offline")
