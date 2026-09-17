"""enforce unique MCP server names per user

Revision ID: 0016_unique_mcp_server_names
Revises: 0015_mcp_ai_tool_runtime
"""
from alembic import op


revision = "0016_unique_mcp_server_names"
down_revision = "0015_mcp_ai_tool_runtime"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint("uq_mcp_servers_user_name", "mcp_servers", ["user_id", "name"])


def downgrade() -> None:
    op.drop_constraint("uq_mcp_servers_user_name", "mcp_servers", type_="unique")
