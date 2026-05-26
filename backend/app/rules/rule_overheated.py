"""Rule ③: Reduce QLD when overheated. 2-of-3 signals fire the alert.

Signals (v1):
- Channel breakout: today's high > 20-day high channel upper boundary (Donchian-like).
- RSI: 14-day RSI on daily close >= 80.
- Fear-Greed Index: latest value in "extreme greed" zone (>= 75).
"""

from dataclasses import dataclass
from decimal import Decimal

from .base import AlertEvent, fmt_money


RULE_ID = "rule_overheated"


@dataclass(slots=True)
class OverheatedSignals:
    channel_breakout: bool
    rsi_overbought: bool  # RSI >= 80
    fgi_extreme_greed: bool  # FGI >= 75
    rsi_value: Decimal | None = None
    fgi_value: Decimal | None = None
    channel_high: Decimal | None = None


def signals_hit_count(s: OverheatedSignals) -> int:
    return int(s.channel_breakout) + int(s.rsi_overbought) + int(s.fgi_extreme_greed)


def evaluate(
    signals: OverheatedSignals,
    qqq_price: Decimal,
    holdings_qld_shares: Decimal | None = None,
    qld_price: Decimal | None = None,
    fx_rate: Decimal | None = None,
) -> list[AlertEvent]:
    hits = signals_hit_count(signals)
    if hits < 2:
        return []

    title = f"🔥 QQQ 과열 신호 ({hits}/3) — QLD 비중 축소 검토"

    lines: list[str] = []
    lines.append("*신호 상태*")
    lines.append(
        f"{'✅' if signals.channel_breakout else '⬜'} 20D 상승채널 상단 돌파"
        + (f"  (high vs ch {signals.channel_high})" if signals.channel_high is not None else "")
    )
    lines.append(
        f"{'✅' if signals.rsi_overbought else '⬜'} RSI(14) ≥ 80"
        + (f"  (현재 *{signals.rsi_value}*)" if signals.rsi_value is not None else "")
    )
    lines.append(
        f"{'✅' if signals.fgi_extreme_greed else '⬜'} FGI ≥ 75 (극단 탐욕)"
        + (f"  (현재 *{signals.fgi_value}*)" if signals.fgi_value is not None else "")
    )
    lines.append("")

    lines.append("*시장*")
    lines.append(f"QQQ {fmt_money(qqq_price)}")
    if qld_price is not None and qld_price > 0:
        lines.append(f"QLD {fmt_money(qld_price)}")
    lines.append("")

    # Current QLD + suggested reduction
    if holdings_qld_shares is not None and holdings_qld_shares > 0:
        lines.append("*현재 QLD 포지션*")
        lines.append(f"보유: *{holdings_qld_shares}* 주")
        if qld_price is not None and qld_price > 0:
            qld_value = (holdings_qld_shares * qld_price).quantize(Decimal("0.01"))
            line = f"평가금: *${qld_value:,.2f}*"
            if fx_rate is not None and fx_rate > 0:
                qld_value_krw = (qld_value * fx_rate).quantize(Decimal("1"))
                line += f"  (≈ ₩{qld_value_krw:,.0f})"
            lines.append(line)
            # Suggest reducing by 1/3 as a default — user adjusts to taste
            reduce_qty = (holdings_qld_shares / Decimal(3)).quantize(Decimal("0.0001"))
            reduce_value = (reduce_qty * qld_price).quantize(Decimal("0.01"))
            lines.append(f"제안: ≈ *{reduce_qty} 주 매도* (≈ ${reduce_value:,.2f}) — 1/3 축소")
        lines.append("")
    else:
        lines.append("_QLD 보유 없음 — 정보용 알람_")
        lines.append("")

    lines.append("*액션 (선택)*")
    lines.append("- QLD 일부 매도 → USD 현금으로 복귀 (Tactical 회복)")
    lines.append("- 또는 QLD → QQQ 전환 (디레버리지)")
    lines.append("- 강제 의무 아님 — 본인 판단 (신호 ≠ 보장)")

    return [
        AlertEvent(
            rule_id=RULE_ID,
            level="overheated",
            title=title,
            body="\n".join(lines),
            severity="warn",
            payload={
                "hits": hits,
                "channel_breakout": signals.channel_breakout,
                "rsi_overbought": signals.rsi_overbought,
                "fgi_extreme_greed": signals.fgi_extreme_greed,
                "rsi_value": str(signals.rsi_value) if signals.rsi_value is not None else None,
                "fgi_value": str(signals.fgi_value) if signals.fgi_value is not None else None,
                "channel_high": str(signals.channel_high) if signals.channel_high is not None else None,
                "qqq_price": str(qqq_price),
                "qld_shares": str(holdings_qld_shares) if holdings_qld_shares else None,
                "qld_price": str(qld_price) if qld_price else None,
            },
        )
    ]
