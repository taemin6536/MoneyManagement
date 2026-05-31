"""GET /api/news — timeline of recent headlines.
GET /api/news/summary — Claude한국어 통합 요약 (60s cache).

We only return what RSS publishers syndicate; full text lives at `link`.
"""

from datetime import datetime, timezone
import time
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.session import get_db
from app.integrations import anthropic_client
from app.services import news as news_service

router = APIRouter()

DbDep = Annotated[Session, Depends(get_db)]


class NewsItemOut(BaseModel):
    id: int
    source: str
    title: str
    description: str | None
    link: str
    published_at: datetime | None
    fetched_at: datetime


class NewsListOut(BaseModel):
    items: list[NewsItemOut]
    sources: list[str]


def _row_to_out(r) -> NewsItemOut:
    return NewsItemOut(
        id=r.id,
        source=r.source,
        title=r.title,
        description=r.description,
        link=r.link,
        published_at=r.published_at,
        fetched_at=r.fetched_at,
    )


@router.get("/api/news", response_model=NewsListOut)
def get_news(
    db: DbDep,
    limit: int = Query(50, ge=1, le=200),
    source: str | None = None,
    days: int = Query(14, ge=1, le=60),
):
    rows = news_service.list_recent(db, limit=limit, source=source, days=days)
    sources = news_service.available_sources(db)
    return NewsListOut(items=[_row_to_out(r) for r in rows], sources=sources)


class NewsSummaryOut(BaseModel):
    available: bool
    summary: str | None
    items: list[NewsItemOut]  # the items that fed into the summary
    model: str
    generated_at: datetime


_summary_cache: dict | None = None
_summary_cache_at: float = 0.0
_SUMMARY_TTL = 60.0


@router.get("/api/news/summary", response_model=NewsSummaryOut)
def get_news_summary(db: DbDep):
    global _summary_cache, _summary_cache_at
    settings = get_settings()
    now = time.monotonic()
    if _summary_cache is not None and (now - _summary_cache_at) < _SUMMARY_TTL:
        return NewsSummaryOut(**_summary_cache)

    rows = news_service.top_for_summary(db, hours=24, limit=8)
    items_out = [_row_to_out(r) for r in rows]

    if not settings.anthropic_api_key:
        result = {
            "available": False,
            "summary": None,
            "items": items_out,
            "model": settings.anthropic_model,
            "generated_at": datetime.now(timezone.utc),
        }
        return NewsSummaryOut(**result)

    # Build the dict shape summarize_news expects.
    items_for_llm = [
        {
            "source": r.source,
            "title": r.title,
            "description": r.description,
            "link": r.link,
            "published_at": r.published_at.isoformat() if r.published_at else None,
        }
        for r in rows
    ]
    summary = anthropic_client.summarize_news(items_for_llm)
    result = {
        "available": True,
        "summary": summary,
        "items": items_out,
        "model": settings.anthropic_model,
        "generated_at": datetime.now(timezone.utc),
    }
    if summary:
        _summary_cache = result
        _summary_cache_at = now
    return NewsSummaryOut(**result)


@router.post("/api/dev/news-poll")
def dev_poll_news():
    """Force-trigger a feed poll (for local testing)."""
    return news_service.poll_all_feeds()
