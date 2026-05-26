"""KRW cash balance — declared brokerage 예수금 (not yet converted to USD).

Snapshot model: latest row = current balance. Older rows are history.
"""

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import KrwBalanceSnapshot
from app.services import fx


@dataclass(slots=True)
class KrwCashView:
    amount_krw: Decimal
    amount_usd_equiv: Decimal | None
    fx_rate: Decimal | None
    as_of_date: date | None
    last_updated: datetime | None
    note: str | None


def set_balance(
    db: Session,
    *,
    as_of_date: date,
    amount_krw: Decimal,
    note: str | None = None,
) -> KrwBalanceSnapshot:
    if amount_krw < 0:
        raise ValueError("amount_krw must be ≥ 0")
    row = KrwBalanceSnapshot(
        as_of_date=as_of_date,
        amount_krw=Decimal(amount_krw).quantize(Decimal("1")),
        note=note,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_history(db: Session, limit: int = 50) -> list[KrwBalanceSnapshot]:
    return list(
        db.execute(
            select(KrwBalanceSnapshot)
            .order_by(KrwBalanceSnapshot.as_of_date.desc(), KrwBalanceSnapshot.id.desc())
            .limit(limit)
        ).scalars()
    )


def delete_snapshot(db: Session, snapshot_id: int) -> bool:
    row = db.get(KrwBalanceSnapshot, snapshot_id)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


def current(db: Session) -> KrwCashView:
    latest = db.execute(
        select(KrwBalanceSnapshot)
        .order_by(KrwBalanceSnapshot.as_of_date.desc(), KrwBalanceSnapshot.id.desc())
        .limit(1)
    ).scalar_one_or_none()

    fx_row = fx.get_latest_rate(db)
    fx_rate = fx_row.usd_krw if fx_row else None

    if latest is None:
        return KrwCashView(
            amount_krw=Decimal(0),
            amount_usd_equiv=Decimal(0) if fx_rate else None,
            fx_rate=fx_rate,
            as_of_date=None,
            last_updated=None,
            note=None,
        )

    usd_equiv = (
        (Decimal(latest.amount_krw) / fx_rate).quantize(Decimal("0.01"))
        if fx_rate and fx_rate > 0
        else None
    )
    return KrwCashView(
        amount_krw=Decimal(latest.amount_krw),
        amount_usd_equiv=usd_equiv,
        fx_rate=fx_rate,
        as_of_date=latest.as_of_date,
        last_updated=latest.created_at,
        note=latest.note,
    )
