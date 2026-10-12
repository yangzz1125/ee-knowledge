"""统计回答里实际引用了哪些知识点。

检索命中的知识点只是「交给模型的材料」，模型不一定都用。这里在回答生成后，
看检索上下文中哪些知识点的名称或别名真的出现在回答文字里，才算「引用」。
"""

from __future__ import annotations

import unicodedata

from ..domain.results import RetrievalContext

#: 过短的别名（单个字）容易在普通句子里误撞，不参与匹配。
_MIN_NAME_LENGTH = 2


def _normalize(text: str) -> str:
    return unicodedata.normalize("NFKC", text).casefold()


def cited_entity_ids(answer: str, context: RetrievalContext) -> list[str]:
    """返回回答中出现过名称或别名的知识点 ID，按在回答中第一次出现的位置排序。

    长名称优先占位：回答写「散度定理」时只算「散度定理」，不再顺带算上「散度」。
    """
    text = _normalize(answer)
    names = sorted(
        (
            (_normalize(name), entity.id)
            for entity in context.entities
            for name in (entity.name, *entity.aliases)
            if len(name) >= _MIN_NAME_LENGTH
        ),
        key=lambda item: -len(item[0]),
    )
    taken = [False] * len(text)
    first_seen: dict[str, int] = {}
    for name, entity_id in names:
        start = text.find(name)
        while start >= 0:
            end = start + len(name)
            if not any(taken[start:end]):
                taken[start:end] = [True] * len(name)
                first_seen[entity_id] = min(first_seen.get(entity_id, start), start)
            start = text.find(name, start + 1)
    return sorted(first_seen, key=lambda entity_id: (first_seen[entity_id], entity_id))


def citation_stats(answer: str, context: RetrievalContext) -> dict[str, object]:
    """检索与引用的对照：命中数、引用数、被引用的比例，以及检索到但没被用的知识点。"""
    cited = cited_entity_ids(answer, context)
    retrieved = [entity.id for entity in context.entities]
    matched = context.matched_entity_ids
    return {
        "retrieved": len(retrieved),
        "matched": len(matched),
        "cited": len(cited),
        "cited_ids": cited,
        "unused_matched_ids": [i for i in matched if i not in cited],
        "citation_rate": round(len(cited) / len(retrieved), 3) if retrieved else 0.0,
    }
