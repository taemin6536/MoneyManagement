"""Market data orchestration: poll prices, persist, maintain ATH state."""

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
import logging

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.db.models import AthState, PriceHistory
from app.integrations import yfinance_client

logger = logging.getLogger(__name__)

# Symbols we track. QQQ is the strategy anchor; TQQQ/QLD are holdings; ^VIX volatility.
TRACKED_SYMBOLS: tuple[str, ...] = ("QQQ", "TQQQ", "QLD", "^VIX")

# ATH is tracked only for symbols that drive rules.
ATH_SYMBOLS: tuple[str, ...] = ("QQQ",)


@dataclass(slots=True)
class PollResult:
    symbol: str
    persisted: bool
    price: Decimal | None
    new_ath: bool = False


def upsert_price(db: Session, quote: yfinance_client.Quote, source: str = "yfinance") -> bool:
    """Insert price bar; ignore duplicates on (symbol, ts)."""
    stmt = (
        pg_insert(PriceHistory)
        .values(
            symbol=quote.symbol,
            ts=quote.ts,
            open=quote.open,
            high=quote.high,
            low=quote.low,
            close=quote.price,
            volume=quote.volume,
            source=source,
        )
        .on_conflict_do_nothing(index_elements=["symbol", "ts"])
    )
    result = db.execute(stmt)
    return result.rowcount > 0


def get_ath(db: Session, symbol: str) -> AthState | None:
    return db.execute(select(AthState).where(AthState.symbol == symbol)).scalar_one_or_none()


def get_latest_price(db: Session, symbol: str) -> PriceHistory | None:
    return db.execute(
        select(PriceHistory)
        .where(PriceHistory.symbol == symbol)
        .order_by(PriceHistory.ts.desc())
        .limit(1)
    ).scalar_one_or_none()


def update_ath_if_higher(db: Session, symbol: str, price: Decimal, observed_at: datetime) -> bool:
    """Update ATH state when a strictly higher price is seen. Returns True if updated.

    Caller must ensure ATH state exists (via seed_ath_from_history) before invoking.
    """
    state = get_ath(db, symbol)
    if state is None:
        return False
    if price > state.ath_price:
        state.ath_price = price
        state.ath_date = observed_at.date()
        state.updated_at = datetime.now(timezone.utc)
        return True
    return False


def seed_ath_from_history(db: Session, symbol: str, period: str = "max") -> bool:
    """Initialize ATH from yfinance daily history. Idempotent: if state exists, skip."""
    if get_ath(db, symbol) is not None:
        return False
    bars = yfinance_client.fetch_history(symbol, period=period)
    if not bars:
        logger.warning("seed_ath_from_history: no bars for %s", symbol)
        return False
    high_bar = max(bars, key=lambda b: b.high)
    db.add(
        AthState(
            symbol=symbol,
            ath_price=high_bar.high,
            ath_date=high_bar.ts.date(),
            updated_at=datetime.now(timezone.utc),
        )
    )
    return True


def drawdown_pct(price: Decimal, ath: Decimal) -> Decimal:
    """Return drawdown as a non-positive percentage. E.g. -15 means 15% below ATH."""
    if ath <= 0:
        return Decimal(0)
    return ((price - ath) / ath) * Decimal(100)


def poll_symbol(db: Session, symbol: str) -> PollResult:
    quote = yfinance_client.fetch_quote(symbol)
    if quote is None or quote.price is None:
        return PollResult(symbol=symbol, persisted=False, price=None)

    persisted = upsert_price(db, quote)
    new_ath = False
    if symbol in ATH_SYMBOLS:
        if get_ath(db, symbol) is None:
            seed_ath_from_history(db, symbol)
        new_ath = update_ath_if_higher(db, symbol, quote.price, quote.ts)

    return PollResult(symbol=symbol, persisted=persisted, price=quote.price, new_ath=new_ath)


def poll_all(db: Session) -> list[PollResult]:
    results = [poll_symbol(db, s) for s in TRACKED_SYMBOLS]
    db.commit()
    return results
