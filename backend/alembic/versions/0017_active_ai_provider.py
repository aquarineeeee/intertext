"""persist the user's active AI provider

Revision ID: 0017_active_ai_provider
Revises: 0016_unique_mcp_server_names
"""
from alembic import op
import sqlalchemy as sa

revision = "0017_active_ai_provider"
down_revision = "0016_unique_mcp_server_names"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("active_provider_id", sa.String(36), nullable=True))
    op.create_foreign_key("fk_users_active_provider_id", "users", "ai_providers", ["active_provider_id"], ["id"], ondelete="SET NULL")
    op.execute(
        """
        UPDATE users
        SET active_provider_id = (
            SELECT ai_providers.id
            FROM ai_providers
            WHERE ai_providers.user_id = users.id AND ai_providers.enabled = true
            ORDER BY ai_providers.created_at
            LIMIT 1
        )
        """
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_active_provider_id", "users", type_="foreignkey")
    op.drop_column("users", "active_provider_id")
