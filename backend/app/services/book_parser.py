from __future__ import annotations

import re
import unicodedata
import zipfile
from dataclasses import dataclass
from html.parser import HTMLParser
from io import BytesIO
from pathlib import PurePosixPath
from typing import BinaryIO
from urllib.parse import unquote
from xml.etree import ElementTree

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.models.book import Book
from app.models.document import Annotation, Chapter, DocumentChunk
from app.storage import Storage


@dataclass(frozen=True)
class ParsedChapter:
    title: str
    text: str


def utf16_length(value: str) -> int:
    """Return the JavaScript-style UTF-16 code-unit length of a string."""
    return len(value.encode("utf-16-le")) // 2


def normalize_text(value: str) -> str:
    """Normalize all imported text to LF newlines and stable whitespace."""
    value = unicodedata.normalize("NFC", value.replace("\ufeff", "")).replace("\r\n", "\n").replace("\r", "\n")
    value = "\n".join(re.sub(r"[ \t]+$", "", line) for line in value.split("\n"))
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def _paragraphs(value: str) -> list[str]:
    normalized = normalize_text(value)
    if not normalized:
        return []
    return [part.strip() for part in re.split(r"\n[ \t]*\n", normalized) if part.strip()]


class _XHTMLTextExtractor(HTMLParser):
    _BLOCKS = {"address", "article", "aside", "blockquote", "br", "div", "dl", "dt", "dd", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "ol", "p", "pre", "section", "table", "td", "th", "tr", "ul"}
    _IGNORED = {"script", "style", "svg", "noscript"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.heading: str | None = None
        self._ignored = 0
        self._heading_parts: list[str] = []
        self._heading_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in self._IGNORED:
            self._ignored += 1
        if self._ignored:
            return
        if tag in self._BLOCKS:
            self.parts.append("\n")
        if tag in {"h1", "h2", "h3"}:
            self._heading_depth += 1
            self._heading_parts = []

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in self._IGNORED:
            self._ignored = max(0, self._ignored - 1)
            return
        if self._ignored:
            return
        if tag in {"h1", "h2", "h3"} and self._heading_depth:
            candidate = normalize_text("".join(self._heading_parts))
            if candidate and self.heading is None:
                self.heading = candidate
            self._heading_depth -= 1
        if tag in self._BLOCKS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._ignored:
            return
        self.parts.append(data)
        if self._heading_depth:
            self._heading_parts.append(data)


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _epub_chapters(content: bytes) -> list[ParsedChapter]:
    try:
        archive = zipfile.ZipFile(BytesIO(content))
        with archive:
            container = ElementTree.fromstring(archive.read("META-INF/container.xml"))
            rootfile_path = next((node.attrib.get("full-path") for node in container.iter() if _local_name(node.tag) == "rootfile"), None)
            if not rootfile_path:
                raise ValueError("缺少 EPUB rootfile")
            rootfile = PurePosixPath(rootfile_path)
            opf = ElementTree.fromstring(archive.read(str(rootfile)))
            manifest: dict[str, tuple[str, str]] = {}
            for item in opf.iter():
                if _local_name(item.tag) == "item" and item.attrib.get("id") and item.attrib.get("href"):
                    manifest[item.attrib["id"]] = (item.attrib["href"], item.attrib.get("media-type", ""))
            base = rootfile.parent
            chapters: list[ParsedChapter] = []
            for itemref in opf.iter():
                if _local_name(itemref.tag) != "itemref":
                    continue
                item = manifest.get(itemref.attrib.get("idref", ""))
                if not item or item[1] not in {"application/xhtml+xml", "text/html", "application/x-dtbook+xml"}:
                    continue
                href = PurePosixPath(unquote(item[0].split("#", 1)[0]))
                target = base / href
                if target.is_absolute() or ".." in target.parts or str(target) not in archive.namelist():
                    raise ValueError("EPUB 章节路径无效")
                parser = _XHTMLTextExtractor()
                parser.feed(archive.read(str(target)).decode("utf-8"))
                paragraphs = _paragraphs("".join(parser.parts))
                if paragraphs:
                    chapters.append(ParsedChapter(parser.heading or f"第 {len(chapters) + 1} 章", "\n\n".join(paragraphs)))
            if not chapters:
                raise ValueError("EPUB 未找到可读取的章节")
            return chapters
    except (KeyError, UnicodeDecodeError, ValueError, ElementTree.ParseError, zipfile.BadZipFile) as exc:
        raise AppError(422, "parse_failed", "EPUB 内容解析失败") from exc


def parse_content(source: BinaryIO, file_format: str, title: str) -> list[ParsedChapter]:
    content = source.read()
    if file_format == "txt":
        try:
            paragraphs = _paragraphs(content.decode("utf-8-sig"))
        except UnicodeDecodeError as exc:
            raise AppError(422, "parse_failed", "TXT 文件必须使用 UTF-8 编码") from exc
        if not paragraphs:
            raise AppError(422, "parse_failed", "文件没有可读取的正文")
        return [ParsedChapter(title, "\n\n".join(paragraphs))]
    if file_format == "epub":
        return _epub_chapters(content)
    raise AppError(422, "parse_failed", "不支持的解析格式")


def save_parsed_book(db: Session, book: Book, chapters: list[ParsedChapter]) -> None:
    db.execute(delete(Chapter).where(Chapter.book_id == book.id))
    db.execute(delete(DocumentChunk).where(DocumentChunk.book_id == book.id))
    db.flush()
    for chapter_index, parsed in enumerate(chapters):
        chapter = Chapter(book_id=book.id, chapter_index=chapter_index, title=parsed.title, text=parsed.text, text_length=utf16_length(parsed.text))
        db.add(chapter)
        db.flush()
        cursor = 0
        for chunk_index, paragraph in enumerate(_paragraphs(parsed.text)):
            start = utf16_length(parsed.text[:cursor])
            end = start + utf16_length(paragraph)
            db.add(DocumentChunk(book_id=book.id, chapter_id=chapter.id, chunk_index=chunk_index, text=paragraph, start_offset=start, end_offset=end))
            cursor += len(paragraph)
            if cursor < len(parsed.text) and parsed.text[cursor:cursor + 2] == "\n\n":
                cursor += 2


def parse_book(db: Session, book_id: str, storage: Storage) -> Book:
    book = db.scalar(select(Book).where(Book.id == book_id))
    if book is None:
        raise AppError(404, "book_not_found", "书籍不存在")
    if db.scalar(select(func.count(Annotation.id)).where(Annotation.book_id == book.id)):
        raise AppError(409, "reparse_blocked", "书籍已有批注，不能重新解析")
    imported = book.import_file
    if imported is None:
        raise AppError(422, "parse_failed", "书籍缺少原始文件")

    # Persist this marker before doing I/O so an interrupted worker can be recovered.
    db.rollback()
    book.status = "parsing"
    book.parse_error = None
    db.commit()
    try:
        with storage.open_file(imported.storage_key) as source:
            parsed = parse_content(source, imported.file_format, book.title)
        db.refresh(book)
        save_parsed_book(db, book, parsed)
        book.status = "ready"
        book.parse_error = None
        db.commit()
    except Exception as exc:
        db.rollback()
        failed = db.scalar(select(Book).where(Book.id == book_id))
        if failed is not None:
            failed.status = "failed"
            error_text = f"{exc.code}: {exc.message}" if isinstance(exc, AppError) else str(exc)
            failed.parse_error = (error_text or "解析失败")[:4000]
            db.commit()
        if isinstance(exc, AppError):
            return failed or book
        return failed or book
    db.refresh(book)
    return book


def recover_parsing_books(db: Session) -> int:
    """Move interrupted parses back to uploaded so they can be retried safely."""
    books = list(db.scalars(select(Book).where(Book.status == "parsing")).all())
    for book in books:
        book.status = "uploaded"
        book.parse_error = "解析任务中断，等待重试"
    if books:
        db.commit()
    return len(books)
