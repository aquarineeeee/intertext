import pytest
from pydantic import ValidationError

from app.api.routes.reading import _python_index_for_utf16
from app.schemas.reading import ExcerptCreateRequest
from app.services.book_parser import utf16_length


def test_utf16_selection_boundaries_handle_non_bmp_characters() -> None:
    value = "A😀B"
    assert utf16_length(value) == 4
    assert _python_index_for_utf16(value, 0) == 0
    assert _python_index_for_utf16(value, 1) == 1
    assert _python_index_for_utf16(value, 3) == 2
    assert _python_index_for_utf16(value, 4) == 3
    assert _python_index_for_utf16(value, 2) is None


def test_utf16_selection_boundary_rejects_out_of_range_offsets() -> None:
    assert _python_index_for_utf16("正文", -1) is None
    assert _python_index_for_utf16("正文", 3) is None


def test_excerpt_requires_selected_text() -> None:
    with pytest.raises(ValidationError):
        ExcerptCreateRequest(chapter_id="chapter-1", start_offset=0, end_offset=1, selected_text="")
