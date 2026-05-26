from decimal import Decimal

from app.rules.rule_overheated import OverheatedSignals, evaluate, signals_hit_count

D = Decimal


def _sig(channel=False, rsi=False, fgi=False, **kwargs):
    return OverheatedSignals(
        channel_breakout=channel,
        rsi_overbought=rsi,
        fgi_extreme_greed=fgi,
        **kwargs,
    )


def test_no_alert_when_zero_signals():
    assert evaluate(_sig(), qqq_price=D("500")) == []


def test_no_alert_when_one_signal():
    for s in (_sig(channel=True), _sig(rsi=True), _sig(fgi=True)):
        assert evaluate(s, qqq_price=D("500")) == []


def test_alert_when_two_signals():
    s = _sig(channel=True, rsi=True, rsi_value=D("82"))
    events = evaluate(s, qqq_price=D("500"))
    assert len(events) == 1
    assert events[0].level == "overheated"


def test_alert_when_three_signals():
    s = _sig(channel=True, rsi=True, fgi=True, rsi_value=D("85"), fgi_value=D("80"))
    events = evaluate(s, qqq_price=D("500"))
    assert len(events) == 1


def test_signal_count_helper():
    assert signals_hit_count(_sig()) == 0
    assert signals_hit_count(_sig(channel=True)) == 1
    assert signals_hit_count(_sig(channel=True, fgi=True)) == 2
    assert signals_hit_count(_sig(channel=True, rsi=True, fgi=True)) == 3
