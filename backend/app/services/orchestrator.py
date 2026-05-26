"""Top-level orchestration: poll prices → evaluate rules → deliver alerts."""

from datetime import datetime, timezone
from decimal import Decimal
import logging

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.integrations import fgi, kis
from app.rules import rule_buy_drawdown, rule_fx, rule_overheated, rule_sell_recovery
from app.rules.base import AlertEvent
from app.services import alerts as alerts_service
from app.services import contributions as contributions_service
from app.services import fx, market_data, signals

logger = logging.getLogger(__name__)

# Score >= this counts as "extreme greed" per CNN's own thresholding (75+).
FGI_EXTREME_GREED_THRESHOLD = 75.0
RSI_OVERBOUGHT_THRESHOLD = Decimal("80")


def _build_overheated_signals(qqq_price: Decimal) -> rule_overheated.OverheatedSignals | None:
    tech = signals.compute_for("QQQ")
    fgi_reading = fgi.fetch_current()
    if tech is None and fgi_reading is None:
        return None

    rsi_val = tech.rsi_14 if tech else None
    channel_high = tech.channel_high_20 if tech else None
    channel_breakout = bool(tech and tech.channel_breakout)
    rsi_overbought = bool(rsi_val is not None and rsi_val >= RSI_OVERBOUGHT_THRESHOLD)
    fgi_val = Decimal(str(fgi_reading.score)) if fgi_reading else None
    fgi_extreme = bool(fgi_reading and fgi_reading.score >= FGI_EXTREME_GREED_THRESHOLD)

    return rule_overheated.OverheatedSignals(
        channel_breakout=channel_breakout,
        rsi_overbought=rsi_overbought,
        fgi_extreme_greed=fgi_extreme,
        rsi_value=rsi_val,
        fgi_value=fgi_val,
        channel_high=channel_high,
    )


def evaluate_all_rules(db: Session) -> list[AlertEvent]:
    ath = market_data.get_ath(db, "QQQ")
    if ath is None:
        logger.info("No QQQ ATH state yet; skipping rule evaluation.")
        return []

    last = market_data.get_latest_price(db, "QQQ")
    if last is None:
        logger.info("No QQQ price observed yet; skipping rule evaluation.")
        return []

    tactical = contributions_service.tactical_balance(db)
    cash_usd: Decimal | None = None
    # Prefer KIS *available* USD (net of unsettled buys) — that's what can
    # actually be deployed on the next trigger. Total cash includes money
    # already committed to pending settlements; using it would over-recommend.
    try:
        cash = kis.fetch_cash_balances()
        if cash.usd_withdrawable and cash.usd_withdrawable > 0:
            cash_usd = cash.usd_withdrawable
    except kis.KisError as e:
        logger.info("orchestrator: KIS cash unavailable (%s), falling back to manual tactical", e)
    # Fall back to manually-tracked tactical reserve when KIS is unavailable.
    if cash_usd is None and tactical.usd and tactical.usd > 0:
        cash_usd = tactical.usd

    events: list[AlertEvent] = []
    events.extend(
        rule_buy_drawdown.evaluate(
            qqq_price=last.close, qqq_ath=ath.ath_price, cash_usd=cash_usd
        )
    )
    events.extend(
        rule_sell_recovery.evaluate(qqq_price=last.close, qqq_ath=ath.ath_price)
    )
    overheated_signals = _build_overheated_signals(last.close)
    if overheated_signals is not None:
        events.extend(rule_overheated.evaluate(overheated_signals, last.close))

    latest_fx = fx.get_latest_rate(db)
    if latest_fx is not None:
        events.extend(rule_fx.evaluate(latest_fx.usd_krw))
        sma = signals.compute_fx_sma()
        if sma is not None and sma.sma_30 is not None and sma.deviation_pct is not None:
            events.extend(
                rule_fx.evaluate_dca_timing(
                    current_rate=latest_fx.usd_krw,
                    sma_30=sma.sma_30,
                    deviation_pct=sma.deviation_pct,
                    threshold_pct=sma.threshold_pct,
                    pending_tactical_krw=tactical.krw if tactical.krw > 0 else None,
                )
            )
    return events


def poll_and_evaluate() -> dict:
    """Single tick: poll prices + FX, persist, evaluate rules, deliver alerts."""
    db: Session = SessionLocal()
    try:
        poll_results = market_data.poll_all(db)
        fx_result = fx.poll_fx(db)
        db.commit()
        events = evaluate_all_rules(db)
        delivery = alerts_service.deliver_many(db, events) if events else {"sent": 0, "skipped": 0, "failed": 0}
        return {
            "ts": datetime.now(timezone.utc).isoformat(),
            "polled": [
                {"symbol": r.symbol, "persisted": r.persisted, "price": str(r.price) if r.price else None}
                for r in poll_results
            ],
            "fx": {
                "rate": str(fx_result.rate) if fx_result.rate else None,
                "persisted": fx_result.persisted,
            },
            "events": len(events),
            "delivery": delivery,
        }
    finally:
        db.close()
