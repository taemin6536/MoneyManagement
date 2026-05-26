from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services import contributions as svc
from app.services import krw_balance as krw_svc

router = APIRouter()
DbDep = Annotated[Session, Depends(get_db)]


class ContributionIn(BaseModel):
    contribution_date: date
    amount_krw: Decimal = Field(gt=0)
    core_pct: Decimal = Field(default=svc.DEFAULT_CORE_PCT, ge=0, le=100)
    note: str | None = None


class ContributionOut(BaseModel):
    id: int
    contribution_date: date
    amount_krw: Decimal
    core_pct: Decimal
    core_krw: Decimal
    tactical_krw: Decimal
    fx_rate: Decimal | None
    note: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class TacticalBuyIn(BaseModel):
    buy_date: date
    symbol: str
    amount_krw: Decimal = Field(gt=0)
    amount_usd: Decimal | None = None
    fx_rate: Decimal | None = None
    rule_level: str | None = None
    note: str | None = None


class TacticalBuyOut(BaseModel):
    id: int
    buy_date: date
    symbol: str
    amount_krw: Decimal
    amount_usd: Decimal | None
    fx_rate: Decimal | None
    rule_level: str | None
    note: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class TacticalBalanceOut(BaseModel):
    krw: Decimal
    usd: Decimal | None
    fx_rate: Decimal | None
    deposits_krw: Decimal
    deposits_usd: Decimal
    deployed_krw: Decimal


class TacticalDepositIn(BaseModel):
    deposit_date: date
    amount_usd: Decimal = Field(gt=0)
    fx_rate: Decimal | None = None
    note: str | None = None


class TacticalDepositOut(BaseModel):
    id: int
    deposit_date: date
    amount_usd: Decimal
    amount_krw: Decimal | None
    fx_rate: Decimal | None
    note: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class DefaultsOut(BaseModel):
    amount_krw: Decimal
    core_pct: Decimal


@router.get("/api/contributions/defaults", response_model=DefaultsOut)
def get_defaults():
    return DefaultsOut(amount_krw=svc.DEFAULT_AMOUNT_KRW, core_pct=svc.DEFAULT_CORE_PCT)


@router.post("/api/contributions", response_model=ContributionOut)
def post_contribution(payload: ContributionIn, db: DbDep):
    try:
        row = svc.record_contribution(
            db,
            contribution_date=payload.contribution_date,
            amount_krw=payload.amount_krw,
            core_pct=payload.core_pct,
            note=payload.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return row


@router.get("/api/contributions", response_model=list[ContributionOut])
def get_contributions(db: DbDep, limit: int = 36):
    return svc.list_contributions(db, limit=limit)


@router.delete("/api/contributions/{contribution_id}")
def delete_contribution(contribution_id: int, db: DbDep):
    ok = svc.delete_contribution(db, contribution_id)
    if not ok:
        raise HTTPException(status_code=404, detail="not found")
    return {"deleted": True}


@router.get("/api/tactical/balance", response_model=TacticalBalanceOut)
def get_tactical_balance(db: DbDep):
    bal = svc.tactical_balance(db)
    return TacticalBalanceOut(
        krw=bal.krw,
        usd=bal.usd,
        fx_rate=bal.fx_rate,
        deposits_krw=bal.deposits_krw,
        deposits_usd=bal.deposits_usd,
        deployed_krw=bal.deployed_krw,
    )


@router.post("/api/tactical/deposits", response_model=TacticalDepositOut)
def post_tactical_deposit(payload: TacticalDepositIn, db: DbDep):
    try:
        row = svc.record_tactical_deposit(
            db,
            deposit_date=payload.deposit_date,
            amount_usd=payload.amount_usd,
            fx_rate=payload.fx_rate,
            note=payload.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return row


@router.get("/api/tactical/deposits", response_model=list[TacticalDepositOut])
def get_tactical_deposits(db: DbDep, limit: int = 50):
    return svc.list_tactical_deposits(db, limit=limit)


@router.delete("/api/tactical/deposits/{deposit_id}")
def delete_tactical_deposit(deposit_id: int, db: DbDep):
    ok = svc.delete_tactical_deposit(db, deposit_id)
    if not ok:
        raise HTTPException(status_code=404, detail="not found")
    return {"deleted": True}


# ---- KRW brokerage cash ----------------------------------------------------


class KrwCashOut(BaseModel):
    amount_krw: Decimal
    amount_usd_equiv: Decimal | None
    fx_rate: Decimal | None
    as_of_date: date | None
    last_updated: datetime | None
    note: str | None


class KrwSnapshotIn(BaseModel):
    as_of_date: date
    amount_krw: Decimal = Field(ge=0)
    note: str | None = None


class KrwSnapshotOut(BaseModel):
    id: int
    as_of_date: date
    amount_krw: Decimal
    note: str | None
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/api/krw-cash", response_model=KrwCashOut)
def get_krw_cash(db: DbDep):
    v = krw_svc.current(db)
    return KrwCashOut(
        amount_krw=v.amount_krw,
        amount_usd_equiv=v.amount_usd_equiv,
        fx_rate=v.fx_rate,
        as_of_date=v.as_of_date,
        last_updated=v.last_updated,
        note=v.note,
    )


@router.post("/api/krw-cash", response_model=KrwSnapshotOut)
def post_krw_cash(payload: KrwSnapshotIn, db: DbDep):
    try:
        row = krw_svc.set_balance(
            db,
            as_of_date=payload.as_of_date,
            amount_krw=payload.amount_krw,
            note=payload.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return row


@router.get("/api/krw-cash/history", response_model=list[KrwSnapshotOut])
def get_krw_cash_history(db: DbDep, limit: int = 50):
    return krw_svc.list_history(db, limit=limit)


@router.delete("/api/krw-cash/{snapshot_id}")
def delete_krw_cash(snapshot_id: int, db: DbDep):
    ok = krw_svc.delete_snapshot(db, snapshot_id)
    if not ok:
        raise HTTPException(status_code=404, detail="not found")
    return {"deleted": True}


@router.post("/api/tactical/buys", response_model=TacticalBuyOut)
def post_tactical_buy(payload: TacticalBuyIn, db: DbDep):
    try:
        row = svc.record_tactical_buy(
            db,
            buy_date=payload.buy_date,
            symbol=payload.symbol,
            amount_krw=payload.amount_krw,
            amount_usd=payload.amount_usd,
            fx_rate=payload.fx_rate,
            rule_level=payload.rule_level,
            note=payload.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return row


@router.get("/api/tactical/buys", response_model=list[TacticalBuyOut])
def get_tactical_buys(db: DbDep, limit: int = 50):
    return svc.list_tactical_buys(db, limit=limit)
