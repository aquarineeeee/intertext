"""add user-scoped MCP servers and permanent call logs

Revision ID: 0008_mcp
Revises: 0007_ai_gateway
"""
from alembic import op
import sqlalchemy as sa

revision = "0008_mcp"
down_revision = "0007_ai_gateway"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mcp_servers",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("endpoint", sa.String(1000), nullable=False),
        sa.Column("transport", sa.String(24), nullable=False),
        sa.Column("encrypted_token", sa.Text(), nullable=True),
        sa.Column("tool_allowlist", sa.JSON(), nullable=False),
        sa.Column("capabilities", sa.JSON(), nullable=True),
        sa.Column("enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("transport IN ('streamable-http', 'sse')", name="ck_mcp_servers_transport"),
    )
    op.create_index("ix_mcp_servers_user_id", "mcp_servers", ["user_id"])
    op.create_table(
        "mcp_call_logs",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("mcp_server_id", sa.String(36), nullable=True),
        sa.Column("tool_name", sa.String(255), nullable=False),
        sa.Column("request_params", sa.JSON(), nullable=False),
        sa.Column("response_content", sa.Text(), nullable=True),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["mcp_server_id"], ["mcp_servers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mcp_call_logs_user_created", "mcp_call_logs", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_mcp_call_logs_user_created", table_name="mcp_call_logs")
    op.drop_table("mcp_call_logs")
    op.drop_index("ix_mcp_servers_user_id", table_name="mcp_servers")
    op.drop_table("mcp_servers")
