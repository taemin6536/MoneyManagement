"""Rule ①: QQQ drawdown-based TQQQ buy alerts.

When QQQ falls -15% / -20% / -25% from its all-time high, alert the user to
buy TQQQ with 10% / 25% / 30% of available cash. The user executes the buy
manually; the system only signals.

Each step is fired at most once until the drawdown recovers above it; the
caller (alert service) layers a 24h dedup on top.
"""

from dataclasses import dataclass
from decimal import Decimal

from .base import AlertEvent, fmt_money, fmt_pct


RULE_ID = "rule_buy_drawdown"


@dataclass(frozen=True, slots=True)
class DrawdownStep:
    threshold_pct: Decimal  # negative, e.g. Decimal("-15")
    cash_pct: Decimal  # positive, e.g. Decimal("10")


DEFAULT_STEPS: tuple[DrawdownStep, ...] = (
    DrawdownStep(Decimal("-15"), Decimal("10")),
    DrawdownStep(Decimal("-20"), Decimal("25")),
    DrawdownStep(Decimal("-25"), Decimal("30")),
)


def _step_key(step: DrawdownStep) -> str:
    return f"drawdown_{int(step.threshold_pct)}"


def triggered_steps(
    drawdown: Decimal, steps: tuple[DrawdownStep, ...] = DEFAULT_STEPS
) -> list[DrawdownStep]:
    """Steps whose threshold the current drawdown has reached (drawdown <= threshold)."""
    return [s for s in steps if drawdown <= s.threshold_pct]


def deepest_step(
    drawdown: Decimal, steps: tuple[DrawdownStep, ...] = DEFAULT_STEPS
) -> DrawdownStep | None:
    triggered = triggered_steps(drawdown, steps)
    if not triggered:
        return None
    return min(triggered, key=lambda s: s.threshold_pct)


def evaluate(
    qqq_price: Decimal,
    qqq_ath: Decimal,
    cash_usd: Decimal | None = None,
    steps: tuple[DrawdownStep, ...] = DEFAULT_STEPS,
) -> list[AlertEvent]:
    """Return alert events for every step the current drawdown has reached.

    The alert service dedups; we just enumerate "currently active" steps.
    """
    if qqq_ath <= 0:
        return []
    drawdown = ((qqq_price - qqq_ath) / qqq_ath) * Decimal(100)
    events: list[AlertEvent] = []
    for step in triggered_steps(drawdown, steps):
        events.append(_build_event(step, qqq_price, qqq_ath, drawdown, cash_usd))
    return events


def _build_event(
    step: DrawdownStep,
    price: Decimal,
    ath: Decimal,
    drawdown: Decimal,
    cash_usd: Decimal | None,
) -> AlertEvent:
    title = f"QQQ {fmt_pct(step.threshold_pct)} 도달 — TQQQ 분할 매수 ({step.cash_pct}%)"
    lines = [
        f"*QQQ*: {fmt_money(price)}  (ATH {fmt_money(ath)}, drawdown {fmt_pct(drawdown)})",
        f"매수 비율: 보유 현금의 *{step.cash_pct}%*",
    ]
    if cash_usd is not None and cash_usd > 0:
        suggested = (cash_usd * step.cash_pct / Decimal(100)).quantize(Decimal("0.01"))
        lines.append(f"현재 현금 {fmt_money(cash_usd)} 기준 권장 매수액: *{fmt_money(suggested)}*")
    return AlertEvent(
        rule_id=RULE_ID,
        level=_step_key(step),
        title=title,
        body="\n".join(lines),
        severity="action",
        payload={
            "qqq_price": str(price),
            "qqq_ath": str(ath),
            "drawdown_pct": str(drawdown),
            "threshold_pct": str(step.threshold_pct),
            "cash_pct": str(step.cash_pct),
            "cash_usd": str(cash_usd) if cash_usd is not None else None,
        },
    )
