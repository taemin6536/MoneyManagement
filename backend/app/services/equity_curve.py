"""Equity-curve construction.

V1 strategy: take QQQ daily closes from yfinance for the requested window,
scale them so the most recent point matches today's KIS-reported total assets,
then overlay any portfolio_snapshots rows we've already captured (those are
the "real" history; everything else is a proxy).

The "FIFO push-out" semantics happen naturally: as snapshots accumulate over
time, more recent days come from snapshots and the proxy fades into the past.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
import logging

import yfinance as yf
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import PortfolioSnapshot

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class EquityPoint:
    date: str
    value: float
    source: str  # "snapshot" | "proxy"


def build_equity_curve(
    db: Session,
    *,
    days: int = 365,
    anchor_total_usd: Decimal | None = None,
    anchor_total_krw: Decimal | None = None,
) -> list[EquityPoint]:
    """Return a list of {date, value, source} points for the last `days` days.

    `anchor_total_usd` (preferred) or `anchor_total_krw` is today's known
    portfolio value; the QQQ-proxy series is scaled so its last point matches.
    Snapshots take precedence over proxy on any date they exist for.
    """
    anchor = anchor_total_usd
    use_krw = False
    if anchor is None or anchor <= 0:
        if anchor_total_krw and anchor_total_krw > 0:
            anchor = anchor_total_krw
            use_krw = True
    if anchor is None or anchor <= 0:
        # Nothing to scale against; just return snapshots if any.
        return _snapshots_only(db, days, use_krw=True)

    # Snapshot lookup
    end_date = date.today()
    start_date = end_date - timedelta(days=days - 1)
    snapshot_rows = db.execute(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.snapshot_date >= start_date)
        .order_by(PortfolioSnapshot.snapshot_date.asc())
    ).scalars().all()
    snapshot_map: dict[date, PortfolioSnapshot] = {r.snapshot_date: r for r in snapshot_rows}

    # yfinance daily QQQ closes
    try:
        df = yf.Ticker("QQQ").history(
            period=f"{max(days + 30, 90)}d", interval="1d", auto_adjust=False
        )
    except Exception as e:
        logger.warning("equity_curve: yfinance fetch failed: %s", e)
        df = None

    proxy_by_date: dict[date, float] = {}
    if df is not None and not df.empty:
        last_close = float(df["Close"].iloc[-1])
        scale = float(anchor) / last_close if last_close > 0 else 0.0
        for ts, row in df.iterrows():
            d = ts.date()
            close = float(row["Close"])
            proxy_by_date[d] = close * scale

    points: list[EquityPoint] = []
    cursor = start_date
    while cursor <= end_date:
        snap = snapshot_map.get(cursor)
        if snap is not None:
            value = float(snap.total_krw if use_krw else snap.total_usd)
            points.append(EquityPoint(date=cursor.isoformat(), value=value, source="snapshot"))
        else:
            proxy = proxy_by_date.get(cursor)
            if proxy is not None:
                points.append(EquityPoint(date=cursor.isoformat(), value=round(proxy, 2), source="proxy"))
        cursor += timedelta(days=1)
    return points


def _snapshots_only(db: Session, days: int, use_krw: bool) -> list[EquityPoint]:
    end_date = date.today()
    start_date = end_date - timedelta(days=days - 1)
    rows = db.execute(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.snapshot_date >= start_date)
        .order_by(PortfolioSnapshot.snapshot_date.asc())
    ).scalars().all()
    return [
        EquityPoint(
            date=r.snapshot_date.isoformat(),
            value=float(r.total_krw if use_krw else r.total_usd),
            source="snapshot",
        )
        for r in rows
    ]
