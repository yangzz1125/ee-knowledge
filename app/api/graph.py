"""知识路径和图谱视图接口。"""

from typing import Annotated, Literal

from fastapi import APIRouter, Query

from ..dependencies import graph
from ..domain.results import GraphView, PathResult
from ..domain.types import EntityType, RelationType

router = APIRouter(prefix="/api")


@router.get("/path", response_model=PathResult, tags=["路径"])
def find_path(
    start_id: Annotated[str, Query(description="起点实体 ID")],
    end_id: Annotated[str, Query(description="终点实体 ID")],
    direction: Annotated[
        Literal["directed", "undirected"], Query(description="默认顺着关系方向")
    ] = "directed",
    allowed_relation_types: Annotated[list[RelationType] | None, Query()] = None,
    max_depth: Annotated[int, Query(ge=1, le=10)] = 6,
) -> PathResult:
    """查找两个实体之间的有向或无向最短路径。"""
    return graph.path(start_id, end_id, direction, allowed_relation_types, max_depth)


@router.get("/graph", response_model=GraphView, tags=["图谱"])
def get_graph(
    center_id: Annotated[str | None, Query(description="不传表示查全图")] = None,
    depth: Annotated[int, Query(ge=1, le=3, description="center_id 未传时忽略")] = 1,
    entity_types: Annotated[list[EntityType] | None, Query()] = None,
    relation_types: Annotated[list[RelationType] | None, Query()] = None,
) -> GraphView:
    """返回全图或指定中心及深度范围内的局部图谱。"""
    return graph.graph_view(center_id, depth, entity_types, relation_types)
