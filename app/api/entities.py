"""知识实体搜索、详情和邻居接口。"""

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query

from ..dependencies import graph
from ..domain.entities import KnowledgeEntity
from ..domain.results import NeighborResult, SearchResult
from ..domain.types import EntityType, RelationType
from ..knowledge import EntityNotFound

router = APIRouter(prefix="/api/entities", tags=["实体"])


@router.get("", response_model=list[SearchResult])
def search_entities(
    keyword: Annotated[str, Query(description="搜索文字，为空表示只按类型/章节筛选")] = "",
    entity_types: Annotated[
        list[EntityType] | None, Query(description="可重复，不传表示不过滤类型")
    ] = None,
    chapter_ids: Annotated[
        list[str] | None, Query(description="可重复，不传表示不过滤章节")
    ] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[SearchResult]:
    """按关键词、实体类型和章节筛选知识实体。"""
    return graph.search(
        keyword=keyword,
        entity_types=entity_types,
        chapter_ids=chapter_ids,
        limit=limit,
    )


@router.get("/{entity_id}", response_model=KnowledgeEntity)
def get_entity(entity_id: str) -> KnowledgeEntity:
    """按 ID 返回一个知识实体，不存在时返回 404。"""
    entity = graph.by_id.get(entity_id)
    if entity is None:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "entity_not_found",
                "message": f"未找到知识点：{entity_id}",
                "field": "entity_id",
            },
        )
    return entity


@router.get("/{entity_id}/neighbors", response_model=NeighborResult)
def get_neighbors(
    entity_id: str,
    direction: Annotated[
        Literal["incoming", "outgoing", "both"], Query()
    ] = "both",
    relation_types: Annotated[list[RelationType] | None, Query()] = None,
) -> NeighborResult:
    """返回实体的一跳邻居及其关系方向。"""
    try:
        return graph.neighbors(
            entity_id,
            direction=direction,
            relation_types=relation_types,
        )
    except EntityNotFound as exc:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "entity_not_found",
                "message": f"未找到知识点：{exc.entity_id}",
                "field": "entity_id",
            },
        ) from None
