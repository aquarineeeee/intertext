"""Provider-neutral streaming gateway.

The gateway yields text deltas only; persistence and SSE framing live in the
run service, which keeps provider failures recoverable and testable.
"""
import json
from collections.abc import AsyncIterator, Mapping
from typing import Protocol

import httpx

from app.core.exceptions import AppError


class AIProvider(Protocol):
    async def stream(self, messages: list[dict[str, str]], model: str, timeout: float) -> AsyncIterator[str]: ...


def _base_url(value: str | None, default: str) -> str:
    return (value or default).rstrip("/")


class OpenAIProvider:
    def __init__(self, api_key: str, base_url: str | None = None):
        self.api_key = api_key
        self.base_url = _base_url(base_url, "https://api.openai.com/v1")

    async def stream(self, messages: list[dict[str, str]], model: str, timeout: float) -> AsyncIterator[str]:
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        body = {"model": model, "messages": messages, "stream": True}
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", f"{self.base_url}/chat/completions", headers=headers, json=body) as response:
                    if response.status_code >= 400:
                        raise AppError(502, "provider_error", "OpenAI Provider 请求失败")
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        value = line[5:].strip()
                        if value == "[DONE]":
                            return
                        try:
                            data = json.loads(value)
                            delta = data["choices"][0].get("delta", {}).get("content")
                            if delta:
                                yield delta
                        except (ValueError, KeyError, IndexError, TypeError):
                            continue
        except httpx.TimeoutException as exc:
            raise AppError(504, "provider_timeout", "AI Provider 请求超时") from exc
        except httpx.HTTPError as exc:
            raise AppError(502, "provider_unavailable", "AI Provider 暂时不可用") from exc


class AnthropicProvider:
    def __init__(self, api_key: str, base_url: str | None = None):
        self.api_key = api_key
        self.base_url = _base_url(base_url, "https://api.anthropic.com/v1")

    async def stream(self, messages: list[dict[str, str]], model: str, timeout: float) -> AsyncIterator[str]:
        system = "\n".join(m["content"] for m in messages if m["role"] == "system")
        user_messages = [{"role": m["role"], "content": m["content"]} for m in messages if m["role"] != "system"]
        headers = {"x-api-key": self.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
        body = {"model": model, "max_tokens": 4096, "messages": user_messages, "stream": True}
        if system:
            body["system"] = system
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", f"{self.base_url}/messages", headers=headers, json=body) as response:
                    if response.status_code >= 400:
                        raise AppError(502, "provider_error", "Anthropic Provider 请求失败")
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        try:
                            data = json.loads(line[5:].strip())
                            if data.get("type") == "content_block_delta":
                                delta = data.get("delta", {}).get("text")
                                if delta:
                                    yield delta
                        except (ValueError, TypeError):
                            continue
        except httpx.TimeoutException as exc:
            raise AppError(504, "provider_timeout", "AI Provider 请求超时") from exc
        except httpx.HTTPError as exc:
            raise AppError(502, "provider_unavailable", "AI Provider 暂时不可用") from exc


class OllamaProvider:
    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key = api_key
        self.base_url = _base_url(base_url, "http://localhost:11434/api")

    async def stream(self, messages: list[dict[str, str]], model: str, timeout: float) -> AsyncIterator[str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        body = {"model": model, "messages": messages, "stream": True}
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", f"{self.base_url}/chat", headers=headers, json=body) as response:
                    if response.status_code >= 400:
                        raise AppError(502, "provider_error", "Ollama Provider 请求失败")
                    async for line in response.aiter_lines():
                        try:
                            data = json.loads(line)
                            delta = data.get("message", {}).get("content") or data.get("response")
                            if delta:
                                yield delta
                            if data.get("done"):
                                return
                        except (ValueError, TypeError):
                            continue
        except httpx.TimeoutException as exc:
            raise AppError(504, "provider_timeout", "AI Provider 请求超时") from exc
        except httpx.HTTPError as exc:
            raise AppError(502, "provider_unavailable", "AI Provider 暂时不可用") from exc


def provider_for(provider_type: str, api_key: str | None, base_url: str | None) -> AIProvider:
    if provider_type == "openai":
        if not api_key:
            raise AppError(422, "provider_key_missing", "OpenAI Provider 尚未配置 API Key")
        return OpenAIProvider(api_key, base_url)
    if provider_type == "anthropic":
        if not api_key:
            raise AppError(422, "provider_key_missing", "Anthropic Provider 尚未配置 API Key")
        return AnthropicProvider(api_key, base_url)
    if provider_type == "ollama":
        return OllamaProvider(api_key, base_url)
    raise AppError(422, "provider_type_invalid", "不支持的 AI Provider 类型")
