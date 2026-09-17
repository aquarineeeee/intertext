"""Provider-neutral streaming gateway with tool-call normalization."""
import json
from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from app.core.exceptions import AppError


@dataclass
class ProviderEvent:
    kind: str
    text: str | None = None
    thinking: str | None = None
    tool_call_id: str | None = None
    tool_name: str | None = None
    arguments: dict[str, Any] = field(default_factory=dict)
    provider_call_id: str | None = None
    raw: dict[str, Any] | None = None


class AIProvider(Protocol):
    async def stream(self, messages: list[dict[str, Any]], model: str, timeout: float, tools: list[dict[str, Any]] | None = None) -> AsyncIterator[ProviderEvent]: ...


def _base_url(value: str | None, default: str) -> str:
    return (value or default).rstrip("/")


def _json_object(value: str | dict[str, Any] | None) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    try:
        parsed = json.loads(value or "")
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


def _response_output_events(data: Mapping[str, Any]) -> list[ProviderEvent]:
    """Normalize a complete OpenAI Responses API object.

    Responses can expose text either through ``output_text`` or nested message
    content blocks, while function calls are returned as output items.
    """
    response = data.get("response") if isinstance(data.get("response"), Mapping) else data
    output = response.get("output") or []
    events: list[ProviderEvent] = []
    text_found = False
    for item in output:
        if not isinstance(item, Mapping):
            continue
        item_type = item.get("type")
        if item_type == "reasoning":
            for block in item.get("summary") or item.get("content") or []:
                if isinstance(block, Mapping) and (block.get("text") or block.get("summary")):
                    value = str(block.get("text") or block.get("summary"))
                    events.append(ProviderEvent("thinking", text=value, thinking=value, provider_call_id=response.get("id") or data.get("id"), raw=dict(data)))
            continue
        if item_type == "function_call":
            events.append(
                ProviderEvent(
                    "tool_call",
                    tool_call_id=str(item.get("call_id") or item.get("id") or "") or None,
                    tool_name=str(item.get("name") or "") or None,
                    arguments=_json_object(item.get("arguments")),
                    provider_call_id=response.get("id") or data.get("id"),
                    raw=dict(data),
                )
            )
            continue
        if item_type != "message":
            continue
        for block in item.get("content") or []:
            if not isinstance(block, Mapping):
                continue
            block_type = block.get("type")
            if block_type in {"output_text", "text"} and block.get("text"):
                text_found = True
                events.append(ProviderEvent("text", text=str(block["text"]), provider_call_id=response.get("id") or data.get("id"), raw=dict(data)))
    if not text_found and response.get("output_text"):
        events.append(ProviderEvent("text", text=str(response["output_text"]), provider_call_id=response.get("id") or data.get("id"), raw=dict(data)))
    return events


