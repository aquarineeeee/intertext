"""add books and imported files

Revision ID: 0002_books_import_files
Revises: 0001_initial
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_books_import_files"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "books",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="uploaded", nullable=False),
        sa.Column("parse_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_books_user_id", "books", ["user_id"], unique=False)
    op.create_table(
        "import_files",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("book_id", sa.String(length=36), nullable=False),
        sa.Column("file_name", sa.String(length=500), nullable=False),
        sa.Column("file_format", sa.String(length=10), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("file_hash", sa.String(length=64), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key"),
        sa.UniqueConstraint("user_id", "file_hash", name="uq_import_files_user_hash"),
    )
    op.create_index("ix_import_files_user_id", "import_files", ["user_id"], unique=False)
    op.create_index("ix_import_files_book_id", "import_files", ["book_id"], unique=False)
    op.create_index("ix_import_files_file_hash", "import_files", ["file_hash"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_import_files_file_hash", table_name="import_files")
    op.drop_index("ix_import_files_book_id", table_name="import_files")
    op.drop_index("ix_import_files_user_id", table_name="import_files")
    op.drop_table("import_files")
    op.drop_index("ix_books_user_id", table_name="books")
    op.drop_table("books")
