from datetime import datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.integrations import kis
from app.services import equity_curve, portfolio

router = APIRouter()


class HoldingOut(BaseModel):
    symbol: str
    name: str
    quantity: Decimal
    avg_price: Decimal
    current_price: Decimal
    eval_usd: Decimal
    pl_usd: Decimal
    pl_pct: Decimal
    weight_pct: Decimal


class PortfolioOut(BaseModel):
    holdings: list[HoldingOut]
    total_eval_usd: Decimal
    total_pl_usd: Decimal
    fx_rate: Decimal | None
    total_eval_krw: Decimal | None
    cash_usd: Decimal | None
    cash_usd_available: Decimal | None
    cash_krw: Decimal | None
    total_assets_krw: Decimal | None
    today_change_usd: Decimal | None
    today_change_pct: Decimal | None
    fetched_at: datetime
    source: str
    configured: bool  # whether KIS credentials are set


DbDep = Annotated[Session, Depends(get_db)]


@router.get("/api/portfolio", response_model=PortfolioOut)
def get_portfolio(db: DbDep):
    if not portfolio._kis_creds_present():
        return PortfolioOut(
            holdings=[],
            total_eval_usd=Decimal(0),
            total_pl_usd=Decimal(0),
            fx_rate=None,
            total_eval_krw=None,
            cash_usd=None,
            cash_usd_available=None,
            cash_krw=None,
            total_assets_krw=None,
            today_change_usd=None,
            today_change_pct=None,
            fetched_at=datetime.now().astimezone(),
            source="kis",
            configured=False,
        )
    try:
        summary = portfolio.build_summary(db)
    except kis.KisError as e:
        raise HTTPException(status_code=502, detail=f"KIS error: {e}")

    return PortfolioOut(
        holdings=[
            HoldingOut(
                symbol=h.symbol,
                name=h.name,
                quantity=h.quantity,
                avg_price=h.avg_price,
                current_price=h.current_price,
                eval_usd=h.eval_usd,
                pl_usd=h.pl_usd,
                pl_pct=h.pl_pct,
                weight_pct=h.weight_pct,
            )
            for h in summary.holdings
        ],
        total_eval_usd=summary.total_eval_usd,
        total_pl_usd=summary.total_pl_usd,
        fx_rate=summary.fx_rate,
        total_eval_krw=summary.total_eval_krw,
        cash_usd=summary.cash_usd,
        cash_usd_available=summary.cash_usd_available,
        cash_krw=summary.cash_krw,
        total_assets_krw=summary.total_assets_krw,
        today_change_usd=summary.today_change_usd,
        today_change_pct=summary.today_change_pct,
        fetched_at=summary.fetched_at,
        source=summary.source,
        configured=True,
    )


class EquityPointOut(BaseModel):
    date: str
    value: float
    source: str


class EquityCurveOut(BaseModel):
    currency: str  # "USD" or "KRW"
    days: int
    points: list[EquityPointOut]


@router.get("/api/portfolio/equity", response_model=EquityCurveOut)
def get_equity_curve(db: DbDep, days: int = 365, currency: str = "USD"):
    if days < 1 or days > 1825:
        raise HTTPException(status_code=400, detail="days must be in [1, 1825]")
    currency = currency.upper()
    if currency not in ("USD", "KRW"):
        raise HTTPException(status_code=400, detail="currency must be USD or KRW")

    try:
        summary = portfolio.build_summary(db) if portfolio._kis_creds_present() else None
    except kis.KisError:
        summary = None

    # Anchor must equal the dashboard "Portfolio Value" so the chart's last
    # point matches the headline number. Definition:
    #   USD: holdings eval + available USD cash
    #   KRW: KIS-reported total_assets_krw (includes both currencies + holdings)
    anchor_usd: Decimal | None = None
    if summary:
        anchor_usd = summary.total_eval_usd or Decimal(0)
        if summary.cash_usd_available:
            anchor_usd = anchor_usd + summary.cash_usd_available
    anchor_krw = (
        summary.total_assets_krw if summary and summary.total_assets_krw else None
    )

    points = equity_curve.build_equity_curve(
        db,
        days=days,
        anchor_total_usd=anchor_usd if currency == "USD" else None,
        anchor_total_krw=anchor_krw if currency == "KRW" else None,
    )
    return EquityCurveOut(
        currency=currency,
        days=days,
        points=[EquityPointOut(date=p.date, value=p.value, source=p.source) for p in points],
    )


@router.post("/api/dev/portfolio-snapshot")
def dev_portfolio_snapshot():
    """Force a snapshot save (for testing)."""
    return portfolio.run_daily_snapshot_job()


@router.get("/api/dev/kis-present-balance")
def dev_kis_present_balance():
    """Debug — return raw KIS inquire-present-balance response."""
    if not portfolio._kis_creds_present():
        raise HTTPException(status_code=400, detail="KIS credentials not configured")
    try:
        return kis.fetch_present_balance_raw()
    except kis.KisError as e:
        raise HTTPException(status_code=502, detail=str(e))
