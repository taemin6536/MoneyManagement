"""Trade journal — KIS sync + market-snapshot capture.

Pulls executed trades from KIS, dedups on `kis_order_id`, and stamps each
with a best-effort market snapshot (QQQ price/ATH/drawdown, TQQQ/QLD, VIX,
USD/KRW) drawn from our historical price/FX tables at the trade's `executed_at`.
RSI/FGI/channel-breakout aren't stored historically, so they sit null in the
snapshot — the user's own note + rule_level fills the rest.
"""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import logging

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.db.models import FxHistory, PriceHistory, Trade
from app.db.session import SessionLocal
from app.integrations import kis

logger = logging.getLogger(__name__)


def _build_snapshot(db: Session, executed_at: datetime) -> dict:
    """Best-effort market state at `executed_at` from DB-backed history.

    For each tracked symbol: most recent PriceHistory row at-or-before
    executed_at. ATH = max QQQ close at-or-before. FX = latest fx_history.
    Anything not in history (RSI/FGI/channel) stays absent.
    """
    snap: dict = {}

    for symbol, key in (("QQQ", "qqq_price"), ("TQQQ", "tqqq_price"),
                        ("QLD", "qld_price"), ("^VIX", "vix")):
        row = db.execute(
            select(PriceHistory)
            .where(PriceHistory.symbol == symbol)
            .where(PriceHistory.ts <= executed_at)
            .order_by(PriceHistory.ts.desc())
            .limit(1)
        ).scalar_one_or_none()
        if row is not None:
            snap[key] = float(row.close)

    # QQQ ATH as-of the trade and drawdown derived from it.
    qqq_price = snap.get("qqq_price")
    if qqq_price is not None:
        max_close = db.execute(
            select(func.max(PriceHistory.close))
            .where(PriceHistory.symbol == "QQQ")
            .where(PriceHistory.ts <= executed_at)
        ).scalar_one_or_none()
        if max_close:
            snap["qqq_ath"] = float(max_close)
            if snap["qqq_ath"] > 0:
                snap["drawdown_pct"] = round(
                    (qqq_price - snap["qqq_ath"]) / snap["qqq_ath"] * 100, 2
                )

    fx_row = db.execute(
        select(FxHistory)
        .where(FxHistory.ts <= executed_at)
        .order_by(FxHistory.ts.desc())
        .limit(1)
    ).scalar_one_or_none()
    if fx_row is not None:
        snap["usd_krw"] = float(fx_row.usd_krw)

    return snap


def sync_from_kis(days_back: int = 365) -> dict:
    """Pull trades from KIS over the last `days_back` days and upsert.

    KIS unique key is `kis_order_id` — ON CONFLICT DO NOTHING preserves
    existing rows (including any note/rule_level the user added).

    Returns {fetched, inserted, days_back, start, end}.
    """
    end = date.today()
    start = end - timedelta(days=days_back)
    logger.info("trades.sync_from_kis: start=%s end=%s", start, end)

    trades = kis.fetch_trade_history(start_date=start, end_date=end)

    inserted = 0
    db: Session = SessionLocal()
    try:
        for t in trades:
            snapshot = _build_snapshot(db, t.executed_at)
            row = {
                "executed_at": t.executed_at,
                "symbol": t.symbol,
                "side": t.side,
                "quantity": t.quantity,
                "price_usd": t.price_usd,
                "total_usd": t.total_usd,
                "snapshot": snapshot,
                "rule_level": None,
                "note": None,
                "source": "kis_sync",
                "kis_order_id": t.order_id,
            }
            stmt = (
                pg_insert(Trade)
                .values(**row)
                .on_conflict_do_nothing(index_elements=["kis_order_id"])
            )
            result = db.execute(stmt)
            inserted += result.rowcount or 0
        db.commit()
    finally:
        db.close()

    logger.info("trades.sync_from_kis: fetched=%d inserted=%d", len(trades), inserted)
    return {
        "fetched": len(trades),
        "inserted": inserted,
        "days_back": days_back,
        "start": start.isoformat(),
        "end": end.isoformat(),
    }


def list_recent(
    db: Session,
    limit: int = 100,
    symbol: str | None = None,
    side: str | None = None,
    days: int = 365,
) -> list[Trade]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    q = select(Trade).where(Trade.executed_at >= cutoff)
    if symbol:
        q = q.where(Trade.symbol == symbol.upper())
    if side:
        q = q.where(Trade.side == side.lower())
    q = q.order_by(Trade.executed_at.desc()).limit(limit)
    return list(db.execute(q).scalars())


def get_one(db: Session, trade_id: int) -> Trade | None:
    return db.get(Trade, trade_id)


def create_manual(
    db: Session,
    executed_at: datetime,
    symbol: str,
    side: str,
    quantity: Decimal,
    price_usd: Decimal,
    rule_level: str | None = None,
    note: str | None = None,
) -> Trade:
    total = (quantity * price_usd).quantize(Decimal("0.01"))
    snap = _build_snapshot(db, executed_at)
    trade = Trade(
        executed_at=executed_at,
        symbol=symbol.upper(),
        side=side.lower(),
        quantity=quantity,
        price_usd=price_usd,
        total_usd=total,
        snapshot=snap,
        rule_level=rule_level,
        note=note,
        source="manual",
        kis_order_id=None,
    )
    db.add(trade)
    db.commit()
    db.refresh(trade)
    return trade


def update_note(
    db: Session, trade_id: int, note: str | None, rule_level: str | None
) -> Trade | None:
    trade = db.get(Trade, trade_id)
    if trade is None:
        return None
    trade.note = note
    trade.rule_level = rule_level
    db.commit()
    db.refresh(trade)
    return trade


def available_symbols(db: Session) -> list[str]:
    rows = db.execute(
        select(func.distinct(Trade.symbol)).order_by(Trade.symbol)
    ).scalars()
    return [r for r in rows if r]
