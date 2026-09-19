from types import SimpleNamespace

from app.services.context import ContextBuilder
from app.services.search import SearchBookResult


class ScalarResults:
    def __init__(self, values: list[object]):
        self.values = values

    def all(self) -> list[object]:
        return self.values

    def __iter__(self):
        return iter(self.values)


class ContextDb:
    def __init__(self, prompt: str, annotation: object | None = None, selected_chunks: list[object] | None = None):
        self.book = SimpleNamespace(id="book-1", title="A Book", user_id="user-1")
        self.conversation = SimpleNamespace(id="conversation-1", book_id="book-1", user_id="user-1", annotation=annotation)
        self.user = SimpleNamespace(companion_style="custom", companion_prompt=prompt)
        self.scalar_values = [self.book, self.conversation]
        self.scalars_values = [[self.book]]
        if annotation is not None:
            self.scalars_values.append(selected_chunks or [])
        self.scalars_values.extend([[], [], [], []])

    def scalar(self, _query):
        return self.scalar_values.pop(0)

    def scalars(self, _query):
        return ScalarResults(self.scalars_values.pop(0))

    def get(self, _model, _id):
        return self.user


def test_custom_companion_prompt_is_added_to_system_context() -> None:
    custom_prompt = "Respond as a careful literary critic."
    context = ContextBuilder(ContextDb(custom_prompt), "user-1").build_context("book-1", "conversation-1")

    assert context.messages[0]["role"] == "system"
    assert f"阅读风格要求:\n{custom_prompt}" in context.messages[0]["content"]


def test_search_results_are_added_to_system_context() -> None:
    result = SearchBookResult(
        chunk_id="chunk-1",
        book_id="book-1",
        chapter_id="chapter-1",
        chapter_index=0,
        chapter_title="Chapter 1",
        text="Relevant book paragraph.",
        start_offset=0,
        end_offset=24,
    )

    context = ContextBuilder(ContextDb("Be helpful."), "user-1").build_context(
        "book-1", "conversation-1", search_results=[result]
    )

    content = "\n".join(message["content"] for message in context.messages)
    assert '<book_content chunk_id=chunk-1 chapter_id=chapter-1>' in content
    assert "Relevant book paragraph." in content


def test_all_paragraphs_overlapping_a_selection_are_added_to_context() -> None:
    annotation = SimpleNamespace(
        selected_text="selection spanning paragraphs",
        chapter_id="chapter-1",
        start_offset=5,
        end_offset=45,
    )
    chunks = [
        SimpleNamespace(chunk_index=2, text="The first complete paragraph."),
        SimpleNamespace(chunk_index=3, text="The second complete paragraph."),
    ]

    context = ContextBuilder(ContextDb("Be helpful.", annotation, chunks), "user-1").build_context(
        "book-1", "conversation-1"
    )

    content = "\n".join(message["content"] for message in context.messages)
    assert "<selected_text_paragraphs>" in content
    assert "The first complete paragraph." in content
    assert "The second complete paragraph." in content
