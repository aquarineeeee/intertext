"""allow notes without a book

Revision ID: 0019_optional_note_book
Revises: 0018_library_query_indexes
"""
from alembic import op


revision = "0019_optional_note_book"
down_revision = "0018_library_query_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("notes_book_id_fkey", "notes", type_="foreignkey")
    op.alter_column("notes", "book_id", nullable=True)
    op.create_foreign_key("notes_book_id_fkey", "notes", "books", ["book_id"], ["id"], ondelete="CASCADE")


def downgrade() -> None:
    op.execute("DELETE FROM notes WHERE book_id IS NULL")
    op.drop_constraint("notes_book_id_fkey", "notes", type_="foreignkey")
    op.create_foreign_key("notes_book_id_fkey", "notes", "books", ["book_id"], ["id"], ondelete="CASCADE")
    op.alter_column("notes", "book_id", nullable=False)
