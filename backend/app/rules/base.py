from dataclasses import dataclass, field
from decimal import Decimal


@dataclass(slots=True)
class AlertEvent:
    """An alertable event produced by a rule. Persistence and Slack delivery happen downstream."""

    rule_id: str
    level: str  # canonical per-rule key for dedup, e.g. "drawdown_-15"
    title: str  # human-readable
    body: str
    severity: str = "info"  # info | warn | action
    payload: dict = field(default_factory=dict)


def fmt_money(value: Decimal | float, currency: str = "USD") -> str:
    d = Decimal(value)
    sign = "$" if currency == "USD" else ""
    return f"{sign}{d:,.2f}"


def fmt_pct(value: Decimal | float) -> str:
    return f"{Decimal(value):+.2f}%"
