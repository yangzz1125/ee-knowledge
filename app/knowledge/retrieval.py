"""为 AI 问答从知识图谱组装检索上下文。"""

from __future__ import annotations

from ..domain.api import AIConversationTurn
from ..domain.entities import KnowledgeEntity, KnowledgeRelation
from ..domain.results import RetrievalContext, SearchResult
from .graph import KnowledgeGraph


def build_retrieval_context(
    graph: KnowledgeGraph,
    question: str,
    context_entity_id: str | None,
    history: list[AIConversationTurn] | None = None,
) -> tuple[RetrievalContext, bool]:
    """按当前问题、页面实体和历史实体匹配知识，再补充一跳邻居。"""
    history = history or []
    matched = graph.search(keyword=question, limit=5)
    if not matched:
        # 整句通常不会直接命中字段，退化为检查名称是否出现在问题中。
        matched = _match_by_entity_name(graph, question)
    if not matched and context_entity_id in graph.by_id:
        matched = [_fallback_hit(graph.by_id[context_entity_id])]
    if not matched:
        # 从最近轮次开始，最多取 5 个有效且不重复的历史实体。
        history_ids = dict.fromkeys(
            entity_id
            for turn in reversed(history)
            for entity_id in turn.used_entity_ids
            if entity_id in graph.by_id
        )
        matched = [_fallback_hit(graph.by_id[i]) for i in list(history_ids)[:5]]
    if not matched:
        return (
            RetrievalContext(
                question=question,
                history=history,
                matched_entity_ids=[],
                entities=[],
                relations=[],
                retrieval_message="没有命中任何知识点。",
            ),
            True,
        )

    collected: dict[str, KnowledgeEntity] = {}
    relation_map: dict[tuple[str, str, str], KnowledgeRelation] = {}
    for result in matched:
        entity = result.entity
        collected[entity.id] = entity
        for item in graph.neighbors(entity.id).items:
            collected.setdefault(item.entity.id, item.entity)
            relation = item.relation
            relation_map[(relation.source_id, relation.target_id, relation.type)] = relation

    return (
        RetrievalContext(
            question=question,
            history=history,
            matched_entity_ids=[result.entity.id for result in matched],
            entities=list(collected.values()),
            relations=list(relation_map.values()),
            retrieval_message=None,
        ),
        False,
    )


def _fallback_hit(entity: KnowledgeEntity) -> SearchResult:
    """把页面实体或历史实体包装成没有匹配字段的命中结果。"""
    return SearchResult(entity=entity, score=1.0, matched_fields=[])


def _match_by_entity_name(
    graph: KnowledgeGraph, question: str
) -> list[SearchResult]:
    """从整句问题中兜底匹配实体名称和别名。"""
    hits = []
    for entity in graph.entities:
        names = [entity.name, *entity.aliases]
        if any(name and name in question for name in names):
            hits.append(SearchResult(entity=entity, score=1.0, matched_fields=["name"]))
    return hits
