from app.db.base import Base
from app import models  # noqa: F401  (register all model metadata)


def test_user_and_book_children_have_database_cascade() -> None:
    tables = Base.metadata.tables
    for table_name in ("sessions", "books", "import_files", "chapters", "document_chunks", "reading_progress", "annotations", "notes", "conversations", "messages", "ai_providers", "ai_runs", "mcp_servers", "mcp_call_logs"):
        table = tables[table_name]
        foreign_keys = {foreign_key.target_fullname: foreign_key.ondelete for foreign_key in table.foreign_keys}
        if "users.id" in foreign_keys:
            assert foreign_keys["users.id"] == "CASCADE", table_name
        if "books.id" in foreign_keys:
            assert foreign_keys["books.id"] == "CASCADE", table_name
