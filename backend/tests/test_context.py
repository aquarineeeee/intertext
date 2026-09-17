from types import SimpleNamespace

from app.services.context import ContextBuilder


class ScalarResults:
    def __init__(self, values: list[object]):
        self.values = values

    def all(self) -> list[object]:
        return self.values

    def __iter__(self):
        return iter(self.values)


class ContextDb:
    def __init__(self, prompt: str):
        self.book = SimpleNamespace(id="book-1", title="A Book", user_id="user-1")
        self.conversation = SimpleNamespace(id="conversation-1", book_id="book-1", user_id="user-1", annotation=None)
        self.user = SimpleNamespace(companion_style="custom", companion_prompt=prompt)
        self.scalar_values = [self.book, self.conversation]
        self.scalars_values = [[self.book], [], [], [], []]

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
