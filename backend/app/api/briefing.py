"""GET /api/briefing — on-demand AI briefing for the dashboard button.

Reuses daily_report.gather_context so the narrative describes the same numbers
as the daily report. A 60-second in-memory cache prevents the button from
hammering the LLM on repeated clicks (single-worker process, so module state
is shared).
"""

from datetime import datetime, timezone
import time
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.session import get_db
from app.integrations import anthropic_client
from app.services import daily_report

router = APIRouter()

DbDep = Annotated[Session, Depends(get_db)]

_CACHE_TTL_SECONDS = 60.0
_cache: dict | None = None
_cache_at: float = 0.0


class BriefingOut(BaseModel):
    available: bool  # whether ANTHROPIC_API_KEY is configured
    briefing: str | None
    model: str
    generated_at: datetime


@router.get("/api/briefing", response_model=BriefingOut)
def get_briefing(db: DbDep):
    global _cache, _cache_at
    settings = get_settings()

    if not settings.anthropic_api_key:
        return BriefingOut(
            available=False,
            briefing=None,
            model=settings.anthropic_model,
            generated_at=datetime.now(timezone.utc),
        )

    now = time.monotonic()
    if _cache is not None and (now - _cache_at) < _CACHE_TTL_SECONDS:
        return BriefingOut(**_cache)

    ctx = daily_report.gather_context(db)
    narrative = anthropic_client.generate_briefing(ctx)
    result = {
        "available": True,
        "briefing": narrative,
        "model": settings.anthropic_model,
        "generated_at": datetime.now(timezone.utc),
    }
    # Only cache a successful generation; let failures retry on next click.
    if narrative:
        _cache = result
        _cache_at = now
    return BriefingOut(**result)
