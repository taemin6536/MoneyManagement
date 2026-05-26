"""Lightweight historical series helpers — closes per symbol, RSI history."""

from dataclasses import dataclass
from datetime import date
from typing import Literal
import logging

import pandas as pd
import yfinance as yf

from app.services.signals import compute_rsi

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class CloseSeries:
    symbol: str
    days: int
    closes: list[float]


def fetch_closes(symbol: str, days: int = 30) -> CloseSeries:
    """Daily closes for the trailing window (most recent last)."""
    period_days = max(days + 5, 30)
    try:
        df = yf.Ticker(symbol).history(period=f"{period_days}d", interval="1d", auto_adjust=False)
    except Exception as e:
        logger.warning("fetch_closes(%s) yfinance error: %s", symbol, e)
        return CloseSeries(symbol=symbol, days=days, closes=[])
    if df.empty or "Close" not in df.columns:
        return CloseSeries(symbol=symbol, days=days, closes=[])
    closes = [round(float(v), 4) for v in df["Close"].tail(days).tolist()]
    return CloseSeries(symbol=symbol, days=len(closes), closes=closes)


@dataclass(slots=True)
class RsiHistory:
    symbol: str
    days: int
    values: list[float]


def fetch_rsi_history(symbol: str = "QQQ", days: int = 30, period: int = 14) -> RsiHistory:
    """Daily RSI(period) over the last `days` closes."""
    period_days = max(days + period + 5, 60)
    try:
        df = yf.Ticker(symbol).history(period=f"{period_days}d", interval="1d", auto_adjust=False)
    except Exception as e:
        logger.warning("fetch_rsi_history(%s) yfinance error: %s", symbol, e)
        return RsiHistory(symbol=symbol, days=days, values=[])
    if df.empty or "Close" not in df.columns:
        return RsiHistory(symbol=symbol, days=days, values=[])

    closes = df["Close"]
    rsi_values: list[float] = []
    for end_idx in range(len(closes)):
        window = closes.iloc[: end_idx + 1]
        rsi = compute_rsi(window, period=period)
        if rsi is None:
            continue
        rsi_values.append(round(float(rsi), 2))
    rsi_values = rsi_values[-days:]
    return RsiHistory(symbol=symbol, days=len(rsi_values), values=rsi_values)
