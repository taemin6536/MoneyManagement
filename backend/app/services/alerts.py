"""Alert delivery: dedup, persist, deliver to Slack."""

from datetime import datetime, timedelta, timezone
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import AlertLog, RuleConfig
from app.integrations import slack
from app.rules.base import AlertEvent

logger = logging.getLogger(__name__)

DEFAULT_DEDUP_WINDOW = timedelta(hours=24)


def _was_sent_recently(
    db: Session, rule_id: str, level: str, window: timedelta
) -> bool:
    cutoff = datetime.now(timezone.utc) - window
    row = db.execute(
        select(AlertLog.id)
        .where(
            AlertLog.rule_id == rule_id,
            AlertLog.level == level,
            AlertLog.fired_at >= cutoff,
            AlertLog.status == "sent",
        )
        .limit(1)
    ).first()
    return row is not None


def _ensure_rule_config(db: Session, rule_id: str) -> None:
    exists = db.execute(
        select(RuleConfig.rule_id).where(RuleConfig.rule_id == rule_id).limit(1)
    ).first()
    if exists is None:
        db.add(RuleConfig(rule_id=rule_id, params={}, enabled=True))
        db.flush()


def deliver(
    db: Session,
    event: AlertEvent,
    dedup_window: timedelta = DEFAULT_DEDUP_WINDOW,
) -> str:
    """Persist and deliver an alert. Returns the resulting status:

    - "skipped" — dedup window blocked it
    - "sent"    — Slack delivered (or no webhook configured but logged ok)
    - "failed"  — Slack delivery attempted and failed
    """
    _ensure_rule_config(db, event.rule_id)

    if _was_sent_recently(db, event.rule_id, event.level, dedup_window):
        log = AlertLog(
            rule_id=event.rule_id,
            level=event.level,
            payload=event.payload,
            status="skipped",
        )
        db.add(log)
        db.flush()
        return "skipped"

    settings = get_settings()
    delivered = slack.send(settings.slack_webhook_url, event.title, event.body)
    status = "sent" if delivered or not settings.slack_webhook_url else "failed"

    db.add(
        AlertLog(
            rule_id=event.rule_id,
            level=event.level,
            payload=event.payload,
            status=status,
        )
    )
    db.flush()
    return status


def deliver_many(
    db: Session, events: list[AlertEvent], dedup_window: timedelta = DEFAULT_DEDUP_WINDOW
) -> dict[str, int]:
    counts = {"sent": 0, "skipped": 0, "failed": 0}
    for event in events:
        status = deliver(db, event, dedup_window=dedup_window)
        counts[status] = counts.get(status, 0) + 1
    db.commit()
    return counts
