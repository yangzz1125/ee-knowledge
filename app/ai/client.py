"""通过 OpenAI Responses 协议调用 DeepSeek。"""

from __future__ import annotations

import json
import os
from collections.abc import Iterator
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from ..domain.results import RetrievalContext

_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(_ENV_FILE, override=False)

_SYSTEM_INSTRUCTIONS = """你是电磁场与波课程助教。
只能根据本轮提供的知识库上下文回答，不要补充上下文中没有的事实。
历史对话只用于理解指代和保持连贯，事实依据始终以本轮知识库上下文为准。
回答应准确、简洁。提到知识库中的知识点时，用「」括起它的名称，例如「高斯定律」，方便核对依据。
公式使用 LaTeX：行内公式必须放在单个 $ 之间，独立公式必须放在成对的 $$ 之间。
如果上下文不足以支持结论，请明确说明信息不足，不要猜测。
"""


class AIUnavailable(Exception):
    """缺少模型服务配置，图谱查询功能仍可正常使用。"""


def _settings() -> tuple[str, str, str]:
    """读取并检查 DeepSeek 配置，不记录或返回到 HTTP 响应。"""
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    base_url = os.getenv("DEEPSEEK_BASE_URL", "").strip()
    model = os.getenv("DEEPSEEK_MODEL", "").strip()
    missing = [
        name
        for name, value in (
            ("DEEPSEEK_API_KEY", api_key),
            ("DEEPSEEK_BASE_URL", base_url),
            ("DEEPSEEK_MODEL", model),
        )
        if not value or value == "your_api_key_here"
    ]
    if missing:
        raise AIUnavailable(f"缺少 AI 配置：{'、'.join(missing)}")
    return api_key, base_url, model


def ensure_configured() -> None:
    """在开始流式 HTTP 响应前检查配置，以便仍能返回 503。"""
    _settings()


def _model_input(question: str, context: RetrievalContext) -> list[dict[str, str]]:
    """按时间顺序组合历史消息，并在当前问题中附上本轮知识上下文。"""
    messages: list[dict[str, str]] = []
    for turn in context.history:
        messages.append({"role": "user", "content": turn.question})
        messages.append({"role": "assistant", "content": turn.answer})

    knowledge = json.dumps(
        {
            "entities": [entity.model_dump(mode="json") for entity in context.entities],
            "relations": [
                relation.model_dump(mode="json") for relation in context.relations
            ],
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    messages.append(
        {
            "role": "user",
            "content": f"用户当前问题：\n{question}\n\n本轮知识库上下文：\n{knowledge}",
        }
    )
    return messages


def stream_model(
    question: str,
    context: RetrievalContext,
) -> Iterator[str]:
    """逐段产出 DeepSeek Responses API 返回的文本。"""
    api_key, base_url, model = _settings()
    client = OpenAI(api_key=api_key, base_url=base_url, timeout=60.0)
    emitted = False

    with client.responses.create(
        model=model,
        instructions=_SYSTEM_INSTRUCTIONS,
        input=_model_input(question, context),
        stream=True,
    ) as stream:
        for event in stream:
            event_type = getattr(event, "type", "")
            if event_type == "response.output_text.delta":
                delta = getattr(event, "delta", "")
                if delta:
                    emitted = True
                    yield delta
            elif event_type in {"response.failed", "response.incomplete"}:
                raise RuntimeError("模型未能完整生成回答")

    if not emitted:
        raise RuntimeError("模型返回了空回答")


def call_model(question: str, context: RetrievalContext) -> str:
    """收集流式片段，供原有非流式接口复用。"""
    answer = "".join(stream_model(question, context)).strip()
    if not answer:
        raise RuntimeError("模型返回了空回答")
    return answer
