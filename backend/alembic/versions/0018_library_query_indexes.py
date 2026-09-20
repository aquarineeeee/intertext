"""add indexes for library timeline queries

Revision ID: 0018_library_query_indexes
Revises: 0017_active_ai_provider
"""
from alembic import op


revision = "0018_library_query_indexes"
down_revision = "0017_active_ai_provider"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_annotations_user_created_id", "annotations", ["user_id", "created_at", "id"], unique=False)
    op.create_index("ix_excerpts_user_created_id", "excerpts", ["user_id", "created_at", "id"], unique=False)
    op.create_index("ix_notes_user_updated_id", "notes", ["user_id", "updated_at", "id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_notes_user_updated_id", table_name="notes")
    op.drop_index("ix_excerpts_user_created_id", table_name="excerpts")
    op.drop_index("ix_annotations_user_created_id", table_name="annotations")
