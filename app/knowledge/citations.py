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
    """返回回答中出现过名称或别名的知识点 ID，按在回答中第一次出现的位置排序。"""
    text = _normalize(answer)
    found: list[tuple[int, str]] = []
    for entity in context.entities:
        positions = [
            text.find(_normalize(name))
            for name in (entity.name, *entity.aliases)
            if len(name) >= _MIN_NAME_LENGTH
        ]
        positions = [position for position in positions if position >= 0]
        if positions:
            found.append((min(positions), entity.id))
    return [entity_id for _, entity_id in sorted(found)]


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
