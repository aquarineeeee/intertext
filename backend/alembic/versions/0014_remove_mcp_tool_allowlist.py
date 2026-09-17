"""remove user-level MCP tool allowlists

Revision ID: 0014_remove_mcp_tool_allowlist
Revises: 0013_companion_settings
"""
from alembic import op
import sqlalchemy as sa


revision = "0014_remove_mcp_tool_allowlist"
down_revision = "0013_companion_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("mcp_servers", "tool_allowlist")


def downgrade() -> None:
    op.add_column("mcp_servers", sa.Column("tool_allowlist", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
