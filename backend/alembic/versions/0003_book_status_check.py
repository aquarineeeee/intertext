"""constrain book status values

Revision ID: 0003_book_status_check
Revises: 0002_books_import_files
"""
from alembic import op

revision = "0003_book_status_check"
down_revision = "0002_books_import_files"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_books_status",
        "books",
        "status IN ('uploaded', 'parsing', 'ready', 'failed')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_books_status", "books", type_="check")
