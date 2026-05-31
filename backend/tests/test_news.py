"""Tests for the news pipeline: RSS parsing, AI summarization, and daily
report integration. No real network — feedparser and the anthropic module
are faked, and gather_context is stubbed for the report test."""

import sys
import types
from datetime import datetime, timezone
from decimal import Decimal

from app.integrations import anthropic_client, rss
from app.services import daily_report

D = Decimal


def _patch_settings(monkeypatch, key="", model="claude-haiku-4-5"):
    s = types.SimpleNamespace(anthropic_api_key=key, anthropic_model=model)
    monkeypatch.setattr(anthropic_client, "get_settings", lambda: s)


def _fake_anthropic(monkeypatch, *, text=None, raise_exc=None):
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


# -- RSS parsing ----------------------------------------------------------------


def test_fetch_feed_returns_items(monkeypatch):
    """feedparser output → ParsedItem list with HTML stripped + timestamp parsed."""
    fake_mod = types.ModuleType("feedparser")

    fake_entry = types.SimpleNamespace(
        title="Fed Raises Rates",
        link="https://example.com/a",
        summary="<p>The <b>Fed</b> announced a hike of &nbsp;25bps.</p>",
        published_parsed=(2026, 5, 28, 14, 30, 0, 0, 0, 0),
    )
    parsed = types.SimpleNamespace(entries=[fake_entry], bozo=False)
    fake_mod.parse = lambda url, **kwargs: parsed
    monkeypatch.setitem(sys.modules, "feedparser", fake_mod)

    items = rss.fetch_feed("https://example.com/feed.xml")
    assert len(items) == 1
    item = items[0]
    assert item.title == "Fed Raises Rates"
    assert item.link == "https://example.com/a"
    # HTML stripped + whitespace collapsed
    assert "<" not in item.description and "&nbsp;" not in item.description
    assert "Fed" in item.description and "25bps" in item.description
    # Timestamp parsed to UTC
    assert item.published_at == datetime(2026, 5, 28, 14, 30, 0, tzinfo=timezone.utc)


def test_fetch_feed_skips_entries_missing_title_or_link(monkeypatch):
    fake_mod = types.ModuleType("feedparser")
    entries = [
        types.SimpleNamespace(title="No link", summary="x", published_parsed=None),
        types.SimpleNamespace(link="https://example.com/x", summary="x", published_parsed=None),
        types.SimpleNamespace(title="OK", link="https://example.com/ok", summary="x", published_parsed=None),
    ]
    fake_mod.parse = lambda url, **kwargs: types.SimpleNamespace(entries=entries, bozo=False)
    monkeypatch.setitem(sys.modules, "feedparser", fake_mod)

    items = rss.fetch_feed("https://example.com/feed.xml")
    assert len(items) == 1
    assert items[0].title == "OK"


def test_fetch_feed_returns_empty_on_exception(monkeypatch):
    fake_mod = types.ModuleType("feedparser")

    def boom(*args, **kwargs):
        raise RuntimeError("network down")

    fake_mod.parse = boom
    monkeypatch.setitem(sys.modules, "feedparser", fake_mod)

    assert rss.fetch_feed("https://example.com/feed.xml") == []


# -- AI summary -----------------------------------------------------------------


def test_summarize_news_none_without_key(monkeypatch):
    _patch_settings(monkeypatch, key="")
    items = [{"source": "X", "title": "T", "description": "D", "link": "L"}]
    assert anthropic_client.summarize_news(items) is None


def test_summarize_news_none_on_empty_items(monkeypatch):
    _patch_settings(monkeypatch, key="sk-test")
    assert anthropic_client.summarize_news([]) is None


def test_summarize_news_none_on_api_error(monkeypatch):
    _patch_settings(monkeypatch, key="sk-test")
    _fake_anthropic(monkeypatch, raise_exc=RuntimeError("boom"))
    items = [{"source": "X", "title": "T", "description": "D", "link": "L"}]
    assert anthropic_client.summarize_news(items) is None


def test_summarize_news_returns_text(monkeypatch):
    _patch_settings(monkeypatch, key="sk-test")
    _fake_anthropic(monkeypatch, text="Fed가 금리를 25bp 인상했습니다.")
    items = [{"source": "Fed", "title": "Rate hike", "description": "25bp", "link": "L"}]
    assert anthropic_client.summarize_news(items) == "Fed가 금리를 25bp 인상했습니다."


# -- Daily report news section --------------------------------------------------


def _stub_ctx_with_news(news_items):
    return {
        "date": "2026-05-28",
        "recent_news": news_items,
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


def test_report_news_section_uses_summary_when_available(monkeypatch):
    items = [
        {"source": "Fed", "title": "Rate hike", "description": "25bp", "link": "L"},
        {"source": "CNBC", "title": "Tech rallies", "description": None, "link": "L2"},
    ]
    monkeypatch.setattr(daily_report, "gather_context", lambda db: _stub_ctx_with_news(items))
    monkeypatch.setattr(
        daily_report.anthropic_client, "generate_briefing", lambda ctx: None
    )
    monkeypatch.setattr(
        daily_report.anthropic_client, "summarize_news", lambda items: "AI 한국어 뉴스 요약."
    )
    _, body = daily_report.build_report(db=None)
    assert "📰 매크로 뉴스" in body
    assert "AI 한국어 뉴스 요약." in body
    # Headlines should NOT appear when summary is present.
    assert "Rate hike" not in body


def test_report_news_section_falls_back_to_headlines(monkeypatch):
    items = [
        {"source": "Fed", "title": "Rate hike", "description": "25bp", "link": "L"},
        {"source": "CNBC", "title": "Tech rallies", "description": None, "link": "L2"},
    ]
    monkeypatch.setattr(daily_report, "gather_context", lambda db: _stub_ctx_with_news(items))
    monkeypatch.setattr(
        daily_report.anthropic_client, "generate_briefing", lambda ctx: None
    )
    monkeypatch.setattr(
        daily_report.anthropic_client, "summarize_news", lambda items: None
    )
    _, body = daily_report.build_report(db=None)
    assert "📰 매크로 뉴스" in body
    assert "(Fed) Rate hike" in body
    assert "(CNBC) Tech rallies" in body


def test_report_news_section_omitted_when_empty(monkeypatch):
    monkeypatch.setattr(daily_report, "gather_context", lambda db: _stub_ctx_with_news([]))
    monkeypatch.setattr(
        daily_report.anthropic_client, "generate_briefing", lambda ctx: None
    )
    _, body = daily_report.build_report(db=None)
    assert "📰 매크로 뉴스" not in body
