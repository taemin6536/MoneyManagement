"""CNN Fear & Greed Index via the (unofficial) dataviz endpoint.

The endpoint is anti-bot-gated; we send browser-like headers. If CNN ever
breaks this endpoint, the caller treats a None result as "signal unavailable"
and skips that branch of the overheated rule.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import logging

import httpx

logger = logging.getLogger(__name__)

CNN_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://edition.cnn.com/",
    "Origin": "https://edition.cnn.com",
}


@dataclass(slots=True)
class FgiReading:
    score: float
    rating: str  # "extreme fear" | "fear" | "neutral" | "greed" | "extreme greed"
    fetched_at: datetime


def fetch_current() -> FgiReading | None:
    try:
        resp = httpx.get(CNN_URL, headers=_HEADERS, timeout=10.0)
        resp.raise_for_status()
        payload = resp.json()
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("FGI fetch failed: %s", e)
        return None

    fg = payload.get("fear_and_greed") or {}
    score = fg.get("score")
    rating = fg.get("rating")
    if score is None or rating is None:
        logger.warning("FGI payload unexpected shape: keys=%s", list(payload.keys()))
        return None

    return FgiReading(
        score=float(score),
        rating=str(rating).lower(),
        fetched_at=datetime.now(timezone.utc),
    )
