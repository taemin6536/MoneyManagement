from decimal import Decimal

from app.rules import rule_sell_recovery as r

D = Decimal


def test_no_alert_below_recovery_gap():
    # 2% below ATH, gap exceeds default 0.5%
    events = r.evaluate(qqq_price=D("490"), qqq_ath=D("500"))
    assert events == []


def test_alert_within_recovery_gap():
    # 0.2% below ATH, within default 0.5% gap
    events = r.evaluate(qqq_price=D("499"), qqq_ath=D("500"))
    assert len(events) == 1
    assert events[0].level == "recovery"


def test_alert_at_or_above_ath():
    events = r.evaluate(qqq_price=D("500"), qqq_ath=D("500"))
    assert len(events) == 1
    events = r.evaluate(qqq_price=D("510"), qqq_ath=D("500"))
    assert len(events) == 1


def test_zero_ath_returns_empty():
    assert r.evaluate(qqq_price=D("100"), qqq_ath=D("0")) == []
