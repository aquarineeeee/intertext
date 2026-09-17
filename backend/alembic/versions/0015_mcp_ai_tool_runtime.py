"""persist MCP tool bindings, transcript checkpoints and run cancellation

Revision ID: 0015_mcp_ai_tool_runtime
Revises: 0014_remove_mcp_tool_allowlist
"""
from alembic import op
import sqlalchemy as sa


revision = "0015_mcp_ai_tool_runtime"
down_revision = "0014_remove_mcp_tool_allowlist"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_runs", sa.Column("cancel_requested_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "mcp_tool_configs",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("mcp_server_id", sa.String(36), nullable=False),
        sa.Column("tool_name", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("input_schema", sa.JSON(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("discovered_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["mcp_server_id"], ["mcp_servers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("mcp_server_id", "tool_name", name="uq_mcp_tool_configs_server_tool"),
    )
    op.create_index("ix_mcp_tool_configs_server_id", "mcp_tool_configs", ["mcp_server_id"])

    op.create_table(
        "ai_run_tool_bindings",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("run_id", sa.String(36), nullable=False),
        sa.Column("exposed_tool_name", sa.String(255), nullable=False),
        sa.Column("mcp_server_id", sa.String(36), nullable=False),
        sa.Column("tool_name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("input_schema", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["ai_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "exposed_tool_name", name="uq_ai_run_tool_binding_name"),
    )
    op.create_index("ix_ai_run_tool_bindings_run_id", "ai_run_tool_bindings", ["run_id"])

    op.create_table(
        "ai_run_transcript_entries",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("run_id", sa.String(36), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("entry_type", sa.String(32), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["ai_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "sequence", name="uq_ai_run_transcript_run_sequence"),
    )
    op.create_index("ix_ai_run_transcript_run_id", "ai_run_transcript_entries", ["run_id"])

    for name, column in (
        ("ai_run_id", sa.String(36)),
        ("provider_call_id", sa.String(255)),
        ("invocation_id", sa.String(36)),
        ("exposed_tool_name", sa.String(255)),
    ):
        op.add_column("mcp_call_logs", sa.Column(name, column, nullable=True))
    op.add_column("mcp_call_logs", sa.Column("attempt", sa.Integer(), server_default="1", nullable=False))
    op.create_foreign_key("fk_mcp_call_logs_ai_run", "mcp_call_logs", "ai_runs", ["ai_run_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_mcp_call_logs_ai_run", "mcp_call_logs", type_="foreignkey")
    for name in ("attempt", "exposed_tool_name", "invocation_id", "provider_call_id", "ai_run_id"):
        op.drop_column("mcp_call_logs", name)
    op.drop_index("ix_ai_run_transcript_run_id", table_name="ai_run_transcript_entries")
    op.drop_table("ai_run_transcript_entries")
    op.drop_index("ix_ai_run_tool_bindings_run_id", table_name="ai_run_tool_bindings")
    op.drop_table("ai_run_tool_bindings")
    op.drop_index("ix_mcp_tool_configs_server_id", table_name="mcp_tool_configs")
    op.drop_table("mcp_tool_configs")
    op.drop_column("ai_runs", "cancel_requested_at")
