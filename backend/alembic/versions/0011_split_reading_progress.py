"""split last-read location from furthest reading progress

Revision ID: 0011_split_reading_progress
Revises: 0010_book_metadata
"""
from alembic import op
import sqlalchemy as sa


revision = "0011_split_reading_progress"
down_revision = "0010_book_metadata"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("reading_progress", "chapter_id", new_column_name="last_read_chapter_id")
    op.add_column("reading_progress", sa.Column("furthest_read_chapter_id", sa.String(length=36), nullable=True))
    op.create_foreign_key(
        "fk_reading_progress_furthest_read_chapter_id",
        "reading_progress",
        "chapters",
        ["furthest_read_chapter_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.execute(
        "UPDATE reading_progress "
        "SET furthest_read_chapter_id = last_read_chapter_id "
        "WHERE furthest_read_chapter_id IS NULL"
    )


def downgrade() -> None:
    op.drop_constraint("fk_reading_progress_furthest_read_chapter_id", "reading_progress", type_="foreignkey")
    op.drop_column("reading_progress", "furthest_read_chapter_id")
    op.alter_column("reading_progress", "last_read_chapter_id", new_column_name="chapter_id")
