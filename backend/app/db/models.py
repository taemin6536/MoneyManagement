from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class PriceHistory(Base):
    __tablename__ = "prices_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(16), nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    open: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    high: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    low: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    close: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    volume: Mapped[int | None] = mapped_column(BigInteger)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="yfinance")

    __table_args__ = (
        UniqueConstraint("symbol", "ts", name="uq_prices_symbol_ts"),
        Index("ix_prices_symbol_ts_desc", "symbol", "ts"),
    )


class AthState(Base):
    __tablename__ = "ath_state"

    symbol: Mapped[str] = mapped_column(String(16), primary_key=True)
    ath_price: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    ath_date: Mapped[date] = mapped_column(Date, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class RuleConfig(Base):
    __tablename__ = "rules_config"

    rule_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    params: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AlertLog(Base):
    __tablename__ = "alerts_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    rule_id: Mapped[str] = mapped_column(String(64), ForeignKey("rules_config.rule_id"), nullable=False)
    level: Mapped[str] = mapped_column(String(32), nullable=False)  # e.g. "drawdown_-15"
    fired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="sent")  # sent | failed | skipped

    __table_args__ = (
        Index("ix_alerts_rule_level_fired", "rule_id", "level", "fired_at"),
    )


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"

    snapshot_date: Mapped[date] = mapped_column(Date, primary_key=True)
    holdings: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    total_usd: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    total_krw: Mapped[Decimal] = mapped_column(Numeric(18, 0), nullable=False)
    fx_rate: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FxHistory(Base):
    __tablename__ = "fx_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    usd_krw: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)

    __table_args__ = (Index("ix_fx_ts_desc", "ts"),)


class Contribution(Base):
    """Monthly cash inflow from the user, split into core (auto-buy) and tactical (reserve)."""

    __tablename__ = "contributions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    contribution_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount_krw: Mapped[Decimal] = mapped_column(Numeric(18, 0), nullable=False)
    core_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("70"))
    core_krw: Mapped[Decimal] = mapped_column(Numeric(18, 0), nullable=False)
    tactical_krw: Mapped[Decimal] = mapped_column(Numeric(18, 0), nullable=False)
    fx_rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (Index("ix_contributions_date", "contribution_date"),)


class KrwBalanceSnapshot(Base):
    """User-declared KRW cash sitting in the brokerage account (not yet converted to USD).

    Snapshot-based: each row is the balance as-of a date. Most recent row =
    current. We don't compute it from deltas — user just updates whenever it
    changes. Older rows kept as history.
    """

    __tablename__ = "krw_balance_snapshots"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    as_of_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount_krw: Mapped[Decimal] = mapped_column(Numeric(18, 0), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (Index("ix_krw_balance_date", "as_of_date"),)


class TacticalDeposit(Base):
    """Direct USD top-up to the tactical reserve.

    Use this when the user has already converted KRW → USD in the brokerage
    and wants to mark "this much USD cash is now sitting available for TQQQ
    buy-DCA". Distinct from `Contribution` (which models the 70/30 KRW split).
    """

    __tablename__ = "tactical_deposits"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    deposit_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount_usd: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    amount_krw: Mapped[Decimal | None] = mapped_column(Numeric(18, 0))
    fx_rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (Index("ix_tactical_deposits_date", "deposit_date"),)


class TacticalBuy(Base):
    """Manual record of when tactical-reserve cash was deployed into a leveraged ETF."""

    __tablename__ = "tactical_buys"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    buy_date: Mapped[date] = mapped_column(Date, nullable=False)
    symbol: Mapped[str] = mapped_column(String(16), nullable=False)  # TQQQ / QLD
    amount_krw: Mapped[Decimal] = mapped_column(Numeric(18, 0), nullable=False)
    amount_usd: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    fx_rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    rule_level: Mapped[str | None] = mapped_column(String(64))  # e.g. "drawdown_-15"
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (Index("ix_tactical_buys_date", "buy_date"),)


class NewsItem(Base):
    """A single news headline from an RSS feed.

    We store only what RSS publishers explicitly provide for syndication
    (title, short description, link, published time). No full article text —
    that's the publisher's copyrighted content and goes via the link only.
    """

    __tablename__ = "news_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str | None] = mapped_column(String(2000))
    link: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    category: Mapped[str | None] = mapped_column(String(32))

    __table_args__ = (Index("ix_news_published_at_desc", "published_at"),)
