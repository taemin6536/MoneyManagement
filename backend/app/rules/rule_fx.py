"""USD/KRW threshold + DCA-timing alerts."""

from dataclasses import dataclass
from decimal import Decimal

from .base import AlertEvent


RULE_ID = "rule_fx_threshold"
RULE_ID_DCA = "rule_fx_dca_timing"


@dataclass(slots=True)
class FxThresholds:
    low: Decimal = Decimal("1300")
    high: Decimal = Decimal("1400")


def evaluate(
    usd_krw: Decimal,
    thresholds: FxThresholds | None = None,
    pending_tactical_krw: Decimal | None = None,
) -> list[AlertEvent]:
    thresholds = thresholds or FxThresholds()
    events: list[AlertEvent] = []

    if usd_krw <= thresholds.low:
        lines = [
            "*상황*",
            f"현재 USD/KRW *₩{usd_krw}* — 저가 임계 *₩{thresholds.low}* 이하",
            "원화 → USD 환전이 유리한 구간",
            "",
            "*액션*",
            "- 한투 앱 → 외환 → 원화 → 달러 환전",
            f"- Tactical 적립 예정 금액 환전 후 대기",
        ]
        if pending_tactical_krw and pending_tactical_krw > 0:
            est_usd = (pending_tactical_krw / usd_krw).quantize(Decimal("0.01"))
            lines.insert(
                3,
                f"미환전 KRW ₩{pending_tactical_krw:,.0f} → 환전 시 ≈ *${est_usd:,.2f}*",
            )
        events.append(
            AlertEvent(
                rule_id=RULE_ID,
                level=f"fx_below_{int(thresholds.low)}",
                title=f"💱 USD/KRW ₩{usd_krw} — 저가 구간 (환전 유리)",
                body="\n".join(lines),
                severity="info",
                payload={"usd_krw": str(usd_krw), "threshold_low": str(thresholds.low)},
            )
        )

    if usd_krw >= thresholds.high:
        lines = [
            "*상황*",
            f"현재 USD/KRW *₩{usd_krw}* — 고가 임계 *₩{thresholds.high}* 이상",
            "신규 USD 매입은 비싸짐. 기존 USD 자산은 원화 환산 평가 유리.",
            "",
            "*해석*",
            "- 추가 환전 보류 권장",
            "- 보유 USD 자산 평가금이 KRW 기준 상승 (위안)",
            "- 환차익 실현 고려 (USD → KRW 역환전) — 단 강제 의무 아님",
        ]
        events.append(
            AlertEvent(
                rule_id=RULE_ID,
                level=f"fx_above_{int(thresholds.high)}",
                title=f"⚠️ USD/KRW ₩{usd_krw} — 고가 구간 (원화 약세)",
                body="\n".join(lines),
                severity="warn",
                payload={"usd_krw": str(usd_krw), "threshold_high": str(thresholds.high)},
            )
        )

    return events


def evaluate_dca_timing(
    current_rate: Decimal,
    sma_30: Decimal,
    deviation_pct: Decimal,
    threshold_pct: Decimal,
    pending_tactical_krw: Decimal | None = None,
) -> list[AlertEvent]:
    """Fires when current rate is at least `threshold_pct` below the 30D SMA."""
    if current_rate <= 0 or sma_30 <= 0:
        return []
    cutoff = sma_30 * (Decimal(1) - threshold_pct / Decimal(100))
    if current_rate > cutoff:
        return []

    title = f"💱 환전 타이밍 — ₩{current_rate} ({deviation_pct}% vs 30D 평균)"
    lines: list[str] = []
    lines.append("*상황*")
    lines.append(f"현재 USD/KRW *₩{current_rate}*")
    lines.append(f"30일 평균 *₩{sma_30}* 대비 *{deviation_pct}%*")
    lines.append("→ 평균보다 저렴한 구간, 환전 타이밍 유리")
    lines.append("")

    payload: dict[str, str | None] = {
        "usd_krw": str(current_rate),
        "sma_30": str(sma_30),
        "deviation_pct": str(deviation_pct),
        "threshold_pct": str(threshold_pct),
    }

    if pending_tactical_krw and pending_tactical_krw > 0:
        usd_at_sma = (pending_tactical_krw / sma_30).quantize(Decimal("0.01"))
        usd_now = (pending_tactical_krw / current_rate).quantize(Decimal("0.01"))
        savings_usd = (usd_now - usd_at_sma).quantize(Decimal("0.01"))
        savings_krw = (savings_usd * current_rate).quantize(Decimal("1"))
        lines.append("*환전 예시*")
        lines.append(f"미환전 KRW ₩{pending_tactical_krw:,.0f} 환전 시:")
        lines.append(f"- 현재 환율: ≈ *${usd_now:,.2f}*")
        lines.append(f"- 평균 환율 가정: ≈ ${usd_at_sma:,.2f}")
        lines.append(f"- 절감: *+${savings_usd:,.2f}* (≈ ₩{savings_krw:,.0f})")
        lines.append("")
        payload["pending_tactical_krw"] = str(pending_tactical_krw)
        payload["savings_usd"] = str(savings_usd)

    lines.append("*액션*")
    lines.append("- 한투 앱 → 외환 → KRW → USD 환전")
    lines.append("- 환전된 USD는 자동으로 Tactical Reserve로 인식됨 (KIS 동기화)")

    return [
        AlertEvent(
            rule_id=RULE_ID_DCA,
            level="dca_buy_zone",
            title=title,
            body="\n".join(lines),
            severity="info",
            payload=payload,
        )
    ]
