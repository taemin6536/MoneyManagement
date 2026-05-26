from datetime import date

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services import backtest as svc

router = APIRouter()


class EquityPointOut(BaseModel):
    date: str
    pure_dca_usd: float
    manual_usd: float
    pure_dca_qqq_shares: float
    manual_qqq_shares: float
    manual_tqqq_shares: float
    manual_cash_usd: float


class StatsOut(BaseModel):
    final_value_usd: float
    total_contributed_usd: float
    cagr_pct: float
    max_drawdown_pct: float


class BacktestOut(BaseModel):
    start: str
    end: str
    months: int
    monthly_krw: float
    core_pct: float
    pure_dca: StatsOut
    manual: StatsOut
    curve: list[EquityPointOut]


@router.get("/api/backtest", response_model=BacktestOut)
def run_backtest(
    start: date = Query(..., description="ISO date, e.g. 2015-01-01"),
    end: date = Query(..., description="ISO date, exclusive"),
    monthly_krw: float = Query(2_000_000.0, gt=0),
    core_pct: float = Query(70.0, ge=0, le=100),
):
    try:
        result = svc.run_backtest(start=start, end=end, monthly_krw=monthly_krw, core_pct=core_pct)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result
