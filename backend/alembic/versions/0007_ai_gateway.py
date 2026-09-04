"""add AI providers, resumable runs and events

Revision ID: 0007_ai_gateway
Revises: 0006_notes_messages
"""
from alembic import op
import sqlalchemy as sa

revision = "0007_ai_gateway"
down_revision = "0006_notes_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PGroonga is a required deployment dependency for search_book.  The
    # explicit CREATE EXTENSION makes a missing installation fail at migration.
    op.execute("CREATE EXTENSION IF NOT EXISTS pgroonga")
    op.create_table(
        "ai_providers",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("provider_type", sa.String(20), nullable=False),
        sa.Column("base_url", sa.String(500), nullable=True),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_ai_providers_user_name"),
        sa.CheckConstraint("provider_type IN ('openai', 'anthropic', 'ollama')", name="ck_ai_providers_type"),
    )
    op.create_index("ix_ai_providers_user_id", "ai_providers", ["user_id"])
    op.create_table(
        "ai_runs",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("conversation_id", sa.String(36), nullable=False),
        sa.Column("user_message_id", sa.String(36), nullable=False),
        sa.Column("assistant_message_id", sa.String(36), nullable=False),
        sa.Column("provider_id", sa.String(36), nullable=True),
        sa.Column("status", sa.String(20), server_default="queued", nullable=False),
        sa.Column("last_sequence", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assistant_message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["provider_id"], ["ai_providers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'partial')", name="ck_ai_runs_status"),
    )
    op.create_index("ix_ai_runs_user_id", "ai_runs", ["user_id"])
    op.create_index("ix_ai_runs_conversation_id", "ai_runs", ["conversation_id"])
    op.create_table(
        "ai_run_events",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("run_id", sa.String(36), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(32), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["ai_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "sequence", name="uq_ai_run_events_run_sequence"),
    )
    op.create_index("ix_ai_run_events_run_id", "ai_run_events", ["run_id"])
    # PGroonga index is deliberately separate from ORM metadata so Base.metadata
    # remains usable in tests and on installations before this migration.
    op.execute("CREATE INDEX ix_document_chunks_pgroonga_text ON document_chunks USING pgroonga (text)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_pgroonga_text")
    op.drop_index("ix_ai_run_events_run_id", table_name="ai_run_events")
    op.drop_table("ai_run_events")
    op.drop_index("ix_ai_runs_conversation_id", table_name="ai_runs")
    op.drop_index("ix_ai_runs_user_id", table_name="ai_runs")
    op.drop_table("ai_runs")
    op.drop_index("ix_ai_providers_user_id", table_name="ai_providers")
    op.drop_table("ai_providers")
