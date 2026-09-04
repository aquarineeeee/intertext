from dataclasses import asdict, dataclass

from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError, SQLAlchemyError
from sqlalchemy.orm import Session as DbSession

from app.core.exceptions import AppError
from app.models.book import Book


@dataclass(frozen=True)
class SearchBookResult:
    chunk_id: str
    book_id: str
    chapter_id: str
    chapter_index: int
    chapter_title: str
    text: str
    start_offset: int
    end_offset: int
    score: float | None = None

    def as_dict(self) -> dict:
        return asdict(self)


def search_book(db: DbSession, user_id: str, book_id: str, query: str, chapter_id: str | None = None, limit: int = 6) -> list[SearchBookResult]:
    if len(query) > 2_000:
        raise AppError(422, "search_query_too_long", "检索内容不能超过 2,000 个字符")
    if not query.strip():
        raise AppError(422, "search_query_empty", "检索内容不能为空")
    limit = min(max(limit, 1), 6)
    book = db.scalar(select(Book).where(Book.id == book_id, Book.user_id == user_id))
    if book is None:
        raise AppError(404, "book_not_found", "书籍不存在")
    params = {"book_id": book_id, "user_id": user_id, "query": query, "limit": limit}
    chapter_filter = ""
    if chapter_id is not None:
        chapter_filter = " AND c.id = :chapter_id"
        params["chapter_id"] = chapter_id
    sql = text(
        "SELECT dc.id, dc.book_id, dc.chapter_id, c.chapter_index, c.title, dc.text, "
        "dc.start_offset, dc.end_offset, pgroonga_score(tableoid, ctid) AS score "
        "FROM document_chunks dc JOIN chapters c ON c.id = dc.chapter_id "
        "WHERE dc.book_id = :book_id AND c.book_id = :book_id AND EXISTS "
        "(SELECT 1 FROM books b WHERE b.id = dc.book_id AND b.user_id = :user_id) "
        "AND dc.text &@~ :query" + chapter_filter + " ORDER BY score DESC NULLS LAST LIMIT :limit"
    )
    try:
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            db.execute(text("SET LOCAL statement_timeout = '10s'"))
        rows = db.execute(sql, params).mappings().all()
    except (DBAPIError, SQLAlchemyError) as exc:
        raise AppError(503, "pgroonga_unavailable", "PGroonga 检索不可用，请检查数据库扩展") from exc
    seen: set[str] = set()
    results = []
    for row in rows:
        if row["id"] in seen:
            continue
        seen.add(row["id"])
        results.append(SearchBookResult(str(row["id"]), str(row["book_id"]), str(row["chapter_id"]), int(row["chapter_index"]), str(row["title"]), str(row["text"]), int(row["start_offset"]), int(row["end_offset"]), float(row["score"]) if row["score"] is not None else None))
    return results
