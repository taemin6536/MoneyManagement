"""Monthly contribution tracking + tactical-reserve accounting.

User contributes a variable monthly amount (default ₩2,000,000). It splits
into:
- core: bought into 1x ETF (QQQ/VOO) immediately every month — recorded but
  not executed by the system (user buys in brokerage).
- tactical: kept as KRW cash reserve until a drawdown rule fires.

The tactical reserve balance = sum(contributions.tactical_krw) - sum(tactical_buys.amount_krw).
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Contribution, TacticalBuy, TacticalDeposit
from app.services import fx

logger = logging.getLogger(__name__)


DEFAULT_AMOUNT_KRW = Decimal("2000000")
DEFAULT_CORE_PCT = Decimal("70")


@dataclass(slots=True)
class TacticalBalance:
    krw: Decimal
    usd: Decimal | None
    fx_rate: Decimal | None
    deposits_krw: Decimal       # sum of (contributions.tactical_krw + tactical_deposits.amount_krw_equiv)
    deposits_usd: Decimal       # sum of tactical_deposits.amount_usd (USD-native top-ups)
    deployed_krw: Decimal       # sum of tactical_buys.amount_krw


def _q_krw(value: Decimal) -> Decimal:
    return Decimal(value).quantize(Decimal("1"))


def record_contribution(
    db: Session,
    *,
    contribution_date: date,
    amount_krw: Decimal,
    core_pct: Decimal = DEFAULT_CORE_PCT,
    fx_rate: Decimal | None = None,
    note: str | None = None,
) -> Contribution:
    if amount_krw <= 0:
        raise ValueError("amount_krw must be positive")
    if not (Decimal(0) <= core_pct <= Decimal(100)):
        raise ValueError("core_pct must be in [0, 100]")

    core_krw = _q_krw(amount_krw * core_pct / Decimal(100))
    tactical_krw = _q_krw(amount_krw - core_krw)

    if fx_rate is None:
        latest = fx.get_latest_rate(db)
        fx_rate = latest.usd_krw if latest else None

    row = Contribution(
        contribution_date=contribution_date,
        amount_krw=_q_krw(amount_krw),
        core_pct=core_pct,
        core_krw=core_krw,
        tactical_krw=tactical_krw,
        fx_rate=fx_rate,
        note=note,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_contributions(db: Session, limit: int = 36) -> list[Contribution]:
    return list(
        db.execute(
            select(Contribution)
            .order_by(Contribution.contribution_date.desc(), Contribution.id.desc())
            .limit(limit)
        ).scalars()
    )


def delete_contribution(db: Session, contribution_id: int) -> bool:
    row = db.get(Contribution, contribution_id)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


def record_tactical_buy(
    db: Session,
    *,
    buy_date: date,
    symbol: str,
    amount_krw: Decimal,
    amount_usd: Decimal | None = None,
    fx_rate: Decimal | None = None,
    rule_level: str | None = None,
    note: str | None = None,
) -> TacticalBuy:
    if amount_krw <= 0:
        raise ValueError("amount_krw must be positive")
    if fx_rate is None and amount_usd is None:
        latest = fx.get_latest_rate(db)
        fx_rate = latest.usd_krw if latest else None
    if fx_rate is not None and amount_usd is None and fx_rate > 0:
        amount_usd = (amount_krw / fx_rate).quantize(Decimal("0.01"))

    row = TacticalBuy(
        buy_date=buy_date,
        symbol=symbol.upper(),
        amount_krw=_q_krw(amount_krw),
        amount_usd=amount_usd,
        fx_rate=fx_rate,
        rule_level=rule_level,
        note=note,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_tactical_buys(db: Session, limit: int = 50) -> list[TacticalBuy]:
    return list(
        db.execute(
            select(TacticalBuy)
            .order_by(TacticalBuy.buy_date.desc(), TacticalBuy.id.desc())
            .limit(limit)
        ).scalars()
    )


def record_tactical_deposit(
    db: Session,
    *,
    deposit_date: date,
    amount_usd: Decimal,
    fx_rate: Decimal | None = None,
    note: str | None = None,
) -> TacticalDeposit:
    if amount_usd <= 0:
        raise ValueError("amount_usd must be positive")
    if fx_rate is None:
        latest = fx.get_latest_rate(db)
        fx_rate = latest.usd_krw if latest else None
    amount_krw = (amount_usd * fx_rate).quantize(Decimal("1")) if fx_rate else None

    row = TacticalDeposit(
        deposit_date=deposit_date,
        amount_usd=amount_usd.quantize(Decimal("0.01")),
        amount_krw=amount_krw,
        fx_rate=fx_rate,
        note=note,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_tactical_deposits(db: Session, limit: int = 50) -> list[TacticalDeposit]:
    return list(
        db.execute(
            select(TacticalDeposit)
            .order_by(TacticalDeposit.deposit_date.desc(), TacticalDeposit.id.desc())
            .limit(limit)
        ).scalars()
    )


def delete_tactical_deposit(db: Session, deposit_id: int) -> bool:
    row = db.get(TacticalDeposit, deposit_id)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


def tactical_balance(db: Session) -> TacticalBalance:
    # KRW-native side (legacy contributions split)
    contrib_krw = Decimal(
        db.execute(select(func.coalesce(func.sum(Contribution.tactical_krw), 0))).scalar_one()
    )
    # USD-native top-ups; convert each row at its own historical FX into KRW
    # so book-keeping stays consistent if rates change between deposit and now.
    deposit_rows = db.execute(
        select(TacticalDeposit.amount_usd, TacticalDeposit.amount_krw)
    ).all()
    deposits_usd_total = Decimal(0)
    deposits_krw_from_usd = Decimal(0)
    for row_usd, row_krw in deposit_rows:
        deposits_usd_total += Decimal(row_usd)
        if row_krw is not None:
            deposits_krw_from_usd += Decimal(row_krw)

    deployed_krw = Decimal(
        db.execute(select(func.coalesce(func.sum(TacticalBuy.amount_krw), 0))).scalar_one()
    )

    total_krw = contrib_krw + deposits_krw_from_usd - deployed_krw
    if total_krw < 0:
        total_krw = Decimal(0)

    latest_fx = fx.get_latest_rate(db)
    fx_rate = latest_fx.usd_krw if latest_fx else None
    # USD balance: prefer summing the USD-native side at its own rates +
    # convert KRW-side at current rate. Approximates "what's in cash today".
    if fx_rate and fx_rate > 0:
        # Deployed buys count against the USD side first if possible;
        # we keep it simple: total_usd = total_krw / current_fx.
        usd = (total_krw / fx_rate).quantize(Decimal("0.01"))
    else:
        usd = None

    return TacticalBalance(
        krw=_q_krw(total_krw),
        usd=usd,
        fx_rate=fx_rate,
        deposits_krw=_q_krw(contrib_krw + deposits_krw_from_usd),
        deposits_usd=deposits_usd_total.quantize(Decimal("0.01")),
        deployed_krw=_q_krw(deployed_krw),
    )
