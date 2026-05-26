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
    tqqq_price: Decimal | None = None,
    fx_rate: Decimal | None = None,
    steps: tuple[DrawdownStep, ...] = DEFAULT_STEPS,
) -> list[AlertEvent]:
    """Return alert events for every step the current drawdown has reached.

    The alert service dedups; we just enumerate "currently active" steps.
    """
    if qqq_ath <= 0:
        return []
    drawdown = ((qqq_price - qqq_ath) / qqq_ath) * Decimal(100)
    triggered = triggered_steps(drawdown, steps)
    events: list[AlertEvent] = []
    for idx, step in enumerate(triggered):
        # If multiple steps fire simultaneously, each later step assumes the
        # earlier ones already consumed their share — keeps the recommended
        # amounts honest in the rare case of a sudden multi-level drop.
        cash_for_step = cash_usd
        if cash_for_step is not None:
            for prev in triggered[:idx]:
                cash_for_step = cash_for_step * (Decimal(100) - prev.cash_pct) / Decimal(100)
        events.append(
            _build_event(
                step=step,
                step_index=steps.index(step),
                total_steps=len(steps),
                price=qqq_price,
                ath=qqq_ath,
                drawdown=drawdown,
                cash_usd=cash_for_step,
                tqqq_price=tqqq_price,
                fx_rate=fx_rate,
                next_step=_next_step_after(step, steps),
            )
        )
    return events


def _next_step_after(
    step: DrawdownStep, steps: tuple[DrawdownStep, ...]
) -> DrawdownStep | None:
    deeper = [s for s in steps if s.threshold_pct < step.threshold_pct]
    if not deeper:
        return None
    return max(deeper, key=lambda s: s.threshold_pct)


def _build_event(
    step: DrawdownStep,
    step_index: int,
    total_steps: int,
    price: Decimal,
    ath: Decimal,
    drawdown: Decimal,
    cash_usd: Decimal | None,
    tqqq_price: Decimal | None,
    fx_rate: Decimal | None,
    next_step: DrawdownStep | None,
) -> AlertEvent:
    step_num = step_index + 1
    title = (
        f"🚨 QQQ {fmt_pct(step.threshold_pct)} 도달 — "
        f"TQQQ 매수 [{step_num}/{total_steps}단계] ({step.cash_pct}%)"
    )

    lines: list[str] = []

    # Market section
    lines.append("*시장*")
    lines.append(
        f"QQQ {fmt_money(price)}  ·  ATH {fmt_money(ath)}  ·  drawdown {fmt_pct(drawdown)}"
    )
    if tqqq_price is not None and tqqq_price > 0:
        lines.append(f"TQQQ {fmt_money(tqqq_price)} (3배 레버리지)")
    lines.append("")

    # Recommendation section
    lines.append("*매수 권장*")
    lines.append(f"비율: 보유 USD의 *{step.cash_pct}%*")
    if cash_usd is not None and cash_usd > 0:
        suggested_usd = (cash_usd * step.cash_pct / Decimal(100)).quantize(Decimal("0.01"))
        remaining_usd = (cash_usd - suggested_usd).quantize(Decimal("0.01"))
        line = f"USD ${cash_usd:,.2f}의 {step.cash_pct}% = *${suggested_usd:,.2f}*"
        if fx_rate is not None and fx_rate > 0:
            suggested_krw = (suggested_usd * fx_rate).quantize(Decimal("1"))
            line += f"  (≈ ₩{suggested_krw:,.0f} @ ₩{fx_rate:.2f})"
        lines.append(line)
        if tqqq_price is not None and tqqq_price > 0:
            est_shares = (suggested_usd / tqqq_price).quantize(Decimal("0.0001"))
            lines.append(f"예상 TQQQ 주수: *{est_shares}* 주")
        lines.append(f"매수 후 USD 잔액: ${remaining_usd:,.2f}")
    else:
        lines.append("(현재 USD 예수금 정보 없음 — 한투 잔고 확인 후 비율대로 매수)")
    lines.append("")

    # Next step preview
    if next_step is not None:
        next_trigger_price = ath * (Decimal(1) + next_step.threshold_pct / Decimal(100))
        lines.append("*다음 트리거*")
        lines.append(
            f"{fmt_pct(next_step.threshold_pct)} 도달 시 "
            f"QQQ ≈ {fmt_money(next_trigger_price.quantize(Decimal('0.01')))} "
            f"→ 잔액의 {next_step.cash_pct}%"
        )
        lines.append("")

    # Action checklist
    lines.append("*액션*")
    lines.append("1. 한투 앱 → TQQQ 시장가 매수")
    lines.append("2. 시스템 /contributions → \"Tactical 매수 기록\" 입력")
    lines.append("3. 잔고 자동 동기화 확인 (대시보드)")

    return AlertEvent(
        rule_id=RULE_ID,
        level=_step_key(step),
        title=title,
        body="\n".join(lines),
        severity="action",
        payload={
            "step_num": step_num,
            "total_steps": total_steps,
            "qqq_price": str(price),
            "qqq_ath": str(ath),
            "drawdown_pct": str(drawdown),
            "threshold_pct": str(step.threshold_pct),
            "cash_pct": str(step.cash_pct),
            "cash_usd": str(cash_usd) if cash_usd is not None else None,
            "tqqq_price": str(tqqq_price) if tqqq_price is not None else None,
            "fx_rate": str(fx_rate) if fx_rate is not None else None,
        },
    )
