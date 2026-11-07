from datetime import datetime

import pytest

from app.llm.client import SarvamLLMClient
from app.services.date_utils import IST


class _StopAfterCapture(Exception):
    pass


def _capture_system_prompt(client, monkeypatch):
    captured = {}

    def fake_request(messages, *a, **k):
        captured["system"] = messages[0]["content"]
        raise _StopAfterCapture

    monkeypatch.setattr(client, "_make_request", fake_request)
    with pytest.raises(_StopAfterCapture):
        client.parse_intent("spent 100 on tea")
    return captured["system"]


def test_intent_prompt_date_is_ist_and_refreshed_per_call(monkeypatch):
    client = SarvamLLMClient(api_key="test-key")

    # 23:00 UTC on 14 Oct is already 15 Oct in IST.
    monkeypatch.setattr(
        "app.llm.client.get_current_ist_datetime",
        lambda: datetime(2026, 10, 15, 4, 30, tzinfo=IST),
    )
    assert "Current date (IST): 2026-10-15" in _capture_system_prompt(client, monkeypatch)

    # Same long-lived client (the /intent router keeps a singleton) must see the new day.
    monkeypatch.setattr(
        "app.llm.client.get_current_ist_datetime",
        lambda: datetime(2026, 10, 16, 9, 0, tzinfo=IST),
    )
    assert "Current date (IST): 2026-10-16" in _capture_system_prompt(client, monkeypatch)
