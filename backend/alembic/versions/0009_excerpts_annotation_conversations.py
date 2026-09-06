"""add excerpts and annotation conversations

Revision ID: 0009_excerpts_annotation_conversations
Revises: 0008_mcp
"""
from alembic import op
import sqlalchemy as sa


revision = "0009_excerpts_annotation_conversations"
down_revision = "0008_mcp"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "excerpts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("book_id", sa.String(length=36), nullable=False),
        sa.Column("chapter_id", sa.String(length=36), nullable=False),
        sa.Column("start_offset", sa.Integer(), nullable=False),
        sa.Column("end_offset", sa.Integer(), nullable=False),
        sa.Column("selected_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("start_offset >= 0", name="ck_excerpts_start_offset"),
        sa.CheckConstraint("end_offset > start_offset", name="ck_excerpts_offset_order"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_excerpts_user_book", "excerpts", ["user_id", "book_id"], unique=False)
    op.create_index("ix_excerpts_chapter", "excerpts", ["chapter_id"], unique=False)
    op.add_column("conversations", sa.Column("annotation_id", sa.String(length=36), nullable=True))
    op.create_foreign_key("fk_conversations_annotation_id", "conversations", "annotations", ["annotation_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_conversations_annotation_id", "conversations", ["annotation_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_conversations_annotation_id", table_name="conversations")
    op.drop_constraint("fk_conversations_annotation_id", "conversations", type_="foreignkey")
    op.drop_column("conversations", "annotation_id")
    op.drop_index("ix_excerpts_chapter", table_name="excerpts")
    op.drop_index("ix_excerpts_user_book", table_name="excerpts")
    op.drop_table("excerpts")
