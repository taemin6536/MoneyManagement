"""economic_events

Revision ID: d3f5e9c81b27
Revises: c8f24e1a7d3b
Create Date: 2026-05-31 20:00:00.000000

Seed dates below are best-effort from the published 2026 release schedules:
- FOMC: 2:00 PM ET on day 2 of each meeting (federalreserve.gov)
- BLS releases (NFP/CPI/PCE): 8:30 AM ET (release.bls.gov)
- BOK rate decisions: 10:00 AM KST on the announcement date (bok.or.kr)

UTC times below already account for US EDT (UTC-4) since all remaining
2026 events are within DST (Mar 8 – Nov 1, 2026). Verify and fix via the
UI if reality drifts.
"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd3f5e9c81b27'
down_revision: Union[str, None] = 'c8f24e1a7d3b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _utc(year: int, month: int, day: int, hour: int, minute: int) -> str:
    """Format UTC ISO string for SQL INSERT."""
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc).isoformat()


def upgrade() -> None:
    op.create_table(
        'economic_events',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('event_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('country', sa.String(length=8), nullable=False),
        sa.Column('category', sa.String(length=32), nullable=False),
        sa.Column('name', sa.String(length=256), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('importance', sa.String(length=8), nullable=False, server_default='med'),
        sa.Column('source_url', sa.String(length=512), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('country', 'category', 'event_at',
                            name='uq_economic_events_country_category_event_at'),
    )
    op.create_index('ix_economic_events_event_at', 'economic_events', ['event_at'], unique=False)
    op.create_index('ix_economic_events_importance_event_at', 'economic_events',
                    ['importance', 'event_at'], unique=False)

    # 2026 잔여 시드 (5월 31일 기준). UTC 시각.
    # US BLS 8:30 ET (EDT 기간) = 12:30 UTC. US FOMC 2:00 PM ET = 18:00 UTC. BOK 10:00 KST = 01:00 UTC.
    seed = [
        # June 2026
        ("US", "NFP", _utc(2026, 6, 5, 12, 30), "고용보고서 (NFP) — 5월",
         "비농업 부문 고용 변동·실업률·시간당 임금", "high"),
        ("US", "CPI", _utc(2026, 6, 11, 12, 30), "소비자물가지수 (CPI) — 5월",
         "헤드라인·근원 CPI YoY/MoM", "high"),
        ("US", "FOMC", _utc(2026, 6, 17, 18, 0), "FOMC 금리 결정",
         "금리 결정 + Powell 기자회견 (점도표 포함)", "high"),
        ("US", "PCE", _utc(2026, 6, 26, 12, 30), "PCE 물가지수 — 5월",
         "Fed가 가장 주목하는 인플레이션 지표", "high"),

        # July 2026
        ("US", "NFP", _utc(2026, 7, 2, 12, 30), "고용보고서 (NFP) — 6월", None, "high"),
        ("US", "CPI", _utc(2026, 7, 15, 12, 30), "소비자물가지수 (CPI) — 6월", None, "high"),
        ("US", "FOMC", _utc(2026, 7, 29, 18, 0), "FOMC 금리 결정",
         "금리 결정 + Powell 기자회견", "high"),
        ("US", "PCE", _utc(2026, 7, 31, 12, 30), "PCE 물가지수 — 6월", None, "high"),

        # August 2026
        ("US", "NFP", _utc(2026, 8, 7, 12, 30), "고용보고서 (NFP) — 7월", None, "high"),
        ("US", "CPI", _utc(2026, 8, 12, 12, 30), "소비자물가지수 (CPI) — 7월", None, "high"),
        ("US", "PCE", _utc(2026, 8, 28, 12, 30), "PCE 물가지수 — 7월", None, "high"),

        # September 2026
        ("US", "NFP", _utc(2026, 9, 4, 12, 30), "고용보고서 (NFP) — 8월", None, "high"),
        ("US", "CPI", _utc(2026, 9, 10, 12, 30), "소비자물가지수 (CPI) — 8월", None, "high"),
        ("US", "FOMC", _utc(2026, 9, 16, 18, 0), "FOMC 금리 결정",
         "금리 결정 + Powell 기자회견 (점도표 포함)", "high"),
        ("US", "PCE", _utc(2026, 9, 25, 12, 30), "PCE 물가지수 — 8월", None, "high"),

        # October 2026
        ("US", "NFP", _utc(2026, 10, 2, 12, 30), "고용보고서 (NFP) — 9월", None, "high"),
        ("US", "CPI", _utc(2026, 10, 14, 12, 30), "소비자물가지수 (CPI) — 9월", None, "high"),
        ("US", "FOMC", _utc(2026, 10, 28, 18, 0), "FOMC 금리 결정",
         "금리 결정 + Powell 기자회견", "high"),
        ("US", "PCE", _utc(2026, 10, 30, 12, 30), "PCE 물가지수 — 9월", None, "high"),

        # November 2026 (DST ends Nov 1 2026 → BLS becomes 13:30 UTC, FOMC 19:00 UTC)
        ("US", "NFP", _utc(2026, 11, 6, 13, 30), "고용보고서 (NFP) — 10월", None, "high"),
        ("US", "CPI", _utc(2026, 11, 12, 13, 30), "소비자물가지수 (CPI) — 10월", None, "high"),
        ("US", "PCE", _utc(2026, 11, 25, 13, 30), "PCE 물가지수 — 10월", None, "high"),

        # December 2026
        ("US", "NFP", _utc(2026, 12, 4, 13, 30), "고용보고서 (NFP) — 11월", None, "high"),
        ("US", "CPI", _utc(2026, 12, 10, 13, 30), "소비자물가지수 (CPI) — 11월", None, "high"),
        ("US", "FOMC", _utc(2026, 12, 9, 19, 0), "FOMC 금리 결정",
         "금리 결정 + Powell 기자회견 (점도표 포함)", "high"),
        ("US", "PCE", _utc(2026, 12, 23, 13, 30), "PCE 물가지수 — 11월", None, "high"),

        # 한국은행 금통위 (2026 잔여 — 통상 10:00 KST = 01:00 UTC)
        ("KR", "BOK_RATE", _utc(2026, 7, 9, 1, 0), "한국은행 금통위 — 기준금리 결정", None, "high"),
        ("KR", "BOK_RATE", _utc(2026, 8, 27, 1, 0), "한국은행 금통위 — 기준금리 결정", None, "high"),
        ("KR", "BOK_RATE", _utc(2026, 10, 22, 1, 0), "한국은행 금통위 — 기준금리 결정", None, "high"),
        ("KR", "BOK_RATE", _utc(2026, 11, 26, 1, 0), "한국은행 금통위 — 기준금리 결정", None, "high"),
    ]

    op.bulk_insert(
        sa.table(
            "economic_events",
            sa.column("event_at", sa.DateTime(timezone=True)),
            sa.column("country", sa.String),
            sa.column("category", sa.String),
            sa.column("name", sa.String),
            sa.column("description", sa.String),
            sa.column("importance", sa.String),
        ),
        [
            {
                "event_at": event_at,
                "country": country,
                "category": category,
                "name": name,
                "description": description,
                "importance": importance,
            }
            for (country, category, event_at, name, description, importance) in seed
        ],
    )


def downgrade() -> None:
    op.drop_index('ix_economic_events_importance_event_at', table_name='economic_events')
    op.drop_index('ix_economic_events_event_at', table_name='economic_events')
    op.drop_table('economic_events')
