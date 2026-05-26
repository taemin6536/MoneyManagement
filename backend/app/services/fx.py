"""USD/KRW exchange rate polling + persistence."""

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import FxHistory
from app.integrations import yfinance_client

logger = logging.getLogger(__name__)

FX_SYMBOL = "KRW=X"  # yfinance code for USD/KRW


@dataclass(slots=True)
class FxResult:
    persisted: bool
    rate: Decimal | None


def poll_fx(db: Session) -> FxResult:
    quote = yfinance_client.fetch_quote(FX_SYMBOL)
    if quote is None or quote.price is None:
        return FxResult(persisted=False, rate=None)

    # FxHistory has no unique constraint on ts, so we dedup by checking the
    # most recent row — exchange rates rarely change second-to-second anyway.
    last = db.execute(
        select(FxHistory).order_by(FxHistory.ts.desc()).limit(1)
    ).scalar_one_or_none()
    if last is not None and last.ts == quote.ts and last.usd_krw == quote.price:
        return FxResult(persisted=False, rate=quote.price)

    db.add(FxHistory(ts=quote.ts, usd_krw=quote.price))
    return FxResult(persisted=True, rate=quote.price)


def get_latest_rate(db: Session) -> FxHistory | None:
    return db.execute(
        select(FxHistory).order_by(FxHistory.ts.desc()).limit(1)
    ).scalar_one_or_none()
