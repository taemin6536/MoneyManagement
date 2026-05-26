"""Rule ③: Reduce QLD when overheated. 2-of-3 signals fire the alert.

Signals (v1):
- Channel breakout: today's high > 20-day high channel upper boundary (Donchian-like).
- RSI: 14-day RSI on daily close >= 80.
- Fear-Greed Index: latest value in "extreme greed" zone (>= 75).
"""

from dataclasses import dataclass
from decimal import Decimal

from .base import AlertEvent, fmt_pct


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


def evaluate(signals: OverheatedSignals, qqq_price: Decimal) -> list[AlertEvent]:
    if signals_hit_count(signals) < 2:
        return []

    bullets = [
        f"• 상승채널 상단 돌파: {'✅' if signals.channel_breakout else '·'}"
        + (f" (20D high {signals.channel_high})" if signals.channel_high else ""),
        f"• RSI 80 이상: {'✅' if signals.rsi_overbought else '·'}"
        + (f" (RSI {fmt_pct(signals.rsi_value)})" if signals.rsi_value is not None else ""),
        f"• 공포탐욕지수 극단 탐욕: {'✅' if signals.fgi_extreme_greed else '·'}"
        + (f" (FGI {signals.fgi_value})" if signals.fgi_value is not None else ""),
    ]

    return [
        AlertEvent(
            rule_id=RULE_ID,
            level="overheated",
            title="QQQ 과열 신호 — QLD 비중 축소 검토",
            body="과열 신호 2개 이상 충족:\n" + "\n".join(bullets) + f"\n현재 QQQ: {qqq_price}",
            severity="warn",
            payload={
                "channel_breakout": signals.channel_breakout,
                "rsi_overbought": signals.rsi_overbought,
                "fgi_extreme_greed": signals.fgi_extreme_greed,
                "rsi_value": str(signals.rsi_value) if signals.rsi_value is not None else None,
                "fgi_value": str(signals.fgi_value) if signals.fgi_value is not None else None,
                "channel_high": str(signals.channel_high) if signals.channel_high is not None else None,
                "qqq_price": str(qqq_price),
            },
        )
    ]
