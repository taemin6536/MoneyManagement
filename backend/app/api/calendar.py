"""Economic calendar API — list / add / edit / delete macro events."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services import calendar as calendar_service

router = APIRouter()

DbDep = Annotated[Session, Depends(get_db)]


class EventOut(BaseModel):
    id: int
    event_at: datetime
    country: str
    category: str
    name: str
    description: str | None
    importance: str
    source_url: str | None
    created_at: datetime


class EventListOut(BaseModel):
    items: list[EventOut]


def _to_out(ev) -> EventOut:
    return EventOut(
        id=ev.id,
        event_at=ev.event_at,
        country=ev.country,
        category=ev.category,
        name=ev.name,
        description=ev.description,
        importance=ev.importance,
        source_url=ev.source_url,
        created_at=ev.created_at,
    )


@router.get("/api/calendar", response_model=EventListOut)
def list_events(
    db: DbDep,
    days: int = Query(90, ge=1, le=730),
    country: str | None = None,
    importance: str | None = None,
):
    rows = calendar_service.list_upcoming(
        db, days=days, country=country, importance=importance
    )
    return EventListOut(items=[_to_out(ev) for ev in rows])


class EventIn(BaseModel):
    event_at: datetime
    country: str = Field(min_length=1, max_length=8)
    category: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=256)
    description: str | None = None
    importance: str = "med"
    source_url: str | None = None


@router.post("/api/calendar", response_model=EventOut)
def create_event(db: DbDep, payload: EventIn):
    if payload.importance.lower() not in ("high", "med", "low"):
        raise HTTPException(status_code=400, detail="importance must be high|med|low")
    ev = calendar_service.create_event(
        db,
        event_at=payload.event_at,
        country=payload.country,
        category=payload.category,
        name=payload.name,
        description=payload.description,
        importance=payload.importance,
        source_url=payload.source_url,
    )
    return _to_out(ev)


class EventPatchIn(BaseModel):
    event_at: datetime | None = None
    country: str | None = None
    category: str | None = None
    name: str | None = None
    description: str | None = None
    importance: str | None = None
    source_url: str | None = None


@router.patch("/api/calendar/{event_id}", response_model=EventOut)
def patch_event(db: DbDep, event_id: int, payload: EventPatchIn):
    if payload.importance and payload.importance.lower() not in ("high", "med", "low"):
        raise HTTPException(status_code=400, detail="importance must be high|med|low")
    ev = calendar_service.update_event(
        db,
        event_id,
        event_at=payload.event_at,
        country=payload.country,
        category=payload.category,
        name=payload.name,
        description=payload.description,
        importance=payload.importance,
        source_url=payload.source_url,
    )
    if ev is None:
        raise HTTPException(status_code=404, detail="event not found")
    return _to_out(ev)


@router.delete("/api/calendar/{event_id}")
def delete_event(db: DbDep, event_id: int):
    ok = calendar_service.delete_event(db, event_id)
    if not ok:
        raise HTTPException(status_code=404, detail="event not found")
    return {"deleted": True}
