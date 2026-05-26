"""Technical signal computation for Rule ③ (overheated).

Uses yfinance daily history. Results are cached in-process for `cache_ttl` to
avoid hammering yfinance on every 1-minute orchestrator tick.
"""

from dataclasses import dataclass
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from threading import Lock
import logging

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class TechnicalReading:
    """Per-symbol technical snapshot from daily bars."""
    symbol: str
    last_close: Decimal
    last_high: Decimal
    rsi_14: Decimal | None
    channel_high_20: Decimal | None
    channel_breakout: bool
    computed_at: datetime


def compute_rsi(closes: pd.Series, period: int = 14) -> Decimal | None:
    """Wilder's RSI using simple SMA of gains/losses for v1 (Wilder vs SMA gap is small)."""
    if len(closes) < period + 1:
        return None
    delta = closes.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(period).mean().iloc[-1]
    avg_loss = loss.rolling(period).mean().iloc[-1]
    if avg_loss == 0:
        return Decimal("100")
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    if pd.isna(rsi):
        return None
    return Decimal(str(rsi)).quantize(Decimal("0.01"))


def compute_channel_high(highs: pd.Series, window: int = 20) -> Decimal | None:
    """Donchian-style upper channel: max of the prior `window` daily highs (excluding today)."""
    if len(highs) < window + 1:
        return None
    prior = highs.iloc[-(window + 1):-1]
    return Decimal(str(prior.max())).quantize(Decimal("0.0001"))


_CACHE: dict[str, tuple[datetime, TechnicalReading]] = {}
_LOCK = Lock()


def compute_for(symbol: str, cache_ttl: timedelta = timedelta(hours=1)) -> TechnicalReading | None:
    """Fetch ~3 months of daily bars and compute RSI(14) + 20-day channel state."""
    now = datetime.now(timezone.utc)
    with _LOCK:
        cached = _CACHE.get(symbol)
        if cached and (now - cached[0]) < cache_ttl:
            return cached[1]

    try:
        df = yf.Ticker(symbol).history(period="3mo", interval="1d", auto_adjust=False)
    except Exception as e:
        logger.warning("signals.compute_for(%s): yfinance error %s", symbol, e)
        return None
    if df.empty or "Close" not in df.columns:
        return None

    closes = df["Close"]
    highs = df["High"]
    last_close = Decimal(str(closes.iloc[-1])).quantize(Decimal("0.0001"))
    last_high = Decimal(str(highs.iloc[-1])).quantize(Decimal("0.0001"))
    rsi = compute_rsi(closes)
    channel_high = compute_channel_high(highs)
    breakout = bool(channel_high is not None and last_high > channel_high)

    reading = TechnicalReading(
        symbol=symbol,
        last_close=last_close,
        last_high=last_high,
        rsi_14=rsi,
        channel_high_20=channel_high,
        channel_breakout=breakout,
        computed_at=now,
    )
    with _LOCK:
        _CACHE[symbol] = (now, reading)
    return reading


def clear_cache() -> None:
    with _LOCK:
        _CACHE.clear()


@dataclass(slots=True)
class FxSmaReading:
    symbol: str
    last_close: Decimal
    sma_30: Decimal | None
    deviation_pct: Decimal | None  # (last - sma) / sma * 100
    is_dca_buy_zone: bool          # last <= sma * (1 - threshold)
    threshold_pct: Decimal
    computed_at: datetime


def compute_fx_sma(
    symbol: str = "KRW=X",
    window: int = 30,
    deviation_threshold_pct: Decimal = Decimal("1.0"),
    cache_ttl: timedelta = timedelta(hours=6),
) -> FxSmaReading | None:
    """30-day SMA of USD/KRW + deviation. Used for DCA timing alerts."""
    cache_key = f"fxsma:{symbol}:{window}"
    now = datetime.now(timezone.utc)
    with _LOCK:
        cached = _CACHE.get(cache_key)
        if cached and (now - cached[0]) < cache_ttl:
            return cached[1]  # type: ignore[return-value]

    try:
        df = yf.Ticker(symbol).history(period="3mo", interval="1d", auto_adjust=False)
    except Exception as e:
        logger.warning("compute_fx_sma(%s) yfinance error: %s", symbol, e)
        return None
    if df.empty or len(df) < window:
        return None

    closes = df["Close"]
    last = Decimal(str(closes.iloc[-1])).quantize(Decimal("0.0001"))
    sma = Decimal(str(closes.iloc[-window:].mean())).quantize(Decimal("0.0001"))
    deviation = ((last - sma) / sma * Decimal(100)).quantize(Decimal("0.01"))
    in_buy_zone = last <= sma * (Decimal(1) - deviation_threshold_pct / Decimal(100))

    reading = FxSmaReading(
        symbol=symbol,
        last_close=last,
        sma_30=sma,
        deviation_pct=deviation,
        is_dca_buy_zone=in_buy_zone,
        threshold_pct=deviation_threshold_pct,
        computed_at=now,
    )
    with _LOCK:
        _CACHE[cache_key] = (now, reading)  # type: ignore[assignment]
    return reading
