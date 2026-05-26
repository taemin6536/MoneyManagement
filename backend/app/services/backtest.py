"""Backtest: monthly DCA vs the manual TQQQ/QLD strategy.

Two head-to-head scenarios over the same period:

A. **Pure DCA (control):** every month's full KRW contribution is converted to
   USD at that day's KRW=X close and used to buy QQQ.

B. **Manual strategy:** each month splits `core_pct` into QQQ (immediate) and
   `(100 - core_pct)` into tactical USD cash. Whenever QQQ closes more than
   the configured drawdown thresholds below its running ATH (-15 / -20 / -25%),
   the corresponding fraction of remaining tactical cash buys TQQQ at that
   day's close. (Rule ② / ③ deliberately out of scope for v1 backtest.)

Result includes equity curves and summary stats (CAGR, MDD).
"""

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Literal
import logging
import math

import pandas as pd
import yfinance as yf

from app.rules.rule_buy_drawdown import DEFAULT_STEPS, DrawdownStep

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class EquityPoint:
    date: str  # ISO date
    pure_dca_usd: float
    manual_usd: float
    pure_dca_qqq_shares: float
    manual_qqq_shares: float
    manual_tqqq_shares: float
    manual_cash_usd: float


@dataclass(slots=True)
class StrategyStats:
    final_value_usd: float
    total_contributed_usd: float
    cagr_pct: float
    max_drawdown_pct: float


@dataclass(slots=True)
class BacktestResult:
    start: str
    end: str
    months: int
    monthly_krw: float
    core_pct: float
    pure_dca: StrategyStats
    manual: StrategyStats
    curve: list[EquityPoint] = field(default_factory=list)


# -- helpers ---------------------------------------------------------------


def _fetch_close_series(symbol: str, start: date, end: date) -> pd.Series:
    df = yf.Ticker(symbol).history(start=start.isoformat(), end=end.isoformat(), interval="1d", auto_adjust=False)
    if df.empty:
        raise ValueError(f"no data for {symbol} from {start} to {end}")
    s = df["Close"].dropna()
    # Normalize index to plain date timestamps so QQQ (US session) and KRW=X
    # (FX continuous) can be joined on the same trading day key.
    s.index = pd.to_datetime(s.index.tz_localize(None).normalize() if s.index.tz is not None else s.index.normalize())
    s = s[~s.index.duplicated(keep="last")]
    return s


def _max_drawdown(equity: list[float]) -> float:
    peak = equity[0] if equity else 0.0
    mdd = 0.0
    for v in equity:
        if v > peak:
            peak = v
        if peak > 0:
            dd = (v - peak) / peak
            if dd < mdd:
                mdd = dd
    return mdd * 100  # negative


def _cagr(start_value: float, end_value: float, years: float) -> float:
    if start_value <= 0 or years <= 0 or end_value <= 0:
        return 0.0
    return (math.pow(end_value / start_value, 1 / years) - 1) * 100


# -- simulator -------------------------------------------------------------


