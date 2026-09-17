from types import SimpleNamespace

import pytest

from app.api.routes.auth import update_settings, user_settings_response
from app.core.exceptions import AppError
from app.schemas.auth import UserSettingsUpdate
from app.services.companion import DEFAULT_COMPANION_PROMPTS


class CommitTracker:
    committed = False

    def commit(self) -> None:
        self.committed = True


def test_custom_prompt_is_saved_and_retained_while_using_a_preset() -> None:
    user = SimpleNamespace(companion_style=None, companion_prompt=None)
    db = CommitTracker()

    saved = update_settings(UserSettingsUpdate(style="custom", prompt="  Reply like a poet.  "), db, user)
    assert saved == {"style": "custom", "prompt": "Reply like a poet."}
    assert db.committed

    preset = update_settings(UserSettingsUpdate(style="guided"), db, user)
    assert preset == {"style": "guided", "prompt": "Reply like a poet."}
    assert user.companion_prompt == "Reply like a poet."


def test_empty_custom_prompt_is_rejected() -> None:
    user = SimpleNamespace(companion_style="discussion", companion_prompt=None)

    with pytest.raises(AppError):
        update_settings(UserSettingsUpdate(style="custom", prompt="   "), CommitTracker(), user)


def test_legacy_preset_prompt_is_not_returned_as_a_custom_draft() -> None:
    user = SimpleNamespace(companion_style="discussion", companion_prompt=DEFAULT_COMPANION_PROMPTS["discussion"])

    assert user_settings_response(user) == {"style": "discussion", "prompt": ""}
