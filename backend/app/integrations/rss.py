"""Thin feedparser wrapper for RSS/Atom news feeds.

We only consume what publishers explicitly syndicate via RSS — title, short
description, link, published time. No article body, no scraping. If a feed
fails (network error, malformed XML, 4xx/5xx), we log and return [] so the
caller skips that source and moves on.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

# Skip absurdly long titles/descriptions — fits DB column + LLM context.
_TITLE_MAX = 510
_DESC_MAX = 1900


@dataclass
class ParsedItem:
    title: str
    description: str | None
    link: str
    published_at: datetime | None


def _truncate(s: str | None, limit: int) -> str | None:
    if s is None:
        return None
    s = s.strip()
    if not s:
        return None
    if len(s) <= limit:
        return s
    return s[: limit - 1] + "…"


def _parse_dt(entry) -> datetime | None:
    """Pull a tz-aware UTC datetime from a feedparser entry, if available."""
    for attr in ("published_parsed", "updated_parsed"):
        tm = getattr(entry, attr, None)
        if tm is not None:
            try:
                return datetime(*tm[:6], tzinfo=timezone.utc)
            except (TypeError, ValueError):
                continue
    return None


def fetch_feed(url: str, timeout: float = 10.0) -> list[ParsedItem]:
    """Parse the feed at `url` into ParsedItem rows. Returns [] on any failure."""
    try:
        import feedparser
    except ImportError:
        logger.warning("rss: feedparser not installed")
        return []

    try:
        # feedparser doesn't expose a direct timeout, but socket-level timeout
        # is set via the underlying urllib opener if we pass `request_headers`
        # with a User-Agent. For our cadence (30min) a 10s default is fine.
        import socket

        socket.setdefaulttimeout(timeout)
        parsed = feedparser.parse(url, request_headers={"User-Agent": "MoneyMonitor/0.1 (+RSS)"})
    except Exception as e:  # noqa: BLE001
        logger.warning("rss: fetch failed url=%s err=%s", url, e)
        return []

    if getattr(parsed, "bozo", False) and not parsed.entries:
        logger.info("rss: bozo/empty url=%s", url)
        return []

    items: list[ParsedItem] = []
    for entry in parsed.entries:
        link = getattr(entry, "link", None)
        title = getattr(entry, "title", None)
        if not link or not title:
            continue
        # feedparser exposes `summary` (RSS description / Atom summary).
        desc = getattr(entry, "summary", None)
        # Strip HTML tags from description for clean storage.
        desc = _strip_html(desc) if desc else None
        items.append(
            ParsedItem(
                title=_truncate(title, _TITLE_MAX) or "",
                description=_truncate(desc, _DESC_MAX),
                link=link.strip(),
                published_at=_parse_dt(entry),
            )
        )
    return items


def _strip_html(s: str) -> str:
    """Cheap HTML stripper — RSS summaries often contain &nbsp;/<p>/<a>."""
    import re
    import html as html_mod

    no_tags = re.sub(r"<[^>]+>", " ", s)
    unescaped = html_mod.unescape(no_tags)
    return re.sub(r"\s+", " ", unescaped).strip()
