"""rename watchman role to comendant

Revision ID: 78edcb14dd38
Revises: e6fe89dff18d
Create Date: 2026-07-17 10:43:04.718659

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '78edcb14dd38'
down_revision: Union[str, None] = 'e6fe89dff18d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE users SET role = 'comendant' WHERE role = 'watchman'")


def downgrade() -> None:
    op.execute("UPDATE users SET role = 'watchman' WHERE role = 'comendant'")
