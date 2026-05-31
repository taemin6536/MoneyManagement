"""Economic calendar service — read, write, and pick events for the
daily report / dashboard countdown.

No external sync in v1. Seed table (Alembic) + manual UI edits."""

from datetime import datetime, timedelta, timezone
import logging

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.db.models import EconomicEvent

logger = logging.getLogger(__name__)


def list_upcoming(
    db: Session,
    days: int = 90,
    country: str | None = None,
    importance: str | None = None,
) -> list[EconomicEvent]:
    """Future events within `days`, soonest first."""
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=days)
    q = (
        select(EconomicEvent)
        .where(EconomicEvent.event_at >= now)
        .where(EconomicEvent.event_at <= horizon)
        .order_by(EconomicEvent.event_at.asc())
    )
    if country:
        q = q.where(EconomicEvent.country == country.upper())
    if importance:
        q = q.where(EconomicEvent.importance == importance.lower())
    return list(db.execute(q).scalars())


def list_in_window(
    db: Session, hours_from: int = 0, hours_to: int = 168
) -> list[EconomicEvent]:
    """Events whose event_at falls within [now+hours_from, now+hours_to].

    Used by daily_report for the "다가오는 7일" section. Ordered by time."""
    now = datetime.now(timezone.utc)
    start = now + timedelta(hours=hours_from)
    end = now + timedelta(hours=hours_to)
    q = (
        select(EconomicEvent)
        .where(and_(EconomicEvent.event_at >= start, EconomicEvent.event_at <= end))
        .order_by(EconomicEvent.event_at.asc())
    )
    return list(db.execute(q).scalars())


def next_high(db: Session) -> EconomicEvent | None:
    """Single next high-importance event after now (dashboard countdown)."""
    now = datetime.now(timezone.utc)
    q = (
        select(EconomicEvent)
        .where(EconomicEvent.event_at >= now)
        .where(EconomicEvent.importance == "high")
        .order_by(EconomicEvent.event_at.asc())
        .limit(1)
    )
    return db.execute(q).scalar_one_or_none()


def get_one(db: Session, event_id: int) -> EconomicEvent | None:
    return db.get(EconomicEvent, event_id)


def create_event(
    db: Session,
    event_at: datetime,
    country: str,
    category: str,
    name: str,
    description: str | None = None,
    importance: str = "med",
    source_url: str | None = None,
) -> EconomicEvent:
    ev = EconomicEvent(
        event_at=event_at,
        country=country.upper(),
        category=category.upper(),
        name=name,
        description=description,
        importance=importance.lower(),
        source_url=source_url,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


def update_event(
    db: Session,
    event_id: int,
    *,
    event_at: datetime | None = None,
    country: str | None = None,
    category: str | None = None,
    name: str | None = None,
    description: str | None = None,
    importance: str | None = None,
    source_url: str | None = None,
) -> EconomicEvent | None:
    ev = db.get(EconomicEvent, event_id)
    if ev is None:
        return None
    if event_at is not None:
        ev.event_at = event_at
    if country is not None:
        ev.country = country.upper()
    if category is not None:
        ev.category = category.upper()
    if name is not None:
        ev.name = name
    if description is not None:
        ev.description = description
    if importance is not None:
        ev.importance = importance.lower()
    if source_url is not None:
        ev.source_url = source_url
    db.commit()
    db.refresh(ev)
    return ev


def delete_event(db: Session, event_id: int) -> bool:
    ev = db.get(EconomicEvent, event_id)
    if ev is None:
        return False
    db.delete(ev)
    db.commit()
    return True
