"""Equity-curve construction — real portfolio value over time only.

Returns actual data only:
- One point per row in `portfolio_snapshots` (captured daily at KST 09:00)
- Plus today's "live" point computed from the current KIS-reported total

No synthetic / proxy / scaled-from-QQQ data. Until daily snapshots accumulate
the curve will be short — that's intentional. A misleading simulated history
would change the meaning of the chart.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import PortfolioSnapshot

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class EquityPoint:
    date: str
    value: float
    source: str  # "snapshot" | "live"


def build_equity_curve(
    db: Session,
    *,
    days: int = 365,
    anchor_total_usd: Decimal | None = None,
    anchor_total_krw: Decimal | None = None,
) -> list[EquityPoint]:
    """Real portfolio history. Snapshot rows + today's live anchor."""
    use_krw = (anchor_total_usd is None or anchor_total_usd <= 0) and anchor_total_krw and anchor_total_krw > 0
    anchor: Decimal | None
    if use_krw:
        anchor = anchor_total_krw
    else:
        anchor = anchor_total_usd

    end_date = date.today()
    start_date = end_date - timedelta(days=days - 1)

    snapshot_rows = db.execute(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.snapshot_date >= start_date)
        .order_by(PortfolioSnapshot.snapshot_date.asc())
    ).scalars().all()

    points: list[EquityPoint] = []
    for snap in snapshot_rows:
        if snap.snapshot_date == end_date:
            continue  # today is overridden by live below to reflect real-time value
        value = float(snap.total_krw if use_krw else snap.total_usd)
        points.append(
            EquityPoint(date=snap.snapshot_date.isoformat(), value=value, source="snapshot")
        )

    if anchor is not None and anchor > 0:
        points.append(
            EquityPoint(date=end_date.isoformat(), value=round(float(anchor), 2), source="live")
        )

    return points
