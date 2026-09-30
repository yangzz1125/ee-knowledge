"""领域基础类型、枚举顺序和显示名称。"""

from __future__ import annotations

from typing import Literal, get_args

from pydantic import BaseModel, ConfigDict

#: 实体类型。顺序也是搜索结果同分时的排序优先级。
EntityType = Literal["concept", "quantity", "law", "formula", "method", "application"]

#: 关系类型。关系方向由类型唯一决定，不在数据中重复保存。
RelationType = Literal[
    "prerequisite",
    "defines",
    "expresses",
    "derives",
    "uses",
    "describes",
    "applies_to",
    "equivalent_to",
    "related_to",
]

ENTITY_TYPE_ORDER: tuple[str, ...] = get_args(EntityType)
RELATION_TYPE_ORDER: tuple[str, ...] = get_args(RelationType)
UNDIRECTED_RELATION_TYPES: frozenset[str] = frozenset({"equivalent_to", "related_to"})
SUPPORTED_SCHEMA_VERSIONS: frozenset[str] = frozenset({"1.0"})


class StrictModel(BaseModel):
    """禁止未知字段，避免数据文件中的拼写错误被静默忽略。"""

    model_config = ConfigDict(extra="forbid")


ENTITY_TYPE_LABELS: dict[str, str] = {
    "concept": "概念",
    "quantity": "物理量",
    "law": "定律或定理",
    "formula": "公式或方程",
    "method": "分析方法",
    "application": "工程应用",
}

RELATION_TYPE_LABELS: dict[str, str] = {
    "prerequisite": "前置知识",
    "defines": "定义",
    "expresses": "表达为",
    "derives": "推导出",
    "uses": "使用",
    "describes": "描述",
    "applies_to": "应用于",
    "equivalent_to": "等价于",
    "related_to": "相关",
}
