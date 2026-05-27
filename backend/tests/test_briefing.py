"""Tests for the AI briefing: anthropic_client graceful degradation and
daily_report narrative placement. No real network — the anthropic module is
faked, and gather_context is stubbed for the report test."""

import sys
import types
from decimal import Decimal

from app.integrations import anthropic_client
from app.services import daily_report

D = Decimal


def _patch_settings(monkeypatch, key="", model="claude-haiku-4-5"):
    s = types.SimpleNamespace(anthropic_api_key=key, anthropic_model=model)
    monkeypatch.setattr(anthropic_client, "get_settings", lambda: s)


def _fake_anthropic(monkeypatch, *, text=None, raise_exc=None):
    """Inject a fake `anthropic` module so the in-function import picks it up."""
    mod = types.ModuleType("anthropic")

    class _TextBlock:
        type = "text"

        def __init__(self, t):
            self.text = t

    class _Resp:
        def __init__(self, blocks):
            self.content = blocks

    class _Messages:
        def create(self, **kwargs):
            if raise_exc is not None:
                raise raise_exc
            return _Resp([_TextBlock(text)])

    class _Anthropic:
        def __init__(self, **kwargs):
            self.messages = _Messages()

    mod.Anthropic = _Anthropic
    monkeypatch.setitem(sys.modules, "anthropic", mod)


def test_briefing_none_without_key(monkeypatch):
    _patch_settings(monkeypatch, key="")
    assert anthropic_client.generate_briefing({}) is None


def test_briefing_none_on_api_error(monkeypatch):
    _patch_settings(monkeypatch, key="sk-test")
    _fake_anthropic(monkeypatch, raise_exc=RuntimeError("boom"))
    assert anthropic_client.generate_briefing({}) is None


def test_briefing_returns_text(monkeypatch):
    _patch_settings(monkeypatch, key="sk-test")
    _fake_anthropic(monkeypatch, text="전고점에서 8% 빠졌어요.")
    assert anthropic_client.generate_briefing({}) == "전고점에서 8% 빠졌어요."


def test_briefing_blank_text_is_none(monkeypatch):
    _patch_settings(monkeypatch, key="sk-test")
    _fake_anthropic(monkeypatch, text="   ")
    assert anthropic_client.generate_briefing({}) is None


def _stub_ctx():
    return {
        "date": "2026-05-27",
        "qqq_price": D("500"),
        "qqq_ath": D("540"),
        "qqq_ath_date": "2025-12-01",
        "drawdown_pct": D("-7.41"),
        "next_trigger_price": D("459.00"),
        "tqqq_price": D("80"),
        "qld_price": D("110"),
        "rsi_14": D("62"),
        "channel_breakout": False,
        "fgi_score": 58.0,
        "fgi_rating": "Greed",
        "vix": D("16"),
        "usd_krw": D("1380"),
        "fx_sma_30": D("1365"),
        "fx_deviation_pct": D("1.1"),
        "holdings": [],
        "cash_usd": D("1000"),
        "cash_krw": D("500000"),
        "tactical_usd": D("0"),
    }


def test_build_report_includes_narrative(monkeypatch):
    monkeypatch.setattr(daily_report, "gather_context", lambda db: _stub_ctx())
    monkeypatch.setattr(
        daily_report.anthropic_client, "generate_briefing", lambda ctx: "테스트 브리핑입니다."
    )
    title, body = daily_report.build_report(db=None)
    assert "🤖 오늘의 브리핑" in body
    assert "테스트 브리핑입니다." in body
    # Raw section still present below the narrative.
    assert "전략 anchor (QQQ)" in body
    assert body.index("테스트 브리핑입니다.") < body.index("전략 anchor (QQQ)")


def test_build_report_omits_narrative_when_none(monkeypatch):
    monkeypatch.setattr(daily_report, "gather_context", lambda db: _stub_ctx())
    monkeypatch.setattr(
        daily_report.anthropic_client, "generate_briefing", lambda ctx: None
    )
    title, body = daily_report.build_report(db=None)
    assert "🤖 오늘의 브리핑" not in body
    assert "전략 anchor (QQQ)" in body
