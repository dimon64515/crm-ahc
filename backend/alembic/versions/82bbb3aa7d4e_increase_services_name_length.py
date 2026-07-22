"""increase services name length

Revision ID: 82bbb3aa7d4e
Revises: 285290c62aff
Create Date: 2026-07-22 17:23:28.318417

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '82bbb3aa7d4e'
down_revision: Union[str, None] = '285290c62aff'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('services', 'name', type_=sa.String(1000), existing_nullable=False)


def downgrade() -> None:
    op.alter_column('services', 'name', type_=sa.String(255), existing_nullable=False)
