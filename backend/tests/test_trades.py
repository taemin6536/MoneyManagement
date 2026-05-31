"""Tests for the trade journal: KIS row parsing + service-level helpers.
Heavy DB/network parts (sync_from_kis end-to-end) are smoke-tested via the
docker workflow in verification — this file covers pure logic."""

from datetime import datetime, timezone
from decimal import Decimal

import httpx
import pytest

from app.integrations import kis


def _kis_row(**overrides):
    base = {
        "ord_dt": "20260520",
        "ord_tmd": "223015",  # 22:30:15 KST
        "odno": "0000123456",
        "rvse_cncl_dvsn": "00",
        "sll_buy_dvsn_cd": "02",  # buy
        "pdno": "TQQQ",
        "ft_ccld_qty": "10",
        "ft_ccld_unpr3": "78.4500",
        "ft_ccld_amt3": "784.5",
    }
    base.update(overrides)
    return base


class _FakeResponse:
    def __init__(self, payload, tr_cont=""):
        self.status_code = 200
        self._payload = payload
        self.headers = {"tr_cont": tr_cont}

    def json(self):
        return self._payload


def _patch_creds(monkeypatch):
    monkeypatch.setattr(
        kis,
        "_require_creds",
        lambda: ("k", "s", "12345678", "01", False),
    )
    monkeypatch.setattr(kis, "_auth_headers", lambda tr_id: {"tr_id": tr_id})


def test_fetch_trade_history_parses_basic_row(monkeypatch):
    _patch_creds(monkeypatch)
    payload = {
        "rt_cd": "0",
        "output": [_kis_row()],
        "ctx_area_fk200": "",
        "ctx_area_nk200": "",
    }
    monkeypatch.setattr(httpx, "get", lambda *a, **kw: _FakeResponse(payload))

    from datetime import date
    trades = kis.fetch_trade_history(date(2026, 5, 1), date(2026, 5, 31))

    assert len(trades) == 1
    t = trades[0]
    assert t.order_id == "20260520-0000123456"
    assert t.symbol == "TQQQ"
    assert t.side == "buy"
    assert t.quantity == Decimal("10")
    assert t.price_usd == Decimal("78.4500")
    # 22:30:15 KST → 13:30:15 UTC
    assert t.executed_at == datetime(2026, 5, 20, 13, 30, 15, tzinfo=timezone.utc)


def test_fetch_trade_history_skips_canceled(monkeypatch):
    _patch_creds(monkeypatch)
    payload = {
        "rt_cd": "0",
        "output": [
            _kis_row(),                              # normal
            _kis_row(rvse_cncl_dvsn="02", odno="9"), # canceled
        ],
        "ctx_area_fk200": "",
        "ctx_area_nk200": "",
    }
    monkeypatch.setattr(httpx, "get", lambda *a, **kw: _FakeResponse(payload))

    from datetime import date
    trades = kis.fetch_trade_history(date(2026, 5, 1), date(2026, 5, 31))
    assert len(trades) == 1
    assert "9" not in trades[0].order_id


def test_fetch_trade_history_skips_zero_qty(monkeypatch):
    _patch_creds(monkeypatch)
    payload = {
        "rt_cd": "0",
        "output": [_kis_row(ft_ccld_qty="0", odno="10")],
        "ctx_area_fk200": "",
        "ctx_area_nk200": "",
    }
    monkeypatch.setattr(httpx, "get", lambda *a, **kw: _FakeResponse(payload))

    from datetime import date
    trades = kis.fetch_trade_history(date(2026, 5, 1), date(2026, 5, 31))
    assert trades == []


def test_fetch_trade_history_buy_vs_sell(monkeypatch):
    _patch_creds(monkeypatch)
    payload = {
        "rt_cd": "0",
        "output": [
            _kis_row(sll_buy_dvsn_cd="02", odno="1"),  # buy
            _kis_row(sll_buy_dvsn_cd="01", odno="2"),  # sell
        ],
        "ctx_area_fk200": "",
        "ctx_area_nk200": "",
    }
    monkeypatch.setattr(httpx, "get", lambda *a, **kw: _FakeResponse(payload))

    from datetime import date
    trades = kis.fetch_trade_history(date(2026, 5, 1), date(2026, 5, 31))
    sides = sorted(t.side for t in trades)
    assert sides == ["buy", "sell"]


def test_fetch_trade_history_api_error_raises(monkeypatch):
    _patch_creds(monkeypatch)
    monkeypatch.setattr(
        httpx,
        "get",
        lambda *a, **kw: _FakeResponse({"rt_cd": "1", "msg1": "bad"}),
    )

    from datetime import date
    with pytest.raises(kis.KisError):
        kis.fetch_trade_history(date(2026, 5, 1), date(2026, 5, 31))
