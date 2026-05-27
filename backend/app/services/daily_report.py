"""Daily summary report sent to Slack after US market close.

Bundles QQQ price/drawdown, TQQQ/QLD closes, VIX, FGI, RSI, USD/KRW into a
single status digest. Runs once per weekday after the US session.
"""

from datetime import datetime, timezone
from decimal import Decimal
import logging

from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.session import SessionLocal
from app.integrations import anthropic_client, fgi, kis, slack, telegram
from app.services import contributions as contributions_service
from app.services import fx, market_data, signals

logger = logging.getLogger(__name__)


def _usd(value: Decimal | None) -> str:
    if value is None:
        return "—"
    return f"${value:,.2f}"


def _krw(value: Decimal | None) -> str:
    if value is None:
        return "—"
    return f"₩{value:,.0f}"


def _pct(value: Decimal | None, digits: int = 2) -> str:
    if value is None:
        return "—"
    sign = "+" if value > 0 else ""
    return f"{sign}{value:.{digits}f}%"


def gather_context(db: Session) -> dict:
    """Collect every number the report (and AI briefing) needs into one dict.

    Single source of truth: the daily report and the /api/briefing endpoint
    both build from this, so they always describe identical data.
    """
    qqq = market_data.get_latest_price(db, "QQQ")
    tqqq = market_data.get_latest_price(db, "TQQQ")
    qld = market_data.get_latest_price(db, "QLD")
    vix = market_data.get_latest_price(db, "^VIX")
    ath = market_data.get_ath(db, "QQQ")
    fx_state = fx.get_latest_rate(db)
    tech = signals.compute_for("QQQ")
    fgi_now = fgi.fetch_current()
    sma = signals.compute_fx_sma()

    drawdown: Decimal | None = None
    next_trigger_price: Decimal | None = None
    if qqq is not None and ath is not None:
        drawdown = market_data.drawdown_pct(qqq.close, ath.ath_price).quantize(Decimal("0.01"))
        # Next deeper buy trigger if we're not at one yet.
        for threshold in [Decimal("-15"), Decimal("-20"), Decimal("-25")]:
            if drawdown > threshold:
                next_trigger_price = (ath.ath_price * (Decimal(1) + threshold / Decimal(100))).quantize(Decimal("0.01"))
                break

    tactical = contributions_service.tactical_balance(db)
    cash_usd: Decimal | None = None
    cash_krw: Decimal | None = None
    holdings: list[dict] = []
    try:
        balance = kis.fetch_overseas_balance()
        for h in balance.holdings:
            if h.quantity > 0:
                holdings.append(
                    {
                        "symbol": h.symbol,
                        "quantity": h.quantity,
                        "current_price": h.current_price,
                        "eval_usd": h.eval_amount_usd,
                        "pl_usd": h.profit_loss_usd,
                        "pl_pct": h.profit_rate_pct,
                    }
                )
        cb = kis.fetch_cash_balances()
        cash_usd = cb.usd_withdrawable
        cash_krw = cb.krw_cash
    except kis.KisError as e:
        logger.info("daily_report: KIS context unavailable (%s)", e)

    return {
        "date": datetime.now(timezone.utc).date().isoformat(),
        "qqq_price": qqq.close if qqq else None,
        "qqq_ath": ath.ath_price if ath else None,
        "qqq_ath_date": ath.ath_date if ath else None,
        "drawdown_pct": drawdown,
        "next_trigger_price": next_trigger_price,
        "tqqq_price": tqqq.close if tqqq else None,
        "qld_price": qld.close if qld else None,
        "rsi_14": tech.rsi_14 if tech else None,
        "channel_breakout": bool(tech.channel_breakout) if tech else False,
        "fgi_score": fgi_now.score if fgi_now else None,
        "fgi_rating": fgi_now.rating if fgi_now else None,
        "vix": vix.close if vix else None,
        "usd_krw": fx_state.usd_krw if fx_state else None,
        "fx_sma_30": sma.sma_30 if sma else None,
        "fx_deviation_pct": sma.deviation_pct if sma else None,
        "holdings": holdings,
        "cash_usd": cash_usd,
        "cash_krw": cash_krw,
        "tactical_usd": tactical.usd,
    }


