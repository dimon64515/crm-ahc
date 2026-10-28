"""add unique constraint on works.request_id

Revision ID: d2abc734fe6c
Revises: cbc8b7958710
Create Date: 2026-10-28 19:14:28.234737

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2abc734fe6c'
down_revision: Union[str, None] = 'cbc8b7958710'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # На одну заявку может существовать только один отчёт
    op.create_unique_constraint('uix_work_request', 'works', ['request_id'])


def downgrade() -> None:
    op.drop_constraint('uix_work_request', 'works', type_='unique')
