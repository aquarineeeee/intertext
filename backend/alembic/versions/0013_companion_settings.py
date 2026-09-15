"""persist companion style and prompt

Revision ID: 0013_companion_settings
Revises: 0012_custom_ai_provider
"""
from alembic import op
import sqlalchemy as sa

revision = "0013_companion_settings"
down_revision = "0012_custom_ai_provider"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("companion_style", sa.String(20), nullable=True))
    op.add_column("users", sa.Column("companion_prompt", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "companion_prompt")
    op.drop_column("users", "companion_style")