def run_backtest(
    start: date,
    end: date,
    monthly_krw: float = 2_000_000.0,
    core_pct: float = 70.0,
    steps: tuple[DrawdownStep, ...] = DEFAULT_STEPS,
) -> BacktestResult:
    if not (0 <= core_pct <= 100):
        raise ValueError("core_pct must be in [0, 100]")
    if monthly_krw <= 0:
        raise ValueError("monthly_krw must be positive")
    if start >= end:
        raise ValueError("start must be before end")

    qqq = _fetch_close_series("QQQ", start, end)
    tqqq = _fetch_close_series("TQQQ", start, end)
    fx = _fetch_close_series("KRW=X", start, end)

    # Align all three on common trading dates
    df = pd.concat({"QQQ": qqq, "TQQQ": tqqq, "FX": fx}, axis=1).dropna()
    if df.empty:
        raise ValueError("no overlapping trading days for QQQ / TQQQ / KRW=X")
    dates = list(df.index)

    # Track first trading day of each calendar month → monthly contribution day
    monthly_indices: list[int] = []
    last_ym: tuple[int, int] | None = None
    for i, d in enumerate(dates):
        ym = (d.year, d.month)
        if ym != last_ym:
            monthly_indices.append(i)
            last_ym = ym
    monthly_set = set(monthly_indices)

    # State for Pure DCA
    pdca_shares = 0.0
    pdca_contrib_usd = 0.0

    # State for Manual strategy
    m_qqq_shares = 0.0
    m_tqqq_shares = 0.0
    m_tactical_usd = 0.0
    m_contrib_usd = 0.0
    qqq_ath = 0.0
    fired_levels: set[str] = set()

    curve: list[EquityPoint] = []
    pdca_equity_track: list[float] = []
    manual_equity_track: list[float] = []

    core_fraction = core_pct / 100.0
    tactical_fraction = 1.0 - core_fraction
    step_levels = [(float(s.threshold_pct), float(s.cash_pct), f"drawdown_{int(s.threshold_pct)}") for s in steps]

    for i, d in enumerate(dates):
        qqq_close = float(df["QQQ"].iloc[i])
        tqqq_close = float(df["TQQQ"].iloc[i])
        fx_close = float(df["FX"].iloc[i])

        # ATH update on close (used for both strategies' drawdown reference)
        if qqq_close > qqq_ath:
            qqq_ath = qqq_close

        # Monthly contribution day
        if i in monthly_set:
            usd_in = monthly_krw / fx_close if fx_close > 0 else 0.0

            # Pure DCA: all → QQQ
            if qqq_close > 0:
                pdca_shares += usd_in / qqq_close
            pdca_contrib_usd += usd_in

            # Manual: core_fraction → QQQ, rest → tactical cash
            core_usd = usd_in * core_fraction
            tactical_in = usd_in * tactical_fraction
            if qqq_close > 0:
                m_qqq_shares += core_usd / qqq_close
            m_tactical_usd += tactical_in
            m_contrib_usd += usd_in

        # Manual strategy: check drawdown trigger every day
        if qqq_ath > 0:
            drawdown_pct = ((qqq_close - qqq_ath) / qqq_ath) * 100
            for threshold_pct, cash_pct, level_key in step_levels:
                if drawdown_pct <= threshold_pct and level_key not in fired_levels and m_tactical_usd > 0:
                    buy_usd = m_tactical_usd * (cash_pct / 100.0)
                    if tqqq_close > 0:
                        m_tqqq_shares += buy_usd / tqqq_close
                    m_tactical_usd -= buy_usd
                    fired_levels.add(level_key)
            # If price recovers > -10% from ATH, reset fired levels so next downturn rearms
            if drawdown_pct > -10:
                fired_levels.clear()

        # Equity snapshots
        pdca_equity = pdca_shares * qqq_close
        manual_equity = m_qqq_shares * qqq_close + m_tqqq_shares * tqqq_close + m_tactical_usd

        pdca_equity_track.append(pdca_equity)
        manual_equity_track.append(manual_equity)

        # Sample curve monthly to keep payload small
        if i in monthly_set or i == len(dates) - 1:
            curve.append(
                EquityPoint(
                    date=d.date().isoformat(),
                    pure_dca_usd=round(pdca_equity, 2),
                    manual_usd=round(manual_equity, 2),
                    pure_dca_qqq_shares=round(pdca_shares, 4),
                    manual_qqq_shares=round(m_qqq_shares, 4),
                    manual_tqqq_shares=round(m_tqqq_shares, 4),
                    manual_cash_usd=round(m_tactical_usd, 2),
                )
            )

    days = (dates[-1] - dates[0]).days
    years = days / 365.25

    def _stats(equity_track: list[float], contributed: float) -> StrategyStats:
        if not equity_track:
            return StrategyStats(0.0, contributed, 0.0, 0.0)
        final = equity_track[-1]
        cagr = _cagr(contributed, final, years) if contributed > 0 else 0.0
        return StrategyStats(
            final_value_usd=round(final, 2),
            total_contributed_usd=round(contributed, 2),
            cagr_pct=round(cagr, 2),
            max_drawdown_pct=round(_max_drawdown(equity_track), 2),
        )

    return BacktestResult(
        start=dates[0].date().isoformat(),
        end=dates[-1].date().isoformat(),
        months=len(monthly_indices),
        monthly_krw=monthly_krw,
        core_pct=core_pct,
        pure_dca=_stats(pdca_equity_track, pdca_contrib_usd),
        manual=_stats(manual_equity_track, m_contrib_usd),
        curve=curve,
    )
