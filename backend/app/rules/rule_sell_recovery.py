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
    tqqq_price: Decimal | None = None,
    qld_price: Decimal | None = None,
    fx_rate: Decimal | None = None,
    params: SellRecoveryParams | None = None,
) -> list[AlertEvent]:
    params = params or SellRecoveryParams()
    if qqq_ath <= 0:
        return []
    gap_pct = ((qqq_ath - qqq_price) / qqq_ath) * Decimal(100)
    if gap_pct > params.recovery_gap_pct:
        return []

    title = "🚀 QQQ 전고점 회복 — TQQQ 전량 매도 → QLD 전환"

    lines: list[str] = []
    lines.append("*시장*")
    lines.append(
        f"QQQ {fmt_money(qqq_price)}  ·  ATH {fmt_money(qqq_ath)}  ·  gap {fmt_pct(-gap_pct)}"
    )
    if tqqq_price is not None and tqqq_price > 0:
        lines.append(f"TQQQ {fmt_money(tqqq_price)} (현재 보유)")
    if qld_price is not None and qld_price > 0:
        lines.append(f"QLD {fmt_money(qld_price)} (전환 대상, 2배 레버리지)")
    lines.append("")

    # Current TQQQ position + estimated switch
    if holdings_tqqq_shares is not None and holdings_tqqq_shares > 0:
        lines.append("*현재 TQQQ 포지션*")
        lines.append(f"보유: *{holdings_tqqq_shares}* 주")
        if tqqq_price is not None and tqqq_price > 0:
            tqqq_value = (holdings_tqqq_shares * tqqq_price).quantize(Decimal("0.01"))
            line = f"평가금: *${tqqq_value:,.2f}*"
            if fx_rate is not None and fx_rate > 0:
                tqqq_value_krw = (tqqq_value * fx_rate).quantize(Decimal("1"))
                line += f"  (≈ ₩{tqqq_value_krw:,.0f})"
            lines.append(line)
            if qld_price is not None and qld_price > 0:
                est_qld_shares = (tqqq_value / qld_price).quantize(Decimal("0.0001"))
                lines.append(f"→ 동일 USD로 QLD 매수 시 ≈ *{est_qld_shares}* 주")
        lines.append("")
    else:
        lines.append("_TQQQ 보유 없음 — 알람 무시해도 됨_")
        lines.append("")

    lines.append("*액션*")
    lines.append("1. 한투 앱 → TQQQ 전량 시장가 매도")
    lines.append("2. 매도 직후 동일 USD로 QLD 시장가 매수")
    lines.append("3. KIS API가 잔고 자동 동기화 (다음 폴 사이클)")

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
                "tqqq_shares": str(holdings_tqqq_shares) if holdings_tqqq_shares else None,
                "tqqq_price": str(tqqq_price) if tqqq_price else None,
                "qld_price": str(qld_price) if qld_price else None,
            },
        )
    ]