def parse_openai_chunk(data: Mapping[str, Any], tool_buffers: dict[int, dict[str, Any]] | None = None) -> list[ProviderEvent]:
    """Parse one Chat Completions or Responses API SSE chunk.

    Responses API events use names such as ``response.output_text.delta`` and
    ``response.function_call_arguments.delta`` instead of ``choices``.
    """
    buffers = tool_buffers if tool_buffers is not None else {}
    events: list[ProviderEvent] = []
    choices = data.get("choices") or []
    if not choices:
        event_type = data.get("type")
        if event_type == "response.output_text.delta":
            delta = data.get("delta")
            if delta:
                response = data.get("response") or {}
                events.append(ProviderEvent("text", text=str(delta), provider_call_id=response.get("id") or data.get("response_id") or data.get("id"), raw=dict(data)))
            return events
        if event_type in {"response.reasoning_summary_text.delta", "response.reasoning_text.delta"}:
            delta = data.get("delta")
            if delta:
                events.append(ProviderEvent("thinking", text=str(delta), thinking=str(delta), provider_call_id=(data.get("response") or {}).get("id") or data.get("response_id") or data.get("id"), raw=dict(data)))
            return events
        if event_type == "response.output_item.added":
            item = data.get("item") or {}
            if isinstance(item, Mapping) and item.get("type") == "function_call":
                index = int(data.get("output_index", len(buffers)))
                buffers[index] = {
                    "id": str(item.get("id") or ""),
                    "call_id": str(item.get("call_id") or ""),
                    "name": str(item.get("name") or ""),
                    "arguments": str(item.get("arguments") or ""),
                    "emitted": False,
                }
            return events
        if event_type == "response.output_item.done":
            item = data.get("item") or {}
            if isinstance(item, Mapping) and item.get("type") == "function_call":
                index = int(data.get("output_index", len(buffers)))
                buffered = buffers.get(index)
                if buffered is None:
                    buffered = {"id": "", "call_id": "", "name": "", "arguments": "", "emitted": False}
                    buffers[index] = buffered
                buffered["id"] = str(item.get("id") or buffered.get("id") or "")
                buffered["call_id"] = str(item.get("call_id") or buffered.get("call_id") or "")
                buffered["name"] = str(item.get("name") or buffered.get("name") or "")
                buffered["arguments"] = str(item.get("arguments") or buffered.get("arguments") or "")
                if buffered["name"] and not buffered.get("emitted"):
                    buffered["emitted"] = True
                    events.append(ProviderEvent("tool_call", tool_call_id=buffered["call_id"] or buffered["id"] or None, tool_name=buffered["name"], arguments=_json_object(buffered["arguments"]), provider_call_id=data.get("response_id") or data.get("id"), raw=dict(data)))
                buffers.pop(index, None)
            return events
        if event_type in {"response.function_call_arguments.delta", "response.function_call_arguments.done"}:
            index = int(data.get("output_index", 0))
            item = buffers.setdefault(index, {"id": "", "call_id": "", "name": "", "arguments": "", "emitted": False})
            if data.get("item_id"):
                item["id"] = str(data["item_id"])
            if data.get("call_id"):
                item["call_id"] = str(data["call_id"])
            if data.get("name"):
                item["name"] = str(data["name"])
            if event_type.endswith(".delta"):
                item["arguments"] += str(data.get("delta") or "")
                return events
            if data.get("arguments") is not None:
                item["arguments"] = str(data.get("arguments") or "")
            if item["name"] and not item.get("emitted"):
                item["emitted"] = True
                events.append(ProviderEvent("tool_call", tool_call_id=item.get("call_id") or item.get("id") or None, tool_name=item["name"], arguments=_json_object(item["arguments"]), provider_call_id=data.get("response_id") or data.get("id"), raw=dict(data)))
            return events
        # A non-stream Responses API result has ``object: response`` and can
        # be normalized through the same provider-neutral event type.
        if data.get("object") == "response" or (data.get("output") and not event_type):
            return _response_output_events(data)
        return events
    choice = choices[0] or {}
    delta = choice.get("delta") or {}
    message = choice.get("message") or {}
    content = delta.get("content") if delta else message.get("content")
    reasoning = (delta or {}).get("reasoning_content") or (delta or {}).get("reasoning") or (message or {}).get("reasoning_content") or (message or {}).get("reasoning")
    if reasoning:
        events.append(ProviderEvent("thinking", text=str(reasoning), thinking=str(reasoning), provider_call_id=data.get("id"), raw=dict(data)))
    if isinstance(content, list):
        for block in content:
            if isinstance(block, Mapping) and block.get("text"):
                kind = "thinking" if block.get("type") in {"reasoning", "thinking"} else "text"
                events.append(ProviderEvent(kind, text=str(block["text"]), thinking=str(block["text"]) if kind == "thinking" else None, raw=dict(data)))
    elif content:
        events.append(ProviderEvent("text", text=str(content), raw=dict(data)))
    complete_message = bool(message)
    calls = delta.get("tool_calls") if delta else message.get("tool_calls")
    for position, call in enumerate(calls or []):
        index = int(call.get("index", position))
        item = buffers.setdefault(index, {"id": "", "name": "", "arguments": ""})
        item["id"] += str(call.get("id") or "")
        function = call.get("function") or {}
        item["name"] += str(function.get("name") or "")
        item["arguments"] += str(function.get("arguments") or "")
        if complete_message and item["name"]:
            events.append(ProviderEvent("tool_call", tool_call_id=item["id"] or None, tool_name=item["name"], arguments=_json_object(item["arguments"]), provider_call_id=data.get("id"), raw=dict(data)))
    if complete_message:
        buffers.clear()
        return events
    if choice.get("finish_reason") in {"tool_calls", "stop"} and buffers:
        for item in buffers.values():
            if item["name"]:
                events.append(ProviderEvent("tool_call", tool_call_id=item["id"] or None, tool_name=item["name"], arguments=_json_object(item["arguments"]), provider_call_id=data.get("id"), raw=dict(data)))
        buffers.clear()
    return events


