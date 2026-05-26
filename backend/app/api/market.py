from datetime import datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AlertLog, AthState, FxHistory, PriceHistory
from app.db.session import get_db
from app.integrations import fgi
from app.rules.rule_fx import FxThresholds
from app.services import fx as fx_service
from app.rules.rule_buy_drawdown import DEFAULT_STEPS, deepest_step
from app.rules.rule_sell_recovery import DEFAULT_RECOVERY_GAP_PCT
from app.services import history as history_service
from app.services import signals as signals_service
from app.services.market_data import drawdown_pct
from app.services.daily_report import send_daily_report
from app.services.orchestrator import (
    FGI_EXTREME_GREED_THRESHOLD,
    RSI_OVERBOUGHT_THRESHOLD,
    poll_and_evaluate,
)

router = APIRouter()


class PriceOut(BaseModel):
    symbol: str
    ts: datetime
    close: Decimal
    source: str

    class Config:
        from_attributes = True


class SymbolSummary(BaseModel):
    symbol: str
    last_price: Decimal | None
    last_ts: datetime | None
    ath_price: Decimal | None
    ath_date: datetime | None
    drawdown_pct: Decimal | None
    current_step_threshold: Decimal | None
    current_step_cash_pct: Decimal | None


class AlertOut(BaseModel):
    id: int
    rule_id: str
    level: str
    fired_at: datetime
    payload: dict
    status: str

    class Config:
        from_attributes = True


DbDep = Annotated[Session, Depends(get_db)]


@router.get("/api/prices/{symbol}", response_model=list[PriceOut])
def get_prices(
    symbol: str,
    db: DbDep,
    limit: int = Query(default=200, le=2000),
):
    rows = db.execute(
        select(PriceHistory)
        .where(PriceHistory.symbol == symbol)
        .order_by(PriceHistory.ts.desc())
        .limit(limit)
    ).scalars().all()
    return rows


@router.get("/api/symbols/{symbol}/summary", response_model=SymbolSummary)
def symbol_summary(symbol: str, db: DbDep):
    last = db.execute(
        select(PriceHistory)
        .where(PriceHistory.symbol == symbol)
        .order_by(PriceHistory.ts.desc())
        .limit(1)
    ).scalar_one_or_none()
    ath = db.execute(select(AthState).where(AthState.symbol == symbol)).scalar_one_or_none()

    last_price = last.close if last else None
    drawdown = None
    step_threshold = None
    step_cash_pct = None
    if last_price is not None and ath is not None:
        drawdown = drawdown_pct(last_price, ath.ath_price).quantize(Decimal("0.01"))
        step = deepest_step(drawdown, DEFAULT_STEPS)
        if step is not None:
            step_threshold = step.threshold_pct
            step_cash_pct = step.cash_pct

    return SymbolSummary(
        symbol=symbol,
        last_price=last_price,
        last_ts=last.ts if last else None,
        ath_price=ath.ath_price if ath else None,
        ath_date=datetime.combine(ath.ath_date, datetime.min.time()) if ath else None,
        drawdown_pct=drawdown,
        current_step_threshold=step_threshold,
        current_step_cash_pct=step_cash_pct,
    )


@router.get("/api/alerts", response_model=list[AlertOut])
def get_alerts(db: DbDep, limit: int = Query(default=50, le=500)):
    rows = db.execute(
        select(AlertLog).order_by(AlertLog.fired_at.desc()).limit(limit)
    ).scalars().all()
    return rows


class SignalsOut(BaseModel):
    rsi_14: Decimal | None
    rsi_threshold: Decimal
    rsi_overbought: bool
    channel_high_20: Decimal | None
    last_high: Decimal | None
    channel_breakout: bool
    fgi_score: float | None
    fgi_rating: str | None
    fgi_threshold: float
    fgi_extreme_greed: bool
    hits: int  # how many of the 3 signals are active


class BuyStepOut(BaseModel):
    threshold_pct: Decimal
    cash_pct: Decimal


class RulesConfigOut(BaseModel):
    buy_drawdown_steps: list[BuyStepOut]
    sell_recovery_gap_pct: Decimal
    overheated_rsi_threshold: Decimal
    overheated_fgi_threshold: float
    overheated_channel_window: int


