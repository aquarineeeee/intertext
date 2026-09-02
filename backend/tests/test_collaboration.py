import pytest
from pydantic import ValidationError

from app.schemas.collaboration import MessageCreateRequest, NoteCreateRequest


def test_note_content_limit_is_enforced() -> None:
    with pytest.raises(ValidationError):
        NoteCreateRequest(title="摘录", content="x" * 100_001)


def test_message_content_limit_is_enforced() -> None:
    with pytest.raises(ValidationError):
        MessageCreateRequest(content="x" * 20_001)


def test_client_message_id_only_applies_to_user_messages() -> None:
    with pytest.raises(ValidationError):
        MessageCreateRequest(role="assistant", content="answer", client_message_id="client-1")
