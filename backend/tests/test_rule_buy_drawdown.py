from decimal import Decimal

from app.rules import rule_buy_drawdown as r


D = Decimal


def test_no_alerts_at_ath():
    events = r.evaluate(qqq_price=D("500"), qqq_ath=D("500"))
    assert events == []


def test_no_alerts_above_minus_15():
    # -14.99% drawdown: not yet triggered
    events = r.evaluate(qqq_price=D("425.05"), qqq_ath=D("500"))
    assert events == []


def test_one_alert_at_minus_15():
    # exactly -15%
    events = r.evaluate(qqq_price=D("425"), qqq_ath=D("500"))
    assert len(events) == 1
    assert events[0].level == "drawdown_-15"


def test_two_alerts_at_minus_22():
    # -22% triggers -15 and -20
    events = r.evaluate(qqq_price=D("390"), qqq_ath=D("500"))
    levels = {e.level for e in events}
    assert levels == {"drawdown_-15", "drawdown_-20"}


def test_three_alerts_at_minus_30():
    events = r.evaluate(qqq_price=D("350"), qqq_ath=D("500"))
    levels = {e.level for e in events}
    assert levels == {"drawdown_-15", "drawdown_-20", "drawdown_-25"}


def test_zero_ath_returns_empty():
    assert r.evaluate(qqq_price=D("400"), qqq_ath=D("0")) == []


def test_cash_suggestion_included_when_cash_provided():
    events = r.evaluate(qqq_price=D("425"), qqq_ath=D("500"), cash_usd=D("10000"))
    body = events[0].body
    # 10% of $10,000 = $1,000
    assert "$1,000.00" in body


def test_cash_suggestion_omitted_when_no_cash():
    events = r.evaluate(qqq_price=D("425"), qqq_ath=D("500"))
    assert "권장 매수액" not in events[0].body


def test_deepest_step_picks_lowest_threshold():
    step = r.deepest_step(D("-22"))
    assert step is not None
    assert step.threshold_pct == D("-20")


def test_deepest_step_none_when_no_trigger():
    assert r.deepest_step(D("-5")) is None
