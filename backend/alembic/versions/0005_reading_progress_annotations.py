"""add reading progress and annotations

Revision ID: 0005_reading_annotations
Revises: 0004_document_content
"""
from alembic import op
import sqlalchemy as sa


revision = "0005_reading_annotations"
down_revision = "0004_document_content"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reading_progress",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("book_id", sa.String(length=36), nullable=False),
        sa.Column("chapter_id", sa.String(length=36), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "book_id", name="uq_reading_progress_user_book"),
    )
    op.create_index("ix_reading_progress_user_id", "reading_progress", ["user_id"], unique=False)
    op.create_index("ix_reading_progress_book_id", "reading_progress", ["book_id"], unique=False)
    op.create_table(
        "annotations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("book_id", sa.String(length=36), nullable=False),
        sa.Column("chapter_id", sa.String(length=36), nullable=False),
        sa.Column("start_offset", sa.Integer(), nullable=False),
        sa.Column("end_offset", sa.Integer(), nullable=False),
        sa.Column("selected_text", sa.Text(), nullable=False),
        sa.Column("note_content", sa.Text(), nullable=True),
        sa.Column("color", sa.String(length=32), nullable=False, server_default="yellow"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("location_error", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("start_offset >= 0", name="ck_annotations_start_offset"),
        sa.CheckConstraint("end_offset > start_offset", name="ck_annotations_offset_order"),
        sa.CheckConstraint("status IN ('active', 'orphaned')", name="ck_annotations_status"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_annotations_user_book", "annotations", ["user_id", "book_id"], unique=False)
    op.create_index("ix_annotations_chapter", "annotations", ["chapter_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_annotations_chapter", table_name="annotations")
    op.drop_index("ix_annotations_user_book", table_name="annotations")
    op.drop_table("annotations")
    op.drop_index("ix_reading_progress_book_id", table_name="reading_progress")
    op.drop_index("ix_reading_progress_user_id", table_name="reading_progress")
    op.drop_table("reading_progress")
