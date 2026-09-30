"""知识库加载、查询和 AI 检索的公共入口。"""

from .citations import cited_entity_ids, citation_stats
from .errors import EntityNotFound, KnowledgeBaseError
from .graph import KnowledgeGraph
from .loader import load_knowledge_base
from .retrieval import build_retrieval_context

__all__ = [
    "citation_stats",
    "cited_entity_ids",
    "EntityNotFound",
    "KnowledgeBaseError",
    "KnowledgeGraph",
    "build_retrieval_context",
    "load_knowledge_base",
]
