"""add request is_emergency

Revision ID: cbc8b7958710
Revises: 4e8ae5818313
Create Date: 2026-08-20 12:49:13.011242

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cbc8b7958710'
down_revision: Union[str, None] = '4e8ae5818313'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'requests',
        sa.Column('is_emergency', sa.Boolean(), server_default='false', nullable=False)
    )


def downgrade() -> None:
    op.drop_column('requests', 'is_emergency')
