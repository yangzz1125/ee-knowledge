"""根路径、健康检查、元数据和章节接口。"""

from fastapi import APIRouter

from ..dependencies import graph
from ..domain.api import (
    COURSE,
    EnumOption,
    HealthCounts,
    HealthResponse,
    MetaResponse,
    RelationTypeOption,
)
from ..domain.entities import Chapter
from ..domain.types import (
    ENTITY_TYPE_LABELS,
    ENTITY_TYPE_ORDER,
    RELATION_TYPE_LABELS,
    RELATION_TYPE_ORDER,
    UNDIRECTED_RELATION_TYPES,
)

router = APIRouter()


@router.get("/", tags=["系统"])
def read_root() -> dict[str, str]:
    """返回 API 名称和在线文档入口。"""
    return {"message": COURSE.name + " AI 知识图谱 API", "docs": "/docs"}


@router.get("/api/health", response_model=HealthResponse, tags=["系统"])
def health() -> HealthResponse:
    """返回服务状态、知识库版本和当前数据量。"""
    return HealthResponse(
        status="ok",
        course=COURSE.name,
        schema_version=graph.kb.schema_version,
        counts=HealthCounts(
            chapters=len(graph.chapters),
            entities=len(graph.entities),
            relations=len(graph.relations),
        ),
    )


@router.get("/api/meta", response_model=MetaResponse, tags=["系统"])
def meta() -> MetaResponse:
    """返回供前端渲染图例和筛选框使用的枚举元数据。"""
    return MetaResponse(
        course=COURSE,
        schema_version=graph.kb.schema_version,
        entity_types=[
            EnumOption(value=value, label=ENTITY_TYPE_LABELS[value])
            for value in ENTITY_TYPE_ORDER
        ],
        relation_types=[
            RelationTypeOption(
                value=value,
                label=RELATION_TYPE_LABELS[value],
                directed=value not in UNDIRECTED_RELATION_TYPES,
            )
            for value in RELATION_TYPE_ORDER
        ],
    )


@router.get("/api/chapters", response_model=list[Chapter], tags=["章节"])
def list_chapters() -> list[Chapter]:
    """返回已经按 order 升序排列的课程章节。"""
    return graph.chapters
