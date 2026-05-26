from decimal import Decimal

import pandas as pd

from app.services.signals import compute_channel_high, compute_rsi

D = Decimal


def test_rsi_returns_none_when_too_few_bars():
    closes = pd.Series([100, 101, 102])
    assert compute_rsi(closes, period=14) is None


def test_rsi_max_when_only_gains():
    closes = pd.Series([100 + i for i in range(20)])
    rsi = compute_rsi(closes, period=14)
    assert rsi == D("100")


def test_rsi_min_when_only_losses():
    closes = pd.Series([100 - i for i in range(20)])
    rsi = compute_rsi(closes, period=14)
    assert rsi is not None
    assert rsi == D("0")


def test_rsi_neutral_around_50_when_balanced():
    # Alternating +1 / -1 days
    vals = [100.0]
    for i in range(40):
        vals.append(vals[-1] + (1 if i % 2 == 0 else -1))
    rsi = compute_rsi(pd.Series(vals), period=14)
    assert rsi is not None
    assert D("40") < rsi < D("60")


def test_channel_high_returns_none_when_too_few_bars():
    highs = pd.Series([100, 101, 102])
    assert compute_channel_high(highs, window=20) is None


def test_channel_high_excludes_current_bar():
    # 21 bars: highs 100..119, then today's high = 200 (huge breakout)
    highs = pd.Series(list(range(100, 120)) + [200.0])
    ch = compute_channel_high(highs, window=20)
    # Prior 20 highs are 100..119; max = 119
    assert ch == D("119.0000")


def test_channel_high_normal_range():
    # 21 bars, today is mid-range; ensure today is excluded from the prior window
    highs = pd.Series([100 + i for i in range(20)] + [105.0])
    ch = compute_channel_high(highs, window=20)
    assert ch == D("119.0000")
