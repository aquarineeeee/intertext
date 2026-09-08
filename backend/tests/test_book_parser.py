import io
import zipfile

import pytest

from app.core.exceptions import AppError
from app.services.book_parser import normalize_text, parse_book_content, parse_content, utf16_length


def test_normalize_text_uses_lf_and_collapses_excess_blank_lines() -> None:
    assert normalize_text("\ufeff a  \r\n\r\n\r\n b\r") == "a\n\n b"


def test_txt_parsing_and_utf16_offsets() -> None:
    chapters = parse_content(io.BytesIO("A😀\r\n\r\nB".encode("utf-8")), "txt", "Book")
    assert chapters[0].text == "A😀\n\nB"
    assert utf16_length(chapters[0].text) == 6


def test_txt_requires_utf8() -> None:
    with pytest.raises(AppError) as error:
        parse_content(io.BytesIO(b"\xff\xfe"), "txt", "Book")
    assert error.value.code == "parse_failed"


def test_epub_parses_metadata_and_document_spine() -> None:
    content = io.BytesIO()
    with zipfile.ZipFile(content, "w") as archive:
        archive.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        archive.writestr("META-INF/container.xml", '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        archive.writestr("OEBPS/content.opf", '<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">book</dc:identifier><dc:title>正式书名</dc:title><dc:creator>作者</dc:creator><dc:description>书籍简介</dc:description></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>')
        archive.writestr("OEBPS/chapter.xhtml", "<html><body><h1>第一章</h1><p>第一段</p><p>第二段</p></body></html>")
    parsed = parse_book_content(io.BytesIO(content.getvalue()), "epub", "文件名")
    assert parsed.title == "正式书名"
    assert parsed.author == "作者"
    assert parsed.description == "书籍简介"
    assert parsed.chapters[0].title == "第一章"
    assert parsed.chapters[0].text == "第一章\n\n第一段\n\n第二段"
