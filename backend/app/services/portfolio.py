"""Portfolio orchestration on top of KIS balance API + cached FX rate.

Daily snapshot: caches the holdings + USD/KRW totals into portfolio_snapshots
so we can chart equity over time without rehitting KIS for history.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import PortfolioSnapshot
from app.db.session import SessionLocal
from app.integrations import kis, yfinance_client
from app.services import fx

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class HoldingView:
    symbol: str
    name: str
    quantity: Decimal
    avg_price: Decimal
    current_price: Decimal
    eval_usd: Decimal
    pl_usd: Decimal
    pl_pct: Decimal
    weight_pct: Decimal


@dataclass(slots=True)
class PortfolioSummary:
    holdings: list[HoldingView] = field(default_factory=list)
    total_eval_usd: Decimal = Decimal(0)
    total_pl_usd: Decimal = Decimal(0)
    fx_rate: Decimal | None = None
    total_eval_krw: Decimal | None = None
    cash_usd: Decimal | None = None
    cash_usd_available: Decimal | None = None  # frcr_drwg_psbl_amt_1 — net of unsettled buys
    cash_krw: Decimal | None = None
    total_assets_krw: Decimal | None = None
    today_change_usd: Decimal | None = None
    today_change_pct: Decimal | None = None
    fetched_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    source: str = "kis"


def build_summary(db: Session) -> PortfolioSummary:
    """Pull live balance + cash from KIS + latest FX rate; compute weights."""
    balance = kis.fetch_overseas_balance()
    try:
        cash = kis.fetch_cash_balances()
    except kis.KisError as e:
        logger.warning("present-balance call failed: %s", e)
        cash = None

    latest_fx = fx.get_latest_rate(db)
    fx_rate = latest_fx.usd_krw if latest_fx else None

    total = sum((h.eval_amount_usd for h in balance.holdings), Decimal(0))
    holdings: list[HoldingView] = []
    for h in balance.holdings:
        weight = (
            (h.eval_amount_usd / total * Decimal(100)).quantize(Decimal("0.01"))
            if total > 0 else Decimal(0)
        )
        holdings.append(
            HoldingView(
                symbol=h.symbol,
                name=h.name,
                quantity=h.quantity,
                avg_price=h.avg_price,
                current_price=h.current_price,
                eval_usd=h.eval_amount_usd,
                pl_usd=h.profit_loss_usd,
                pl_pct=h.profit_rate_pct,
                weight_pct=weight,
            )
        )

    total_krw = (total * fx_rate).quantize(Decimal("1")) if fx_rate else None

    # Today's P/L splits each position into:
    #   - overnight qty: marked vs yesterday's close (yfinance previous_close)
    #   - today-bought qty: marked vs the actual buy avg price (today's fills)
    # This makes Today match Unrealized for positions opened today, which is
    # the user's intuition for "what I actually made today on this position".
    today_activity: dict[str, kis.TodayActivity] = {}
    try:
        today_activity = kis.fetch_today_activity()
    except kis.KisError as e:
        logger.info("today activity unavailable: %s", e)

    today_change_usd: Decimal | None = None
    today_components: list[Decimal] = []
    basis_components: list[Decimal] = []
    for h in balance.holdings:
        if h.current_price is None or h.quantity is None or h.quantity <= 0:
            continue
        prev = yfinance_client.fetch_previous_close(h.symbol)
        activity = today_activity.get(h.symbol.upper())

        today_qty = activity.today_buy_qty if activity else Decimal(0)
        today_amount = activity.today_buy_amount_usd if activity else Decimal(0)
        overnight_qty = h.quantity - today_qty
        if overnight_qty < 0:
            overnight_qty = Decimal(0)
        today_buy_avg = (
            (today_amount / today_qty) if today_qty > 0 else Decimal(0)
        )

        overnight_basis = prev * overnight_qty if prev is not None else None
        overnight_pl = (
            (h.current_price - prev) * overnight_qty
            if prev is not None and overnight_qty > 0
            else Decimal(0)
        )
        today_pl = (h.current_price - today_buy_avg) * today_qty if today_qty > 0 else Decimal(0)

        # If overnight portion exists but previous_close failed, we skip THAT
        # position entirely so we don't quietly under-report.
        if overnight_qty > 0 and prev is None:
            continue

        today_components.append(overnight_pl + today_pl)
        basis_components.append(
            (overnight_basis or Decimal(0)) + (today_buy_avg * today_qty)
        )

    if today_components:
        today_change_usd = sum(today_components, Decimal(0)).quantize(Decimal("0.01"))
    basis_total = sum(basis_components, Decimal(0))
    today_change_pct = (
        ((today_change_usd / basis_total) * Decimal(100)).quantize(Decimal("0.01"))
        if today_change_usd is not None and basis_total > 0
        else None
    )

    return PortfolioSummary(
        holdings=holdings,
        total_eval_usd=total.quantize(Decimal("0.01")),
        total_pl_usd=balance.total_profit_usd,
        fx_rate=fx_rate,
        total_eval_krw=total_krw,
        cash_usd=cash.usd_cash if cash else None,
        cash_usd_available=cash.usd_withdrawable if cash else None,
        cash_krw=cash.krw_cash if cash else None,
        total_assets_krw=cash.total_assets_krw if cash else None,
        today_change_usd=today_change_usd,
        today_change_pct=today_change_pct,
        fetched_at=balance.fetched_at,
    )


def save_daily_snapshot(db: Session, summary: PortfolioSummary | None = None) -> PortfolioSnapshot:
    """Upsert today's snapshot row."""
    summary = summary or build_summary(db)
    today = date.today()
    existing = db.execute(
        select(PortfolioSnapshot).where(PortfolioSnapshot.snapshot_date == today)
    ).scalar_one_or_none()

    payload_holdings = [
        {
            "symbol": h.symbol,
            "name": h.name,
            "quantity": str(h.quantity),
            "avg_price": str(h.avg_price),
            "current_price": str(h.current_price),
            "eval_usd": str(h.eval_usd),
            "pl_usd": str(h.pl_usd),
            "pl_pct": str(h.pl_pct),
            "weight_pct": str(h.weight_pct),
        }
        for h in summary.holdings
    ]
    fx_rate = summary.fx_rate or Decimal(0)
    total_krw = summary.total_eval_krw or Decimal(0)

    if existing is None:
        snap = PortfolioSnapshot(
            snapshot_date=today,
            holdings=payload_holdings,
            total_usd=summary.total_eval_usd,
            total_krw=total_krw,
            fx_rate=fx_rate,
        )
        db.add(snap)
        result = snap
    else:
        existing.holdings = payload_holdings
        existing.total_usd = summary.total_eval_usd
        existing.total_krw = total_krw
        existing.fx_rate = fx_rate
        result = existing

    db.commit()
    return result


def run_daily_snapshot_job() -> dict:
    """Scheduler entrypoint. Safe to call when KIS creds are missing."""
    db: Session = SessionLocal()
    try:
        if not _kis_creds_present():
            logger.info("KIS credentials not configured; skipping portfolio snapshot.")
            return {"status": "skipped", "reason": "no_kis_credentials"}
        try:
            snap = save_daily_snapshot(db)
            return {
                "status": "ok",
                "date": snap.snapshot_date.isoformat(),
                "total_usd": str(snap.total_usd),
                "total_krw": str(snap.total_krw),
                "holdings": len(snap.holdings or []),
            }
        except kis.KisError as e:
            logger.warning("portfolio snapshot KIS error: %s", e)
            return {"status": "error", "reason": str(e)}
    finally:
        db.close()


def _kis_creds_present() -> bool:
    try:
        kis._require_creds()
        return True
    except kis.KisCredentialsMissing:
        return False
