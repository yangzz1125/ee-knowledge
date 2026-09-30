"""与 knowledge_base.json 一一对应的领域模型。"""

from __future__ import annotations

from typing import Annotated, Literal, TypeAlias, Union

from pydantic import Field

from .types import RelationType, StrictModel


class Chapter(StrictModel):
    """课程章节；只用于导航和实体归属，不参与关系。"""

    id: str
    name: str
    order: int
    parent_id: str | None
    description: str


class FormulaVariable(StrictModel):
    """公式中的变量，不作为顶层实体保存。"""

    symbol: str
    name: str
    quantity_id: str | None
    unit: str | None
    description: str


class ConceptDetails(StrictModel):
    """概念和定律共用的详情结构。"""

    definition: str
    key_points: list[str]
    common_misconceptions: list[str]


class QuantityDetails(StrictModel):
    """物理量详情。"""

    symbol: str
    unit: str | None
    dimension: str | None
    value_kind: Literal["scalar", "vector"]


class FormulaDetails(StrictModel):
    """公式或方程详情。"""

    latex: str
    plain_text: str
    variables: list[FormulaVariable]


class MethodDetails(StrictModel):
    """分析方法详情。"""

    purpose: str
    steps: list[str]


class ApplicationDetails(StrictModel):
    """工程应用详情。"""

    scenario: str
    key_parameters: list[str]


class BaseEntity(StrictModel):
    """所有知识实体共享的字段。"""

    id: str
    name: str
    summary: str
    chapter_id: str
    aliases: list[str]
    tags: list[str]
    conditions: list[str]


class ConceptEntity(BaseEntity):
    """概念实体。"""

    type: Literal["concept"]
    details: ConceptDetails


class LawEntity(BaseEntity):
    """定律或定理实体。"""

    type: Literal["law"]
    details: ConceptDetails


class QuantityEntity(BaseEntity):
    """物理量实体。"""

    type: Literal["quantity"]
    details: QuantityDetails


class FormulaEntity(BaseEntity):
    """公式或方程实体。"""

    type: Literal["formula"]
    details: FormulaDetails


class MethodEntity(BaseEntity):
    """分析方法实体。"""

    type: Literal["method"]
    details: MethodDetails


class ApplicationEntity(BaseEntity):
    """工程应用实体。"""

    type: Literal["application"]
    details: ApplicationDetails


#: type 是判别字段，Pydantic 据此选择实体模型并校验 details。
KnowledgeEntity: TypeAlias = Annotated[
    Union[
        ConceptEntity,
        LawEntity,
        QuantityEntity,
        FormulaEntity,
        MethodEntity,
        ApplicationEntity,
    ],
    Field(discriminator="type"),
]


class KnowledgeRelation(StrictModel):
    """两个知识实体之间的关系。"""

    source_id: str
    target_id: str
    type: RelationType
    description: str


class KnowledgeBase(StrictModel):
    """一个可完整加载和校验的知识库快照。"""

    schema_version: str
    chapters: list[Chapter]
    entities: list[KnowledgeEntity]
    relations: list[KnowledgeRelation]
