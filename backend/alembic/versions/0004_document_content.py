"""add parsed chapters and document chunks

Revision ID: 0004_document_content
Revises: 0003_book_status_check
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_document_content"
down_revision = "0003_book_status_check"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chapters",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("book_id", sa.String(length=36), nullable=False),
        sa.Column("chapter_index", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("text_length", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("book_id", "chapter_index", name="uq_chapters_book_index"),
    )
    op.create_index("ix_chapters_book_id", "chapters", ["book_id"], unique=False)
    op.create_table(
        "document_chunks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("book_id", sa.String(length=36), nullable=False),
        sa.Column("chapter_id", sa.String(length=36), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("start_offset", sa.Integer(), nullable=False),
        sa.Column("end_offset", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chapter_id", "chunk_index", name="uq_document_chunks_chapter_index"),
    )
    op.create_index("ix_document_chunks_chapter_id", "document_chunks", ["chapter_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_document_chunks_chapter_id", table_name="document_chunks")
    op.drop_table("document_chunks")
    op.drop_index("ix_chapters_book_id", table_name="chapters")
    op.drop_table("chapters")
