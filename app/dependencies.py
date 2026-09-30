"""应用共享依赖。"""

from .knowledge import KnowledgeBaseError, KnowledgeGraph, load_knowledge_base

# 启动时只加载一次知识库；无效数据应阻止服务启动。
try:
    graph = KnowledgeGraph(load_knowledge_base())
except KnowledgeBaseError as exc:
    raise SystemExit(str(exc)) from None
