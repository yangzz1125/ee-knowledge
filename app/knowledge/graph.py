"""内存知识图谱索引和查询算法。"""

from __future__ import annotations

from collections import defaultdict, deque

from ..domain.entities import (
    Chapter,
    KnowledgeBase,
    KnowledgeEntity,
    KnowledgeRelation,
)
from ..domain.results import (
    GraphView,
    NeighborItem,
    NeighborResult,
    PathResult,
    SearchResult,
)
from ..domain.types import ENTITY_TYPE_ORDER, UNDIRECTED_RELATION_TYPES
from .errors import EntityNotFound

SEARCH_WEIGHTS: dict[str, float] = {
    "name_exact": 1.0,
    "name": 0.8,
    "aliases": 0.6,
    "tags": 0.4,
    "plain_text": 0.3,
    "summary": 0.2,
}

_TYPE_ORDER_INDEX = {name: index for index, name in enumerate(ENTITY_TYPE_ORDER)}


class KnowledgeGraph:
    """在已校验的知识库之上提供只读图查询。"""

    def __init__(self, kb: KnowledgeBase) -> None:
        """建立实体索引和关系方向索引，供所有查询复用。"""
        self.kb = kb
        self.chapters: list[Chapter] = sorted(kb.chapters, key=lambda chapter: chapter.order)
        self.entities = kb.entities
        self.relations = kb.relations
        self.by_id = {entity.id: entity for entity in self.entities}

        outgoing: dict[str, list[KnowledgeRelation]] = defaultdict(list)
        incoming: dict[str, list[KnowledgeRelation]] = defaultdict(list)
        for relation in self.relations:
            outgoing[relation.source_id].append(relation)
            incoming[relation.target_id].append(relation)
        self._outgoing = outgoing
        self._incoming = incoming

    # -- 搜索 ---------------------------------------------------------------

    def search(
        self,
        keyword: str = "",
        entity_types: list[str] | None = None,
        chapter_ids: list[str] | None = None,
        limit: int = 50,
    ) -> list[SearchResult]:
        """搜索实体；关键词为空时仅按类型和章节浏览。"""
        needle = keyword.strip().casefold()
        type_filter = set(entity_types) if entity_types else None
        chapter_filter = set(chapter_ids) if chapter_ids else None

        results: list[SearchResult] = []
        for entity in self.entities:
            if type_filter is not None and entity.type not in type_filter:
                continue
            if chapter_filter is not None and entity.chapter_id not in chapter_filter:
                continue
            scores = self._match(entity, needle) if needle else {}
            if needle and not scores:
                continue
            results.append(
                SearchResult(
                    entity=entity,
                    score=max(scores.values(), default=0.0),
                    matched_fields=sorted(scores),
                )
            )

        # 分数降序；同分按实体类型顺序和 ID 排序，保证结果稳定。
        results.sort(
            key=lambda result: (
                -result.score,
                _TYPE_ORDER_INDEX[result.entity.type],
                result.entity.id,
            )
        )
        return results[:limit]

    @staticmethod
    def _match(entity: KnowledgeEntity, needle: str) -> dict[str, float]:
        """返回实体中每个命中字段及其搜索权重。"""
        scores: dict[str, float] = {}
        name = entity.name.casefold()
        if name == needle:
            scores["name"] = SEARCH_WEIGHTS["name_exact"]
        elif needle in name:
            scores["name"] = SEARCH_WEIGHTS["name"]
        if any(needle in alias.casefold() for alias in entity.aliases):
            scores["aliases"] = SEARCH_WEIGHTS["aliases"]
        if any(needle in tag.casefold() for tag in entity.tags):
            scores["tags"] = SEARCH_WEIGHTS["tags"]
        plain_text = getattr(entity.details, "plain_text", None)
        if plain_text and needle in plain_text.casefold():
            scores["plain_text"] = SEARCH_WEIGHTS["plain_text"]
        if needle in entity.summary.casefold():
            scores["summary"] = SEARCH_WEIGHTS["summary"]
        return scores

    # -- 邻居 ---------------------------------------------------------------

    def neighbors(
        self,
        entity_id: str,
        direction: str = "both",
        relation_types: list[str] | None = None,
    ) -> NeighborResult:
        """返回实体的一跳邻居，并标明相对于中心实体的方向。"""
        if entity_id not in self.by_id:
            raise EntityNotFound(entity_id)

        allowed = set(relation_types) if relation_types else None
        items: list[NeighborItem] = []
        for relation, neighbor_id, reported_direction in self._sides(entity_id):
            if allowed is not None and relation.type not in allowed:
                continue
            # incoming/outgoing 只过滤有向关系，无向关系始终可见。
            if relation.type not in UNDIRECTED_RELATION_TYPES:
                if direction != "both" and direction != reported_direction:
                    continue
            items.append(
                NeighborItem(
                    entity=self.by_id[neighbor_id],
                    relation=relation,
                    direction=reported_direction,
                )
            )
        return NeighborResult(center_id=entity_id, items=items)

    def _sides(self, entity_id: str):
        """产生关系、邻接实体 ID 以及相对于中心实体的方向。"""
        for relation in self._outgoing.get(entity_id, ()):
            yield relation, relation.target_id, self._direction(relation, "outgoing")
        for relation in self._incoming.get(entity_id, ()):
            yield relation, relation.source_id, self._direction(relation, "incoming")

    @staticmethod
    def _direction(relation: KnowledgeRelation, directed: str) -> str:
        """无向关系一律报告 undirected。"""
        return "undirected" if relation.type in UNDIRECTED_RELATION_TYPES else directed

    # -- 路径 ---------------------------------------------------------------

    def path(
        self,
        start_id: str,
        end_id: str,
        direction: str = "directed",
        allowed_relation_types: list[str] | None = None,
        max_depth: int = 6,
    ) -> PathResult:
        """使用 BFS 查找两个实体之间的最短路径。"""
        for entity_id, field in ((start_id, "start_id"), (end_id, "end_id")):
            if entity_id not in self.by_id:
                raise EntityNotFound(entity_id, field)

        if start_id == end_id:
            return PathResult(found=True, entities=[self.by_id[start_id]], relations=[])

        allowed = set(allowed_relation_types) if allowed_relation_types else None
        undirected_search = direction == "undirected"
        queue: deque[tuple[str, int]] = deque([(start_id, 0)])
        previous: dict[str, tuple[str, KnowledgeRelation]] = {}
        visited = {start_id}

        while queue:
            current, depth = queue.popleft()
            if depth >= max_depth:
                continue
            reached = False
            for relation, next_id in self._steps(current, undirected_search):
                if allowed is not None and relation.type not in allowed:
                    continue
                if next_id in visited:
                    continue
                visited.add(next_id)
                previous[next_id] = (current, relation)
                if next_id == end_id:
                    reached = True
                    break
                queue.append((next_id, depth + 1))
            if reached:
                break

        if end_id not in previous:
            return PathResult(
                found=False,
                entities=[],
                relations=[],
                message=self._no_path_message(start_id, end_id, undirected_search),
            )

        entity_path = [end_id]
        relation_path: list[KnowledgeRelation] = []
        cursor = end_id
        while cursor != start_id:
            parent, relation = previous[cursor]
            entity_path.append(parent)
            relation_path.append(relation)
            cursor = parent
        entity_path.reverse()
        relation_path.reverse()

        return PathResult(
            found=True,
            entities=[self.by_id[entity_id] for entity_id in entity_path],
            relations=relation_path,
        )

    def _steps(self, entity_id: str, undirected_search: bool):
        """产生路径搜索中从实体出发的一步可达关系。"""
        for relation in self._outgoing.get(entity_id, ()):
            yield relation, relation.target_id
        if undirected_search:
            for relation in self._incoming.get(entity_id, ()):
                yield relation, relation.source_id

    def _no_path_message(
        self, start_id: str, end_id: str, undirected_search: bool
    ) -> str:
        """生成面向用户的无路径提示。"""
        start = self.by_id[start_id].name
        end = self.by_id[end_id].name
        if not undirected_search:
            return (
                f"顺着关系方向没有从「{start}」到「{end}」的路径。"
                "可以试试改为无向查找（direction=undirected），"
                "或换一个起点或终点。"
            )
        return f"「{start}」和「{end}」之间没有可达路径，换一个起点或终点试试。"

    # -- 图谱 ---------------------------------------------------------------

    def graph_view(
        self,
        center_id: str | None = None,
        depth: int = 1,
        entity_types: list[str] | None = None,
        relation_types: list[str] | None = None,
    ) -> GraphView:
        """构造全图或以中心实体展开的局部图。"""
        type_filter = set(entity_types) if entity_types else None
        relation_filter = set(relation_types) if relation_types else None

        if center_id is None:
            keep = {
                entity.id
                for entity in self.entities
                if type_filter is None or entity.type in type_filter
            }
        else:
            if center_id not in self.by_id:
                raise EntityNotFound(center_id, "center_id")
            keep = self._expand(center_id, depth)
            # 类型过滤不作用于中心实体，否则局部图会失去中心。
            keep = {
                entity_id
                for entity_id in keep
                if entity_id == center_id
                or type_filter is None
                or self.by_id[entity_id].type in type_filter
            }

        relations = [
            relation
            for relation in self.relations
            if relation.source_id in keep
            and relation.target_id in keep
            and (relation_filter is None or relation.type in relation_filter)
        ]
        return GraphView(
            center_id=center_id,
            entities=[entity for entity in self.entities if entity.id in keep],
            relations=relations,
        )

    def _expand(self, center_id: str, depth: int) -> set[str]:
        """按层扩展中心实体，返回指定深度内的实体 ID。"""
        keep = {center_id}
        frontier = [center_id]
        for _ in range(depth):
            next_frontier: list[str] = []
            for entity_id in frontier:
                for _relation, neighbor_id, _direction in self._sides(entity_id):
                    if neighbor_id in keep:
                        continue
                    keep.add(neighbor_id)
                    next_frontier.append(neighbor_id)
            if not next_frontier:
                break
            frontier = next_frontier
        return keep
