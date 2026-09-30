"""为 AI 问答从知识图谱组装检索上下文。

检索流程：
1. 把每个知识点的名称、别名、标签、简介、定义等文字切成词元，建 BM25 倒排索引（启动后第一次提问时建立）；
2. 把问题切成同样的词元，按字段加权的 BM25 打分，取前几名；
3. 命中太少或分数太低时，退回到页面当前选中的知识点或历史对话里用过的知识点；
4. 命中的知识点补上一跳邻居；学习顺序类问题再沿「前置知识」往回追几步。
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter, defaultdict

from ..domain.api import AIConversationTurn
from ..domain.entities import KnowledgeEntity, KnowledgeRelation
from ..domain.results import RetrievalContext, SearchResult
from .graph import KnowledgeGraph

TOP_K = 5
#: 低于最高分这个比例的命中不要，避免带进只沾了一个常用字的无关知识点。
RELATIVE_CUTOFF = 0.4
#: 最高分低于这个值就认为没有依据（约等于至少命中了一个较少见的词）。
MIN_SCORE = 2.0
#: 名称或别名整体出现在问题里时的额外加分。
NAME_BONUS = 6.0
PREREQUISITE_DEPTH = 3
#: 问题里出现这些指代词，说明在追问上文，优先沿用页面实体和历史实体。
_ANAPHORA = ("它", "这个", "那个", "该", "上面", "上述", "刚才", "前面", "这些", "那些")
_ORDER_HINTS = ("先学", "前置", "之前", "基础", "顺序", "路线", "路径", "先修", "先掌握", "学习")

# 字段权重：名称和别名最重要，简介和定义提供描述性词汇。
_FIELD_WEIGHTS = {
    "name": 6.0,
    "aliases": 5.0,
    "tags": 3.0,
    "symbol": 3.0,
    "formula": 2.0,
    "summary": 1.6,
    "detail": 1.0,
}
#: 命中这些字段的词元算「强匹配」；只在简介、定义里命中的必须命中至少两个不同的词才算数。
_STRONG_FIELDS = frozenset({"name", "aliases", "tags", "symbol"})
_K1 = 1.5
_B = 0.6

#: 提问用语切出来的词元，对区分知识点没有帮助，索引和问题里都丢掉。
_STOP_TOKENS = frozenset({
    "问题", "什么", "怎么", "怎样", "如何", "为什", "什么", "是什", "有什", "是否", "可以",
    "应该", "需要", "一个", "这个", "那个", "我们", "请问", "解释", "介绍", "一下", "哪些",
})

_CJK = re.compile(r"[一-鿿]+")
_WORD = re.compile(r"[a-z0-9]+|[^\s\w一-鿿]|[α-ω]")
_SYMBOL_ALIASES = str.maketrans({"−": "-", "–": "-", "—": "-", "·": "*", "×": "x"})


def tokenize(text: str) -> list[str]:
    """中文按相邻两字切分（单字成词的补单字），英文数字按词，公式符号按单个字符。"""
    text = unicodedata.normalize("NFKC", text).translate(_SYMBOL_ALIASES).casefold()
    tokens: list[str] = []
    for run in _CJK.findall(text):
        if len(run) == 1:
            tokens.append(run)
        else:
            tokens.extend(
                pair for pair in (run[i : i + 2] for i in range(len(run) - 1))
                if pair not in _STOP_TOKENS
            )
    for match in _WORD.findall(_CJK.sub(" ", text)):
        if match.strip() and match not in "=+-*/(),.:;，。、？！；：（）":
            tokens.append(match)
    return tokens


def _entity_fields(entity: KnowledgeEntity) -> dict[str, list[str]]:
    """把实体拆成带权重的文字字段。"""
    details = entity.details
    detail_text: list[str] = []
    for name in ("definition", "purpose", "scenario"):
        detail_text.append(getattr(details, name, "") or "")
    for name in ("key_points", "common_misconceptions", "steps", "key_parameters"):
        detail_text.extend(getattr(details, name, []) or [])
    detail_text.extend(entity.conditions)
    for variable in getattr(details, "variables", []) or []:
        detail_text.extend([variable.name, variable.description])
    return {
        "name": [entity.name],
        "aliases": entity.aliases,
        "tags": entity.tags,
        "symbol": [getattr(details, "symbol", "") or ""],
        "formula": [getattr(details, "plain_text", "") or ""],
        "summary": [entity.summary],
        "detail": detail_text,
    }


class _Index:
    """按字段加权的 BM25 倒排索引。"""

    def __init__(self, graph: KnowledgeGraph) -> None:
        self.postings: dict[str, dict[str, float]] = defaultdict(dict)
        #: 每个词元在哪些知识点的名称、别名、标签、符号里出现过。
        self.strong: dict[str, set[str]] = defaultdict(set)
        lengths: dict[str, float] = {}
        for entity in graph.entities:
            weighted: Counter[str] = Counter()
            for field, texts in _entity_fields(entity).items():
                for token in tokenize(" ".join(texts)):
                    weighted[token] += _FIELD_WEIGHTS[field]
                    if field in _STRONG_FIELDS:
                        self.strong[token].add(entity.id)
            lengths[entity.id] = sum(weighted.values())
            for token, weight in weighted.items():
                self.postings[token][entity.id] = weight
        self.lengths = lengths
        self.average_length = sum(lengths.values()) / max(len(lengths), 1)
        self.count = len(lengths)

    def score(self, question: str) -> dict[str, float]:
        """返回每个有命中的知识点的 BM25 分数。"""
        scores: dict[str, float] = defaultdict(float)
        matched_tokens: dict[str, int] = defaultdict(int)
        strong_hit: set[str] = set()
        for token in set(tokenize(question)):
            posting = self.postings.get(token)
            if not posting:
                continue
            strong_hit |= self.strong.get(token, set())
            idf = math.log(1 + (self.count - len(posting) + 0.5) / (len(posting) + 0.5))
            for entity_id, weight in posting.items():
                norm = 1 - _B + _B * self.lengths[entity_id] / self.average_length
                scores[entity_id] += idf * weight * (_K1 + 1) / (weight + _K1 * norm)
                matched_tokens[entity_id] += 1
        # 只沾了一个普通词的知识点（比如「完全」「无关」）不算命中。
        return {i: v for i, v in scores.items() if i in strong_hit or matched_tokens[i] >= 2}


def _index_for(graph: KnowledgeGraph) -> _Index:
    """索引随知识图谱实例缓存，图谱不变就只建一次。"""
    index = getattr(graph, "_retrieval_index", None)
    if index is None:
        index = graph._retrieval_index = _Index(graph)
    return index


def search_entities(graph: KnowledgeGraph, question: str, limit: int = TOP_K) -> list[SearchResult]:
    """按 BM25 加名称命中加分排序，返回前 limit 个足够相关的知识点。"""
    scores = _index_for(graph).score(question)
    normalized = unicodedata.normalize("NFKC", question).translate(_SYMBOL_ALIASES).casefold()
    mentioned: list[str] = []
    for entity in graph.entities:
        for name in (entity.name, *entity.aliases):
            if name and name.casefold() in normalized:
                scores[entity.id] = scores.get(entity.id, 0.0) + NAME_BONUS
                mentioned.append(entity.id)
                break
    if not scores:
        return []

    ranked = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    best = ranked[0][1]
    if best < MIN_SCORE:
        return []
    kept = [(i, s) for i, s in ranked if s >= best * RELATIVE_CUTOFF][:limit]
    # 问题里点了名的知识点（例如「A 和 B 有什么联系」里的 A）无论分数高低都要保留。
    missing = [(i, scores[i]) for i in mentioned if i not in {k for k, _ in kept}]
    if missing:
        kept = (kept[: max(limit - len(missing), 1)] + missing)[:limit]
    return [
        SearchResult(entity=graph.by_id[entity_id], score=round(score, 3), matched_fields=[])
        for entity_id, score in kept
    ]


def build_retrieval_context(
    graph: KnowledgeGraph,
    question: str,
    context_entity_id: str | None,
    history: list[AIConversationTurn] | None = None,
) -> tuple[RetrievalContext, bool]:
    """按当前问题检索知识点，没有命中时退回页面实体和历史实体，再补充邻居。"""
    history = history or []
    matched = search_entities(graph, question)
    carried = _carried_hits(graph, context_entity_id, history)
    if any(word in question for word in _ANAPHORA):
        # 追问：上文的知识点排在前面，问题本身检索到的补在后面。
        seen = {hit.entity.id for hit in carried}
        matched = (carried + [hit for hit in matched if hit.entity.id not in seen])[:TOP_K]
    elif not matched:
        matched = carried
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

    def add_relation(relation: KnowledgeRelation) -> None:
        relation_map[(relation.source_id, relation.target_id, relation.type)] = relation

    for result in matched:
        entity = result.entity
        collected[entity.id] = entity
        for item in graph.neighbors(entity.id).items:
            collected.setdefault(item.entity.id, item.entity)
            add_relation(item.relation)

    if any(hint in question for hint in _ORDER_HINTS):
        # 学习顺序类问题：沿「前置知识」往回追几步，把整条先修链交给模型。
        for result in matched:
            for entity, relation in _prerequisite_chain(graph, result.entity.id):
                collected.setdefault(entity.id, entity)
                add_relation(relation)

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


def _carried_hits(
    graph: KnowledgeGraph,
    context_entity_id: str | None,
    history: list[AIConversationTurn],
) -> list[SearchResult]:
    """页面当前选中的知识点，加上最近几轮对话用过的知识点（去重，最多 TOP_K 个）。"""
    ids = dict.fromkeys(
        [context_entity_id, *(
            entity_id
            for turn in reversed(history)
            for entity_id in turn.used_entity_ids
        )]
    )
    return [_fallback_hit(graph.by_id[i]) for i in ids if i in graph.by_id][:TOP_K]


def _fallback_hit(entity: KnowledgeEntity) -> SearchResult:
    """把页面实体或历史实体包装成没有匹配字段的命中结果。"""
    return SearchResult(entity=entity, score=1.0, matched_fields=[])


def _prerequisite_chain(graph: KnowledgeGraph, entity_id: str):
    """产生该知识点的前置知识（最多追 PREREQUISITE_DEPTH 步）及对应关系。"""
    seen = {entity_id}
    frontier = [entity_id]
    for _ in range(PREREQUISITE_DEPTH):
        next_frontier: list[str] = []
        for current in frontier:
            for item in graph.neighbors(current, direction="incoming", relation_types=["prerequisite"]).items:
                yield item.entity, item.relation
                if item.entity.id not in seen:
                    seen.add(item.entity.id)
                    next_frontier.append(item.entity.id)
        frontier = next_frontier
        if not frontier:
            break
