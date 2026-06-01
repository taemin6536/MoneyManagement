"""Tests for Telegram delivery: markdown→HTML conversion and plain-text
fallback. No real network — httpx.post is faked to capture the payload."""

import httpx

from app.integrations import telegram


class _FakeResp:
    def __init__(self, status_code=200, text="ok"):
        self.status_code = status_code
        self.text = text


def _capture(monkeypatch, *, status_codes):
    """Patch httpx.post to record payloads and return the queued statuses."""
    calls: list[dict] = []
    seq = iter(status_codes)

    def fake_post(url, json=None, timeout=None):
        calls.append(json)
        return _FakeResp(status_code=next(seq))

    monkeypatch.setattr(telegram.httpx, "post", fake_post)
    return calls


def test_noop_without_token_or_chat(monkeypatch):
    calls = _capture(monkeypatch, status_codes=[200])
    assert telegram.send(None, "123", "t", "b") is False
    assert telegram.send("tok", None, "t", "b") is False
    assert calls == []


def test_double_asterisk_bold_becomes_html(monkeypatch):
    # The AI news summary emits **bold** — legacy Markdown 400s on this; HTML
    # mode must render it as <b>…</b> and deliver successfully.
    calls = _capture(monkeypatch, status_codes=[200])
    ok = telegram.send("tok", "chat", "제목", "**Fed** 금리 동결, _주의_")
    assert ok is True
    assert len(calls) == 1
    payload = calls[0]
    assert payload["parse_mode"] == "HTML"
    assert "<b>제목</b>" in payload["text"]
    assert "<b>Fed</b>" in payload["text"]
    assert "<i>주의</i>" in payload["text"]
    assert "**" not in payload["text"]


def test_single_asterisk_bold_becomes_html(monkeypatch):
    calls = _capture(monkeypatch, status_codes=[200])
    telegram.send("tok", "chat", "t", "Drawdown *-7.41%*")
    assert "<b>-7.41%</b>" in calls[0]["text"]


def test_html_special_chars_escaped(monkeypatch):
    calls = _capture(monkeypatch, status_codes=[200])
    telegram.send("tok", "chat", "t", "a < b & c > d")
    text = calls[0]["text"]
    assert "&lt;" in text and "&amp;" in text and "&gt;" in text


def test_falls_back_to_plain_text_on_rejection(monkeypatch):
    # First (HTML) attempt 400s; second (plain) attempt succeeds.
    calls = _capture(monkeypatch, status_codes=[400, 200])
    ok = telegram.send("tok", "chat", "제목", "**굵게** 그리고 _기울임_")
    assert ok is True
    assert len(calls) == 2
    # First call used HTML, second was plain text with markers stripped.
    assert calls[0]["parse_mode"] == "HTML"
    assert "parse_mode" not in calls[1]
    assert "**" not in calls[1]["text"]
    assert "_" not in calls[1]["text"]
    assert "굵게" in calls[1]["text"] and "기울임" in calls[1]["text"]


def test_returns_false_when_both_attempts_fail(monkeypatch):
    calls = _capture(monkeypatch, status_codes=[400, 400])
    assert telegram.send("tok", "chat", "t", "*x*") is False
    assert len(calls) == 2


def test_network_error_returns_false(monkeypatch):
    def boom(url, json=None, timeout=None):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(telegram.httpx, "post", boom)
    assert telegram.send("tok", "chat", "t", "b") is False


def test_long_body_truncated(monkeypatch):
    calls = _capture(monkeypatch, status_codes=[200])
    telegram.send("tok", "chat", "t", "x" * 5000)
    # Stays within Telegram's 4096 limit.
    assert len(calls[0]["text"]) <= 4096
