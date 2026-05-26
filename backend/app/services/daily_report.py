"""Daily summary report sent to Slack after US market close.

Job runs once per day; cadence configured in scheduler. The report bundles
QQQ price/drawdown, TQQQ/QLD closes, VIX, FGI, RSI(14), USD/KRW.
"""

from datetime import datetime, timezone
from decimal import Decimal
import logging

from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.session import SessionLocal
from app.integrations import fgi, slack
from app.services import fx, market_data, signals

logger = logging.getLogger(__name__)


def _fmt_usd(value: Decimal | None) -> str:
    if value is None:
        return "—"
    return f"${value:,.2f}"


def _fmt_pct(value: Decimal | None) -> str:
    if value is None:
        return "—"
    return f"{value:+.2f}%"


def build_report(db: Session) -> tuple[str, str]:
    """Return (title, body) for the daily summary."""
    qqq = market_data.get_latest_price(db, "QQQ")
    tqqq = market_data.get_latest_price(db, "TQQQ")
    qld = market_data.get_latest_price(db, "QLD")
    vix = market_data.get_latest_price(db, "^VIX")
    ath = market_data.get_ath(db, "QQQ")
    fx_state = fx.get_latest_rate(db)
    tech = signals.compute_for("QQQ")
    f = fgi.fetch_current()

    drawdown = None
    if qqq is not None and ath is not None:
        drawdown = market_data.drawdown_pct(qqq.close, ath.ath_price).quantize(Decimal("0.01"))

    today = datetime.now(timezone.utc).date().isoformat()
    title = f"📊 일일 리포트 — {today}"

    rsi = tech.rsi_14 if tech else None
    fgi_line = f"FGI {f.score:.1f} ({f.rating})" if f else "FGI —"

    body = "\n".join(
        [
            f"*QQQ* {_fmt_usd(qqq.close if qqq else None)} "
            f"(ATH {_fmt_usd(ath.ath_price if ath else None)}, drawdown {_fmt_pct(drawdown)})",
            f"*TQQQ* {_fmt_usd(tqqq.close if tqqq else None)}    "
            f"*QLD* {_fmt_usd(qld.close if qld else None)}",
            f"*VIX* {vix.close if vix else '—'}    "
            f"*RSI(14)* {rsi if rsi is not None else '—'}    "
            f"{fgi_line}",
            f"*USD/KRW* ₩{fx_state.usd_krw if fx_state else '—'}",
        ]
    )
    return title, body


def send_daily_report() -> dict:
    db: Session = SessionLocal()
    try:
        title, body = build_report(db)
    finally:
        db.close()

    settings = get_settings()
    delivered = slack.send(settings.slack_webhook_url, title, body)
    return {
        "title": title,
        "delivered": delivered,
        "has_webhook": bool(settings.slack_webhook_url),
    }
