from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
import logging

import yfinance as yf

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class Quote:
    symbol: str
    ts: datetime
    price: Decimal
    open: Decimal | None = None
    high: Decimal | None = None
    low: Decimal | None = None
    volume: int | None = None


@dataclass(slots=True)
class HistoricalBar:
    ts: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int


def _to_decimal(value) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (ValueError, TypeError):
        return None


def fetch_quote(symbol: str, include_prepost: bool = True) -> Quote | None:
    """Fetch the latest 1-minute bar (incl. pre/post-market by default).

    Pre-market data on yfinance can be thin/spiky; the rule engine still
    evaluates on whatever the latest persisted close is, so noisy ticks
    may briefly trigger thresholds. Worst case = a one-off Slack alert.
    """
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(
            period="1d",
            interval="1m",
            auto_adjust=False,
            prepost=include_prepost,
        )
        if not df.empty:
            last = df.iloc[-1]
            ts = df.index[-1].to_pydatetime().astimezone(timezone.utc)
            return Quote(
                symbol=symbol,
                ts=ts,
                price=_to_decimal(last["Close"]),
                open=_to_decimal(last["Open"]),
                high=_to_decimal(last["High"]),
                low=_to_decimal(last["Low"]),
                volume=int(last["Volume"]) if last["Volume"] else None,
            )
        # Fallback: fast_info (delayed)
        info = ticker.fast_info
        price = _to_decimal(getattr(info, "last_price", None))
        if price is None:
            return None
        return Quote(symbol=symbol, ts=datetime.now(timezone.utc), price=price)
    except Exception as e:
        logger.warning("yfinance fetch_quote(%s) failed: %s", symbol, e)
        return None


def fetch_previous_close(symbol: str) -> Decimal | None:
    """Previous trading-day close (RTH). Used to compute today's P/L."""
    try:
        df = yf.Ticker(symbol).history(period="5d", interval="1d", auto_adjust=False)
    except Exception as e:
        logger.warning("fetch_previous_close(%s) error: %s", symbol, e)
        return None
    if df.empty or "Close" not in df.columns or len(df) < 2:
        return None
    return _to_decimal(df["Close"].iloc[-2])


def fetch_history(symbol: str, period: str = "5y") -> list[HistoricalBar]:
    """Daily bars over the given period, for ATH seeding."""
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval="1d", auto_adjust=False)
        if df.empty:
            return []
        bars: list[HistoricalBar] = []
        for ts, row in df.iterrows():
            bars.append(
                HistoricalBar(
                    ts=ts.to_pydatetime().astimezone(timezone.utc),
                    open=_to_decimal(row["Open"]),
                    high=_to_decimal(row["High"]),
                    low=_to_decimal(row["Low"]),
                    close=_to_decimal(row["Close"]),
                    volume=int(row["Volume"]) if row["Volume"] else 0,
                )
            )
        return bars
    except Exception as e:
        logger.warning("yfinance fetch_history(%s) failed: %s", symbol, e)
        return []
