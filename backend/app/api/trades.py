"""Trade journal API.

- GET    /api/trades           list (filters: limit, symbol, side, days)
- POST   /api/trades           manual entry
- PATCH  /api/trades/{id}      update note / rule_level
- POST   /api/dev/trades-sync  on-demand KIS pull (1-year backfill on first run)
"""

from datetime import datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.integrations import kis
from app.services import trades as trades_service

router = APIRouter()

DbDep = Annotated[Session, Depends(get_db)]


class TradeOut(BaseModel):
    id: int
    executed_at: datetime
    symbol: str
    side: str
    quantity: Decimal
    price_usd: Decimal
    total_usd: Decimal
    snapshot: dict | None
    rule_level: str | None
    note: str | None
    source: str
    kis_order_id: str | None
    created_at: datetime


class TradeListOut(BaseModel):
    items: list[TradeOut]
    symbols: list[str]


def _to_out(t) -> TradeOut:
    return TradeOut(
        id=t.id,
        executed_at=t.executed_at,
        symbol=t.symbol,
        side=t.side,
        quantity=t.quantity,
        price_usd=t.price_usd,
        total_usd=t.total_usd,
        snapshot=t.snapshot,
        rule_level=t.rule_level,
        note=t.note,
        source=t.source,
        kis_order_id=t.kis_order_id,
        created_at=t.created_at,
    )


@router.get("/api/trades", response_model=TradeListOut)
def list_trades(
    db: DbDep,
    limit: int = Query(100, ge=1, le=500),
    symbol: str | None = None,
    side: str | None = None,
    days: int = Query(365, ge=1, le=3650),
):
    if side and side.lower() not in ("buy", "sell"):
        raise HTTPException(status_code=400, detail="side must be 'buy' or 'sell'")
    rows = trades_service.list_recent(
        db, limit=limit, symbol=symbol, side=side, days=days
    )
    return TradeListOut(
        items=[_to_out(t) for t in rows],
        symbols=trades_service.available_symbols(db),
    )


class ManualTradeIn(BaseModel):
    executed_at: datetime
    symbol: str = Field(min_length=1, max_length=16)
    side: str
    quantity: Decimal = Field(gt=0)
    price_usd: Decimal = Field(gt=0)
    rule_level: str | None = None
    note: str | None = None


@router.post("/api/trades", response_model=TradeOut)
def create_manual_trade(db: DbDep, payload: ManualTradeIn):
    if payload.side.lower() not in ("buy", "sell"):
        raise HTTPException(status_code=400, detail="side must be 'buy' or 'sell'")
    trade = trades_service.create_manual(
        db,
        executed_at=payload.executed_at,
        symbol=payload.symbol,
        side=payload.side,
        quantity=payload.quantity,
        price_usd=payload.price_usd,
        rule_level=payload.rule_level,
        note=payload.note,
    )
    return _to_out(trade)


class PatchTradeIn(BaseModel):
    note: str | None = None
    rule_level: str | None = None


@router.patch("/api/trades/{trade_id}", response_model=TradeOut)
def patch_trade(db: DbDep, trade_id: int, payload: PatchTradeIn):
    trade = trades_service.update_note(
        db, trade_id, note=payload.note, rule_level=payload.rule_level
    )
    if trade is None:
        raise HTTPException(status_code=404, detail="trade not found")
    return _to_out(trade)


@router.post("/api/dev/trades-sync")
def dev_trades_sync(days_back: int = Query(365, ge=1, le=3650)):
    """Force-trigger a KIS trade history pull (default = 1 year backfill)."""
    try:
        return trades_service.sync_from_kis(days_back=days_back)
    except kis.KisError as e:
        raise HTTPException(status_code=502, detail=f"KIS error: {e}")
