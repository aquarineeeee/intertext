import io

import pytest

from app.core.exceptions import AppError
from app.services.book_parser import normalize_text, parse_content, utf16_length


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
