"""News service — polls RSS feeds, dedups by link, exposes queries.

Strict copyright posture: we store only what RSS publishers syndicate
(title + short description + link + time). Article bodies stay at the
original URL.
"""

from datetime import datetime, timedelta, timezone
import logging

from sqlalchemy import delete, distinct, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import NewsItem
from app.db.session import SessionLocal
from app.integrations import rss

logger = logging.getLogger(__name__)


def poll_all_feeds() -> dict:
    """Fetch every configured feed and insert new items. Dedup on link.

    Returns {feeds, fetched, inserted} for logging / dev triggers.
    """
    settings = get_settings()
    feeds = settings.news_rss_feeds_list
    fetched = 0
    inserted = 0

    db: Session = SessionLocal()
    try:
        for source, url in feeds:
            items = rss.fetch_feed(url)
            fetched += len(items)
            if not items:
                continue
            rows = [
                {
                    "source": source,
                    "title": it.title,
                    "description": it.description,
                    "link": it.link,
                    "published_at": it.published_at,
                }
                for it in items
            ]
            # ON CONFLICT (link) DO NOTHING — Postgres-specific upsert keeps
            # the existing row when the same link is fetched twice.
            stmt = pg_insert(NewsItem).values(rows).on_conflict_do_nothing(index_elements=["link"])
            result = db.execute(stmt)
            inserted += result.rowcount or 0
        db.commit()
    finally:
        db.close()

    logger.info("news.poll_all_feeds: feeds=%d fetched=%d inserted=%d",
                len(feeds), fetched, inserted)
    return {"feeds": len(feeds), "fetched": fetched, "inserted": inserted}


def list_recent(
    db: Session, limit: int = 50, source: str | None = None, days: int = 14
) -> list[NewsItem]:
    """Most recent items first. Falls back to fetched_at if published_at NULL."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    q = select(NewsItem).where(
        # If publisher gave us a published_at, gate on it; else gate on fetched_at.
        (
            (NewsItem.published_at.is_not(None) & (NewsItem.published_at >= cutoff))
            | (NewsItem.published_at.is_(None) & (NewsItem.fetched_at >= cutoff))
        )
    )
    if source:
        q = q.where(NewsItem.source == source)
    # Sort by best-available timestamp, newest first.
    q = q.order_by(
        NewsItem.published_at.desc().nullslast(),
        NewsItem.fetched_at.desc(),
    ).limit(limit)
    return list(db.execute(q).scalars())


def available_sources(db: Session) -> list[str]:
    """Distinct sources currently present in the DB (for filter chips)."""
    rows = db.execute(select(distinct(NewsItem.source)).order_by(NewsItem.source)).scalars()
    return [r for r in rows if r]


def top_for_summary(
    db: Session, hours: int = 24, per_source: int = 3, max_total: int = 15
) -> list[NewsItem]:
    """Round-robin top items per source for the AI summary.

    Without this, a high-velocity feed (MarketWatch) crowds out quieter ones
    (Fed, CNBC) when picking strictly by recency. We take up to `per_source`
    newest items per active source, then merge by recency and cap at
    `max_total`. This guarantees every active source is represented in the
    LLM input while still keeping the most recent items first.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    q = (
        select(NewsItem)
        .where(
            (NewsItem.published_at.is_not(None) & (NewsItem.published_at >= cutoff))
            | (NewsItem.published_at.is_(None) & (NewsItem.fetched_at >= cutoff))
        )
        .order_by(NewsItem.published_at.desc().nullslast(), NewsItem.fetched_at.desc())
    )
    rows = list(db.execute(q).scalars())

    by_source: dict[str, list[NewsItem]] = {}
    for item in rows:
        by_source.setdefault(item.source, []).append(item)

    selected: list[NewsItem] = []
    for items in by_source.values():
        selected.extend(items[:per_source])

    # Re-sort by best-available timestamp so the merged set still reads
    # most-recent-first when handed to the LLM.
    selected.sort(
        key=lambda x: x.published_at or x.fetched_at,
        reverse=True,
    )
    return selected[:max_total]


def purge_old(days: int = 14) -> int:
    """Delete items older than `days` (uses fetched_at as the floor)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    db: Session = SessionLocal()
    try:
        result = db.execute(delete(NewsItem).where(NewsItem.fetched_at < cutoff))
        db.commit()
        n = result.rowcount or 0
        logger.info("news.purge_old: removed=%d cutoff=%s", n, cutoff.isoformat())
        return n
    finally:
        db.close()
