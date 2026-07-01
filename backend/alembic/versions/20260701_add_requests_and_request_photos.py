"""add requests and request_photos

Revision ID: 9096c3f4f961
Revises: 9312931bf41d
Create Date: 2026-07-01 14:30:08.224758

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9096c3f4f961'
down_revision: Union[str, None] = '9312931bf41d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "requests",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("building_id", sa.Integer(), sa.ForeignKey("buildings.id"), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'new'")),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assigned_to", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("extended_count", sa.Integer(), server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_table(
        "request_photos",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("request_id", sa.Integer(), sa.ForeignKey("requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_name", sa.String(255)),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("file_size", sa.Integer()),
        sa.Column("mime_type", sa.String(50)),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("request_photos")
    op.drop_table("requests")