def _render_raw_lines(ctx: dict) -> list[str]:
    """Render the structured context into the existing Slack/Telegram markdown."""
    lines: list[str] = []

    # 1. Strategy anchor
    lines.append("*전략 anchor (QQQ)*")
    line = f"QQQ {_usd(ctx['qqq_price'])}"
    if ctx["qqq_ath"] is not None:
        line += f"  ·  ATH {_usd(ctx['qqq_ath'])} ({ctx['qqq_ath_date']})"
    lines.append(line)
    if ctx["drawdown_pct"] is not None:
        lines.append(f"Drawdown *{_pct(ctx['drawdown_pct'])}*")
        if ctx["next_trigger_price"] is not None:
            lines.append(f"_다음 트리거: QQQ {_usd(ctx['next_trigger_price'])}_")
    lines.append("")

    # 2. Leveraged ETFs
    lines.append("*레버리지 ETF*")
    lines.append(f"TQQQ {_usd(ctx['tqqq_price'])}  ·  QLD {_usd(ctx['qld_price'])}")
    lines.append("")

    # 3. Overheated signals
    lines.append("*과열 신호*")
    rsi_str = f"RSI {ctx['rsi_14']}" if ctx["rsi_14"] is not None else "RSI —"
    fgi_str = (
        f"FGI {ctx['fgi_score']:.1f} ({ctx['fgi_rating']})"
        if ctx["fgi_score"] is not None
        else "FGI —"
    )
    vix_str = f"VIX {ctx['vix']}" if ctx["vix"] is not None else "VIX —"
    lines.append(f"{rsi_str}  ·  {fgi_str}  ·  {vix_str}")
    if ctx["channel_breakout"]:
        lines.append("_20D 상승채널 상단 돌파 중_")
    lines.append("")

    # 4. FX
    lines.append("*환율*")
    if ctx["usd_krw"] is not None:
        fx_line = f"USD/KRW *₩{ctx['usd_krw']}*"
        if ctx["fx_sma_30"] is not None and ctx["fx_deviation_pct"] is not None:
            fx_line += f"  ·  30D 평균 ₩{ctx['fx_sma_30']}  ·  {_pct(ctx['fx_deviation_pct'])} vs 평균"
        lines.append(fx_line)
    else:
        lines.append("USD/KRW —")
    lines.append("")

    # 5. Portfolio
    lines.append("*포트폴리오*")
    if ctx["holdings"]:
        for h in ctx["holdings"]:
            pl_str = f"{_usd(h['pl_usd'])} ({_pct(h['pl_pct'])})"
            lines.append(
                f"• *{h['symbol']}* — {h['quantity']} 주 @ {_usd(h['current_price'])} → {_usd(h['eval_usd'])} · P/L {pl_str}"
            )
    else:
        lines.append("(KIS 잔고 정보 없음)")
    cash_line_parts: list[str] = []
    if ctx["cash_usd"] is not None:
        cash_line_parts.append(f"USD 주문가능 *{_usd(ctx['cash_usd'])}*")
    if ctx["cash_krw"] is not None:
        cash_line_parts.append(f"KRW 예수금 *{_krw(ctx['cash_krw'])}*")
    if not cash_line_parts and ctx["tactical_usd"]:
        cash_line_parts.append(f"Tactical(manual) {_usd(ctx['tactical_usd'])}")
    if cash_line_parts:
        lines.append(" · ".join(cash_line_parts))

    return lines


def build_report(db: Session) -> tuple[str, str]:
    ctx = gather_context(db)

    title = f"📊 일일 리포트 — {ctx['date']}"

    lines: list[str] = []

    # AI briefing on top (graceful: skipped if no key / API error).
    narrative = anthropic_client.generate_briefing(ctx)
    if narrative:
        lines.append("*🤖 오늘의 브리핑*")
        lines.append(narrative)
        lines.append("")

    lines.extend(_render_raw_lines(ctx))

    body = "\n".join(lines)
    return title, body


def send_daily_report() -> dict:
    db: Session = SessionLocal()
    try:
        title, body = build_report(db)
    finally:
        db.close()

    settings = get_settings()
    slack_ok = slack.send(settings.slack_webhook_url, title, body)
    tg_ok = telegram.send(settings.telegram_bot_token, settings.telegram_chat_id, title, body)
    return {
        "title": title,
        "slack_delivered": slack_ok,
        "telegram_delivered": tg_ok,
        "has_slack": bool(settings.slack_webhook_url),
        "has_telegram": bool(settings.telegram_bot_token and settings.telegram_chat_id),
    }
