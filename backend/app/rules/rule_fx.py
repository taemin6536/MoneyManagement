"""USD/KRW threshold alerts.

Two rule families:
- rule_fx_threshold: absolute bands (e.g. ≤₩1300 buy-zone, ≥₩1400 risk-zone)
- rule_fx_dca_timing: relative — current rate vs 30D SMA. Even if absolute is
  high, dipping below the SMA flags a relatively cheaper conversion window
  for the monthly tactical contribution.
"""

from dataclasses import dataclass
from decimal import Decimal

from .base import AlertEvent


RULE_ID = "rule_fx_threshold"
RULE_ID_DCA = "rule_fx_dca_timing"


@dataclass(slots=True)
class FxThresholds:
    low: Decimal = Decimal("1300")   # below this → cheap USD (buy USD alert)
    high: Decimal = Decimal("1400")  # above this → KRW weak (FX risk alert)


def evaluate(usd_krw: Decimal, thresholds: FxThresholds | None = None) -> list[AlertEvent]:
    thresholds = thresholds or FxThresholds()
    events: list[AlertEvent] = []

    if usd_krw <= thresholds.low:
        events.append(
            AlertEvent(
                rule_id=RULE_ID,
                level=f"fx_below_{int(thresholds.low)}",
                title=f"USD/KRW {usd_krw} — 저가 구간 ({thresholds.low} 이하)",
                body=(
                    f"현재 환율 *₩{usd_krw}* — 임계 *₩{thresholds.low}* 이하.\n"
                    f"USD 매입(원화 → 달러 환전) 검토 시점."
                ),
                severity="info",
                payload={"usd_krw": str(usd_krw), "threshold_low": str(thresholds.low)},
            )
        )

    if usd_krw >= thresholds.high:
        events.append(
            AlertEvent(
                rule_id=RULE_ID,
                level=f"fx_above_{int(thresholds.high)}",
                title=f"USD/KRW {usd_krw} — 고가 구간 ({thresholds.high} 이상)",
                body=(
                    f"현재 환율 *₩{usd_krw}* — 임계 *₩{thresholds.high}* 이상.\n"
                    f"신규 USD 매입은 비싸짐. 기존 USD 자산은 원화 환산 평가 유리."
                ),
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
    """Fires when current rate is at least `threshold_pct` below the 30D SMA.

    `pending_tactical_krw` is optional context: if the user has X KRW sitting
    in tactical reserve that needs converting, the alert estimates what they
    save vs the SMA.
    """
    if current_rate <= 0 or sma_30 <= 0:
        return []
    cutoff = sma_30 * (Decimal(1) - threshold_pct / Decimal(100))
    if current_rate > cutoff:
        return []

    lines = [
        f"*USD/KRW* ₩{current_rate} — 30일 평균 ₩{sma_30} 대비 *{deviation_pct}%*.",
        f"이번 달 tactical 환전 또는 정기 USD 매입에 유리한 구간 (임계 {threshold_pct}%↓).",
    ]
    payload = {
        "usd_krw": str(current_rate),
        "sma_30": str(sma_30),
        "deviation_pct": str(deviation_pct),
        "threshold_pct": str(threshold_pct),
    }
    if pending_tactical_krw and pending_tactical_krw > 0:
        usd_at_sma = pending_tactical_krw / sma_30
        usd_now = pending_tactical_krw / current_rate
        savings_usd = (usd_now - usd_at_sma).quantize(Decimal("0.01"))
        lines.append(
            f"Tactical ₩{pending_tactical_krw:,.0f} 환전 시 평균 대비 *+${savings_usd}* 더 받음."
        )
        payload["pending_tactical_krw"] = str(pending_tactical_krw)
        payload["savings_usd"] = str(savings_usd)

    return [
        AlertEvent(
            rule_id=RULE_ID_DCA,
            level="dca_buy_zone",
            title=f"환전 타이밍 — ₩{current_rate} ({deviation_pct}% vs 30D SMA)",
            body="\n".join(lines),
            severity="info",
            payload=payload,
        )
    ]
