"""news_items

Revision ID: b7e91d8a4c2f
Revises: 3809839a7833
Create Date: 2026-05-28 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7e91d8a4c2f'
down_revision: Union[str, None] = '3809839a7833'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'news_items',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('source', sa.String(length=64), nullable=False),
        sa.Column('title', sa.String(length=512), nullable=False),
        sa.Column('description', sa.String(length=2000), nullable=True),
        sa.Column('link', sa.String(length=1024), nullable=False),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('fetched_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('category', sa.String(length=32), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('link', name='uq_news_items_link'),
    )
    op.create_index('ix_news_published_at_desc', 'news_items', ['published_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_news_published_at_desc', table_name='news_items')
    op.drop_table('news_items')
