"""Tests for the economic calendar service helpers + daily report integration.
Heavy DB parts are covered by the local docker smoke (migration + seed).
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.services import daily_report

D = Decimal


def _stub_ctx_with_events(events):
    return {
        "date": "2026-05-31",
        "upcoming_events": events,
        "recent_news": [],
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


def test_report_includes_upcoming_events_section(monkeypatch):
    near = (datetime.now(timezone.utc) + timedelta(hours=20)).isoformat()
    later = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    events = [
        {"event_at": near, "country": "US", "category": "FOMC",
         "name": "FOMC 금리 결정", "importance": "high"},
        {"event_at": later, "country": "US", "category": "CPI",
         "name": "CPI — 5월", "importance": "high"},
    ]
    monkeypatch.setattr(daily_report, "gather_context", lambda db: _stub_ctx_with_events(events))
    monkeypatch.setattr(daily_report.anthropic_client, "generate_briefing", lambda ctx: None)
    monkeypatch.setattr(daily_report.anthropic_client, "summarize_news", lambda items: None)
    _, body = daily_report.build_report(db=None)

    assert "📅 다가오는 매크로 이벤트" in body
    assert "FOMC 금리 결정" in body
    assert "CPI — 5월" in body
    # event 1 < 24h → "오늘/내일" phrasing
    assert "오늘/내일" in body
    # event 2 ≥ 24h → D-N phrasing
    assert "D-" in body


def test_report_omits_events_section_when_empty(monkeypatch):
    monkeypatch.setattr(daily_report, "gather_context", lambda db: _stub_ctx_with_events([]))
    monkeypatch.setattr(daily_report.anthropic_client, "generate_briefing", lambda ctx: None)
    monkeypatch.setattr(daily_report.anthropic_client, "summarize_news", lambda items: None)
    _, body = daily_report.build_report(db=None)
    assert "📅 다가오는 매크로 이벤트" not in body
