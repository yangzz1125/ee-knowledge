import { relationKey } from "../store.js";

// 连接数最多的若干颗星常显名字，其余只在聚焦时显示，避免标签糊成一片。
const LANDMARK_COUNT = 14;

/**
 * 把接口返回的实体和关系转成力导向库要的 nodes / links。
 * 每次创建渲染器都要新建一份：库会直接改写节点坐标和连线的 source/target。
 */
export function buildGraphData(entities, relations, chapters, directedRelations) {
  const degree = new Map();
  relations.forEach(({ source_id: source, target_id: target }) => {
    degree.set(source, (degree.get(source) || 0) + 1);
    degree.set(target, (degree.get(target) || 0) + 1);
  });
  const landmarks = new Set(
    [...entities]
      .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))
      .slice(0, LANDMARK_COUNT)
      .map(entity => entity.id),
  );
  const chapterOrder = new Map(chapters.map(chapter => [chapter.id, chapter.order]));
  const chapterOfEntity = new Map(entities.map(entity => [entity.id, entity.chapter_id]));

  const nodes = entities.map(entity => ({
    id: entity.id,
    name: entity.name,
    type: entity.type,
    summary: entity.summary,
    chapterId: entity.chapter_id,
    chapterOrder: chapterOrder.get(entity.chapter_id),
    landmark: landmarks.has(entity.id),
    radius: 2.2 + Math.sqrt(degree.get(entity.id) || 0) * 1.25,
  }));
  const links = relations.map(relation => ({
    key: relationKey(relation),
    source: relation.source_id,
    target: relation.target_id,
    type: relation.type,
    directed: directedRelations.has(relation.type),
    sameChapter: chapterOfEntity.get(relation.source_id) === chapterOfEntity.get(relation.target_id),
  }));
  return { nodes, links };
}

/** 每个知识点的邻居和相连关系，悬停与选中时用来点亮一圈。 */
export function buildAdjacency(relations) {
  const neighbors = new Map();
  const links = new Map();
  const add = (map, key, value) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(value);
  };
  relations.forEach(relation => {
    const key = relationKey(relation);
    add(neighbors, relation.source_id, relation.target_id);
    add(neighbors, relation.target_id, relation.source_id);
    add(links, relation.source_id, key);
    add(links, relation.target_id, key);
  });
  return { neighbors, links };
}

/**
 * 根据当前状态决定每颗星、每条线的亮度：lit 点亮、normal 常态、dim 变暗。
 * 优先级：悬停 > 学习路径 > 选中 > AI 回答引用；都没有时按章节和类型筛选变暗。
 */
export function computeEmphasis(state, adjacency) {
  const { hoverId, path, selectedId, citedIds, chapterId, entityType } = state;
  let nodes = null;
  let links = null;

  const around = id => {
    nodes = new Set([id, ...(adjacency.neighbors.get(id) || [])]);
    links = new Set(adjacency.links.get(id) || []);
  };
  if (hoverId) around(hoverId);
  else if (path) {
    nodes = new Set(path.ids);
    links = new Set(path.relationKeys);
  } else if (selectedId) around(selectedId);
  else if (citedIds.length) {
    nodes = new Set(citedIds);
    links = new Set();
  }

  const filtered = Boolean(chapterId || entityType);
  const inFilter = node => (!chapterId || node.chapterId === chapterId)
    && (!entityType || node.type === entityType);

  const level = node => {
    if (nodes) return nodes.has(node.id) ? "lit" : "dim";
    return inFilter(node) ? "normal" : "dim";
  };
  // 渲染库启动后，连线的 source/target 已被换成节点对象。
  const linkLevel = link => {
    if (links) return links.has(link.key) ? "lit" : "dim";
    if (!filtered) return "normal";
    return inFilter(link.source) && inFilter(link.target) ? "normal" : "dim";
  };

  return {
    level,
    linkLevel,
    selectedId,
    pathIds: path?.ids || null,
    pathEnds: path ? new Set([path.ids[0], path.ids.at(-1)]) : new Set(),
    showLabel(node) {
      const value = level(node);
      if (value === "lit") return true;
      return value === "normal" && (node.landmark || filtered);
    },
  };
}
