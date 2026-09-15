"""support custom AI provider interface formats

Revision ID: 0012_custom_ai_provider
Revises: 0011_split_reading_progress
"""
from alembic import op
import sqlalchemy as sa

revision = "0012_custom_ai_provider"
down_revision = "0011_split_reading_progress"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_providers", sa.Column("interface_format", sa.String(20), nullable=True))
    op.drop_constraint("ck_ai_providers_type", "ai_providers", type_="check")
    op.create_check_constraint("ck_ai_providers_type", "ai_providers", "provider_type IN ('openai', 'anthropic', 'ollama', 'custom')")


def downgrade() -> None:
    op.drop_constraint("ck_ai_providers_type", "ai_providers", type_="check")
    op.create_check_constraint("ck_ai_providers_type", "ai_providers", "provider_type IN ('openai', 'anthropic', 'ollama')")
    op.drop_column("ai_providers", "interface_format")