@router.get("/api/rules", response_model=RulesConfigOut)
def get_rules():
    return RulesConfigOut(
        buy_drawdown_steps=[
            BuyStepOut(threshold_pct=s.threshold_pct, cash_pct=s.cash_pct) for s in DEFAULT_STEPS
        ],
        sell_recovery_gap_pct=DEFAULT_RECOVERY_GAP_PCT,
        overheated_rsi_threshold=RSI_OVERBOUGHT_THRESHOLD,
        overheated_fgi_threshold=FGI_EXTREME_GREED_THRESHOLD,
        overheated_channel_window=20,
    )


@router.get("/api/signals/overheated", response_model=SignalsOut)
def get_overheated_signals():
    tech = signals_service.compute_for("QQQ")
    f = fgi.fetch_current()

    rsi = tech.rsi_14 if tech else None
    rsi_ob = bool(rsi is not None and rsi >= RSI_OVERBOUGHT_THRESHOLD)
    ch_break = bool(tech and tech.channel_breakout)
    fgi_extreme = bool(f and f.score >= FGI_EXTREME_GREED_THRESHOLD)

    return SignalsOut(
        rsi_14=rsi,
        rsi_threshold=RSI_OVERBOUGHT_THRESHOLD,
        rsi_overbought=rsi_ob,
        channel_high_20=tech.channel_high_20 if tech else None,
        last_high=tech.last_high if tech else None,
        channel_breakout=ch_break,
        fgi_score=f.score if f else None,
        fgi_rating=f.rating if f else None,
        fgi_threshold=FGI_EXTREME_GREED_THRESHOLD,
        fgi_extreme_greed=fgi_extreme,
        hits=int(rsi_ob) + int(ch_break) + int(fgi_extreme),
    )


class FxOut(BaseModel):
    rate: Decimal | None
    ts: datetime | None
    threshold_low: Decimal
    threshold_high: Decimal
    band: str  # "below_low" | "neutral" | "above_high" | "unknown"
    sma_30: Decimal | None = None
    deviation_pct: Decimal | None = None
    sma_threshold_pct: Decimal | None = None
    in_dca_buy_zone: bool = False


@router.get("/api/fx", response_model=FxOut)
def get_fx(db: DbDep):
    latest = fx_service.get_latest_rate(db)
    th = FxThresholds()
    sma = signals_service.compute_fx_sma()
    if latest is None:
        return FxOut(
            rate=None,
            ts=None,
            threshold_low=th.low,
            threshold_high=th.high,
            band="unknown",
            sma_30=sma.sma_30 if sma else None,
        )
    band = "neutral"
    if latest.usd_krw <= th.low:
        band = "below_low"
    elif latest.usd_krw >= th.high:
        band = "above_high"
    return FxOut(
        rate=latest.usd_krw,
        ts=latest.ts,
        threshold_low=th.low,
        threshold_high=th.high,
        band=band,
        sma_30=sma.sma_30 if sma else None,
        deviation_pct=sma.deviation_pct if sma else None,
        sma_threshold_pct=sma.threshold_pct if sma else None,
        in_dca_buy_zone=sma.is_dca_buy_zone if sma else False,
    )


class SparklineOut(BaseModel):
    symbol: str
    days: int
    closes: list[float]


@router.get("/api/symbols/{symbol}/sparkline", response_model=SparklineOut)
def get_sparkline(symbol: str, days: int = Query(default=30, ge=2, le=365)):
    series = history_service.fetch_closes(symbol, days=days)
    return SparklineOut(symbol=series.symbol, days=series.days, closes=series.closes)


class RsiHistoryOut(BaseModel):
    symbol: str
    days: int
    values: list[float]


@router.get("/api/signals/rsi-history", response_model=RsiHistoryOut)
def get_rsi_history(symbol: str = "QQQ", days: int = Query(default=30, ge=2, le=365)):
    h = history_service.fetch_rsi_history(symbol, days=days)
    return RsiHistoryOut(symbol=h.symbol, days=h.days, values=h.values)


@router.post("/api/dev/poll-now")
def dev_poll_now():
    """Force a single poll+evaluate tick (for E2E testing)."""
    try:
        return poll_and_evaluate()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/dev/daily-report")
def dev_daily_report():
    """Force the daily report Slack send right now (for testing)."""
    try:
        return send_daily_report()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
