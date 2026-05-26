"""Rule ②: When QQQ recovers near its ATH, alert to sell all TQQQ and switch to QLD."""

from dataclasses import dataclass
from decimal import Decimal

from .base import AlertEvent, fmt_money, fmt_pct


RULE_ID = "rule_sell_recovery"

# How close to ATH counts as "recovered". 0.5% gap fires once near the top.
DEFAULT_RECOVERY_GAP_PCT = Decimal("0.5")


@dataclass(slots=True)
class SellRecoveryParams:
    recovery_gap_pct: Decimal = DEFAULT_RECOVERY_GAP_PCT


def evaluate(
    qqq_price: Decimal,
    qqq_ath: Decimal,
    holdings_tqqq_shares: Decimal | None = None,
    params: SellRecoveryParams | None = None,
) -> list[AlertEvent]:
    params = params or SellRecoveryParams()
    if qqq_ath <= 0:
        return []
    gap_pct = ((qqq_ath - qqq_price) / qqq_ath) * Decimal(100)
    if gap_pct > params.recovery_gap_pct:
        return []

    title = "QQQ 전고점 회복 — TQQQ 전량 매도 → QLD 전환"
    lines = [
        f"*QQQ*: {fmt_money(qqq_price)}  (ATH {fmt_money(qqq_ath)}, gap {fmt_pct(-gap_pct)})",
        "*TQQQ 전량 매도 → QLD 매수* 시점 알림.",
    ]
    if holdings_tqqq_shares and holdings_tqqq_shares > 0:
        lines.append(f"현재 TQQQ 보유: {holdings_tqqq_shares} 주")

    return [
        AlertEvent(
            rule_id=RULE_ID,
            level="recovery",
            title=title,
            body="\n".join(lines),
            severity="action",
            payload={
                "qqq_price": str(qqq_price),
                "qqq_ath": str(qqq_ath),
                "gap_pct": str(gap_pct),
            },
        )
    ]