def parse_openai_response(data: Mapping[str, Any]) -> list[ProviderEvent]:
    """Parse a complete OpenAI Responses API result."""
    return _response_output_events(data)


def parse_anthropic_event(data: Mapping[str, Any], tool_buffers: dict[int, dict[str, Any]] | None = None) -> list[ProviderEvent]:
    """Parse Anthropic Messages events, including thinking and tool deltas."""
    buffers = tool_buffers if tool_buffers is not None else {}
    events: list[ProviderEvent] = []
    event_type = data.get("type")
    if event_type == "message_start":
        return [ProviderEvent("message_start", provider_call_id=(data.get("message") or {}).get("id"), raw=dict(data))]
    if event_type == "message" and isinstance(data.get("content"), list):
        provider_call_id = data.get("id")
        for block in data["content"]:
            if not isinstance(block, Mapping):
                continue
            block_type = block.get("type")
            if block_type == "thinking" and block.get("thinking"):
                events.append(ProviderEvent("thinking", text=str(block["thinking"]), thinking=str(block["thinking"]), provider_call_id=provider_call_id, raw=dict(data)))
            elif block_type == "text" and block.get("text"):
                events.append(ProviderEvent("text", text=str(block["text"]), provider_call_id=provider_call_id, raw=dict(data)))
            elif block_type == "tool_use":
                events.append(ProviderEvent("tool_call", tool_call_id=str(block.get("id") or "") or None, tool_name=str(block.get("name") or "") or None, arguments=_json_object(block.get("input")), provider_call_id=provider_call_id, raw=dict(data)))
        return events
    if event_type == "content_block_start":
        block = data.get("content_block") or {}
        if block.get("type") == "tool_use":
            initial = block.get("input")
            buffers[int(data.get("index", len(buffers)))] = {"id": block.get("id") or "", "name": block.get("name") or "", "arguments": json.dumps(initial, ensure_ascii=False) if initial else ""}
        elif block.get("type") == "thinking" and block.get("thinking"):
            events.append(ProviderEvent("thinking", text=str(block["thinking"]), thinking=str(block["thinking"]), raw=dict(data)))
    elif event_type == "content_block_delta":
        delta = data.get("delta") or {}
        if delta.get("type") == "text_delta" and delta.get("text"):
            events.append(ProviderEvent("text", text=str(delta["text"]), raw=dict(data)))
        elif delta.get("type") == "thinking_delta" and delta.get("thinking"):
            events.append(ProviderEvent("thinking", text=str(delta["thinking"]), thinking=str(delta["thinking"]), raw=dict(data)))
        elif delta.get("type") == "input_json_delta":
            buffers.setdefault(int(data.get("index", 0)), {"id": "", "name": "", "arguments": ""})["arguments"] += str(delta.get("partial_json") or "")
    elif event_type == "content_block_stop":
        item = buffers.pop(int(data.get("index", 0)), None)
        if item and item["name"]:
            events.append(ProviderEvent("tool_call", tool_call_id=item["id"] or None, tool_name=item["name"], arguments=_json_object(item["arguments"]), raw=dict(data)))
    elif event_type == "message_stop" or (event_type == "message_delta" and (data.get("delta") or {}).get("stop_reason")):
        events.append(ProviderEvent("message_end", raw=dict(data)))
    return events


class OpenAIProvider:
    def __init__(self, api_key: str, base_url: str | None = None):
        self.api_key, self.base_url = api_key, _base_url(base_url, "https://api.openai.com/v1")

    async def stream(self, messages: list[dict[str, Any]], model: str, timeout: float, tools: list[dict[str, Any]] | None = None) -> AsyncIterator[ProviderEvent]:
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        body: dict[str, Any] = {"model": model, "messages": messages, "stream": True}
        if tools:
            body["tools"] = tools
        try:
            buffers: dict[int, dict[str, Any]] = {}
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
                            for event in parse_openai_chunk(json.loads(value), buffers):
                                yield event
                        except (ValueError, TypeError):
                            continue
        except httpx.TimeoutException as exc:
            raise AppError(504, "provider_timeout", "AI Provider 请求超时") from exc
        except httpx.HTTPError as exc:
            raise AppError(502, "provider_unavailable", "AI Provider 暂时不可用") from exc


