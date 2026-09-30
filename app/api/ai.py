"""知识检索增强的普通与流式 AI 问答接口。"""

from __future__ import annotations

import json
from collections.abc import Iterator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ..ai import AIUnavailable, call_model, ensure_configured, stream_model
from ..dependencies import graph
from ..domain.api import AIAnswerResponse, AIQuestionRequest
from ..domain.results import RetrievalContext
from ..knowledge import build_retrieval_context

router = APIRouter(prefix="/api/ai", tags=["AI 问答"])

_INSUFFICIENT_ANSWER = "当前知识库中没有足够内容回答这个问题。"
_INSUFFICIENT_MESSAGE = "检索没有命中任何知识点，可以换一种说法，或直接浏览知识图谱。"


def _retrieve(request: AIQuestionRequest) -> tuple[RetrievalContext, bool]:
    """校验历史引用，并为当前请求重建知识上下文。"""
    for turn_index, turn in enumerate(request.history):
        for entity_id in turn.used_entity_ids:
            if entity_id not in graph.by_id:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "code": "invalid_parameter",
                        "message": f"历史引用了不存在的知识点：{entity_id}",
                        "field": f"history.{turn_index}.used_entity_ids",
                    },
                )
    return build_retrieval_context(
        graph,
        request.question.strip(),
        request.context_entity_id,
        request.history,
    )


def _references(context: RetrievalContext) -> tuple[list[str], str | None]:
    """过滤不存在的引用 ID，并返回需要展示的提示。"""
    used = [i for i in context.matched_entity_ids if i in graph.by_id]
    unknown = [i for i in context.matched_entity_ids if i not in graph.by_id]
    message = f"忽略了不存在的知识点：{'、'.join(unknown)}" if unknown else None
    return used, message


def _ai_error(exc: Exception) -> tuple[int, str, str]:
    """把模型调用异常转换为 (HTTP 状态码, 错误码, 提示)。"""
    if isinstance(exc, AIUnavailable):
        return 503, "ai_unavailable", str(exc)
    return 502, "ai_failed", f"AI 服务调用失败：{exc}"


@router.post("/ask", response_model=AIAnswerResponse)
def ask(request: AIQuestionRequest) -> AIAnswerResponse:
    """重新检索知识库，并返回一次性完整回答。"""
    context, insufficient = _retrieve(request)
    if insufficient:
        return AIAnswerResponse(
            answer=_INSUFFICIENT_ANSWER,
            used_entity_ids=[],
            insufficient_knowledge=True,
            message=context.retrieval_message or _INSUFFICIENT_MESSAGE,
        )

    try:
        answer = call_model(context.question, context)
    except Exception as exc:
        status, code, message = _ai_error(exc)
        raise HTTPException(
            status_code=status,
            detail={"code": code, "message": message, "field": None},
        ) from None

    used, message = _references(context)
    if not used:
        return AIAnswerResponse(
            answer=answer,
            used_entity_ids=[],
            insufficient_knowledge=True,
            message="回答没有引用任何知识点，请谨慎参考。",
        )
    return AIAnswerResponse(
        answer=answer,
        used_entity_ids=used,
        insufficient_knowledge=False,
        message=message,
    )


def _sse(event: str, data: dict[str, object]) -> str:
    """将一个事件编码为标准 SSE 文本块。"""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _stream_events(context: RetrievalContext, insufficient: bool) -> Iterator[str]:
    """依次产生 metadata、delta、done 或 error 事件。"""
    if insufficient:
        message = context.retrieval_message or _INSUFFICIENT_MESSAGE
        yield _sse(
            "metadata",
            {"used_entity_ids": [], "insufficient_knowledge": True},
        )
        yield _sse("delta", {"text": _INSUFFICIENT_ANSWER})
        yield _sse("done", {"message": message})
        return

    used, message = _references(context)
    yield _sse(
        "metadata",
        {"used_entity_ids": used, "insufficient_knowledge": not bool(used)},
    )
    try:
        for text in stream_model(context.question, context):
            yield _sse("delta", {"text": text})
    except Exception as exc:
        _, code, error_message = _ai_error(exc)
        yield _sse("error", {"code": code, "message": error_message})
        return
    yield _sse("done", {"message": message})


@router.post("/ask/stream")
def ask_stream(request: AIQuestionRequest) -> StreamingResponse:
    """通过 SSE 流式返回回答；前端应使用 fetch 读取响应流。"""
    context, insufficient = _retrieve(request)
    if not insufficient:
        try:
            ensure_configured()
        except AIUnavailable as exc:
            status, code, message = _ai_error(exc)
            raise HTTPException(
                status_code=status,
                detail={"code": code, "message": message, "field": None},
            ) from None

    return StreamingResponse(
        _stream_events(context, insufficient),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
