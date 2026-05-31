"""trades

Revision ID: c8f24e1a7d3b
Revises: b7e91d8a4c2f
Create Date: 2026-05-31 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c8f24e1a7d3b'
down_revision: Union[str, None] = 'b7e91d8a4c2f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'trades',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('executed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('symbol', sa.String(length=16), nullable=False),
        sa.Column('side', sa.String(length=8), nullable=False),
        sa.Column('quantity', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('price_usd', sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column('total_usd', sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column('snapshot', sa.JSON(), nullable=True),
        sa.Column('rule_level', sa.String(length=64), nullable=True),
        sa.Column('note', sa.String(length=1000), nullable=True),
        sa.Column('source', sa.String(length=16), nullable=False, server_default='manual'),
        sa.Column('kis_order_id', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('kis_order_id', name='uq_trades_kis_order_id'),
    )
    op.create_index('ix_trades_executed_at_desc', 'trades', ['executed_at'], unique=False)
    op.create_index('ix_trades_symbol', 'trades', ['symbol'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_trades_symbol', table_name='trades')
    op.drop_index('ix_trades_executed_at_desc', table_name='trades')
    op.drop_table('trades')
