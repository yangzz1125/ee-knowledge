"""知识库查询和内部检索产生的数据类型。"""

from __future__ import annotations

from typing import Literal

from .api import AIConversationTurn
from .entities import KnowledgeEntity, KnowledgeRelation
from .types import StrictModel


class SearchResult(StrictModel):
    """单个实体的搜索结果和匹配信息。"""

    entity: KnowledgeEntity
    score: float
    matched_fields: list[str]


class NeighborItem(StrictModel):
    """一个邻居实体及其与中心实体的关系。"""

    entity: KnowledgeEntity
    relation: KnowledgeRelation
    direction: Literal["incoming", "outgoing", "undirected"]


class NeighborResult(StrictModel):
    """实体的一跳邻居查询结果。"""

    center_id: str
    items: list[NeighborItem]


class PathResult(StrictModel):
    """两个实体之间的路径查询结果。"""

    found: bool
    entities: list[KnowledgeEntity]
    relations: list[KnowledgeRelation]
    message: str | None = None


class GraphView(StrictModel):
    """全图或局部图查询结果。"""

    center_id: str | None
    entities: list[KnowledgeEntity]
    relations: list[KnowledgeRelation]


class RetrievalContext(StrictModel):
    """交给 AI 模型的检索上下文，不写入知识库。"""

    question: str
    history: list[AIConversationTurn]
    matched_entity_ids: list[str]
    entities: list[KnowledgeEntity]
    relations: list[KnowledgeRelation]
    retrieval_message: str | None = None
