"""store EPUB book metadata

Revision ID: 0010_book_metadata
Revises: 0009_excerpts
"""
from alembic import op
import sqlalchemy as sa


revision = "0010_book_metadata"
down_revision = "0009_excerpts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("books", sa.Column("author", sa.String(length=500), nullable=True))
    op.add_column("books", sa.Column("description", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("books", "description")
    op.drop_column("books", "author")