class AnthropicProvider:
    def __init__(self, api_key: str, base_url: str | None = None):
        self.api_key, self.base_url = api_key, _base_url(base_url, "https://api.anthropic.com/v1")

    async def stream(self, messages: list[dict[str, Any]], model: str, timeout: float, tools: list[dict[str, Any]] | None = None) -> AsyncIterator[ProviderEvent]:
        system = "\n".join(str(m["content"]) for m in messages if m["role"] == "system")
        user_messages: list[dict[str, Any]] = []
        for message in messages:
            if message["role"] == "system":
                continue
            if message["role"] == "assistant" and message.get("tool_calls"):
                blocks: list[dict[str, Any]] = []
                if message.get("content"):
                    blocks.append({"type": "text", "text": str(message["content"])})
                for call in message["tool_calls"]:
                    function = call.get("function") or {}
                    try:
                        arguments = json.loads(function.get("arguments") or "{}")
                    except (TypeError, ValueError):
                        arguments = {}
                    blocks.append({"type": "tool_use", "id": call.get("id"), "name": function.get("name"), "input": arguments})
                user_messages.append({"role": "assistant", "content": blocks})
            elif message["role"] == "tool":
                user_messages.append({"role": "user", "content": [{"type": "tool_result", "tool_use_id": message.get("tool_call_id"), "content": str(message.get("content") or "")}]})
            else:
                user_messages.append({"role": message["role"], "content": message["content"]})
        headers = {"x-api-key": self.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
        body: dict[str, Any] = {"model": model, "max_tokens": 4096, "messages": user_messages, "stream": True}
        if system:
            body["system"] = system
        if tools:
            body["tools"] = [{"name": t["function"]["name"], "description": t["function"].get("description"), "input_schema": t["function"].get("parameters") or {}} for t in tools]
        try:
            buffers: dict[int, dict[str, Any]] = {}
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", f"{self.base_url}/messages", headers=headers, json=body) as response:
                    if response.status_code >= 400:
                        raise AppError(502, "provider_error", "Anthropic Provider 请求失败")
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        try:
                            for event in parse_anthropic_event(json.loads(line[5:].strip()), buffers):
                                yield event
                        except (ValueError, TypeError):
                            continue
        except httpx.TimeoutException as exc:
            raise AppError(504, "provider_timeout", "AI Provider 请求超时") from exc
        except httpx.HTTPError as exc:
            raise AppError(502, "provider_unavailable", "Anthropic Provider 暂时不可用") from exc


class OllamaProvider:
    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key, self.base_url = api_key, _base_url(base_url, "http://localhost:11434/api")

    async def stream(self, messages: list[dict[str, Any]], model: str, timeout: float, tools: list[dict[str, Any]] | None = None) -> AsyncIterator[ProviderEvent]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        body: dict[str, Any] = {"model": model, "messages": messages, "stream": True}
        if tools:
            body["tools"] = tools
        try:
            seen_tool_calls: set[str] = set()
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", f"{self.base_url}/chat", headers=headers, json=body) as response:
                    if response.status_code >= 400:
                        raise AppError(502, "provider_error", "Ollama Provider 请求失败")
                    async for line in response.aiter_lines():
                        try:
                            data = json.loads(line)
                            delta = data.get("message", {}).get("content") or data.get("response")
                            if delta:
                                yield ProviderEvent("text", text=str(delta), raw=data)
                            for index, call in enumerate(data.get("message", {}).get("tool_calls") or []):
                                function = call.get("function") or {}
                                name = str(function.get("name") or "")
                                if not name:
                                    continue
                                call_id = str(call.get("id") or f"ollama-call-{index}")
                                if call_id in seen_tool_calls:
                                    continue
                                seen_tool_calls.add(call_id)
                                yield ProviderEvent(
                                    "tool_call",
                                    tool_call_id=call_id,
                                    tool_name=name,
                                    arguments=_json_object(function.get("arguments")),
                                    raw=data,
                                )
                            if data.get("done"):
                                return
                        except (ValueError, TypeError):
                            continue
        except httpx.TimeoutException as exc:
            raise AppError(504, "provider_timeout", "AI Provider 请求超时") from exc
        except httpx.HTTPError as exc:
            raise AppError(502, "provider_unavailable", "Ollama Provider 暂时不可用") from exc


def provider_for(provider_type: str, api_key: str | None, base_url: str | None, interface_format: str | None = None) -> AIProvider:
    if provider_type == "custom":
        provider_type = interface_format or "openai"
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
