import { chapterColor } from "../palette.js";
import { relationKey } from "../store.js";

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
  const chapterOrder = new Map(chapters.map(chapter => [chapter.id, chapter.order]));

  const nodes = entities.map(entity => ({
    id: entity.id,
    name: entity.name,
    type: entity.type,
    color: chapterColor(chapterOrder.get(entity.chapter_id)),
    degree: degree.get(entity.id) || 0,
    // 半径按关联数的平方根增长：关键节点明显更大，又不会大到压住邻居。
    radius: 2 + Math.sqrt(degree.get(entity.id) || 0) * 1.8,
  }));
  const links = relations.map(relation => ({
    key: relationKey(relation),
    source: relation.source_id,
    target: relation.target_id,
    type: relation.type,
    directed: directedRelations.has(relation.type),
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
 * 根据当前状态决定每个节点、每条线的亮度：lit 点亮、normal 常态、dim 变暗。
 * 优先级：拖动 > 悬停 > 学习路径 > 选中 > AI 回答引用；都没有时按类型筛选变暗。
 * 章节不在这里处理：章节视图直接换掉图上的节点，见 graph2d.js 的 setView。
 */
export function computeEmphasis(state, adjacency) {
  const { dragId, hoverId, path, selectedId, citedIds, entityType } = state;
  const activeId = dragId || hoverId;
  let nodes = null;
  let links = null;

  const around = id => {
    nodes = new Set([id, ...(adjacency.neighbors.get(id) || [])]);
    links = new Set(adjacency.links.get(id) || []);
  };
  if (activeId) around(activeId);
  else if (path) {
    nodes = new Set(path.ids);
    links = new Set(path.relationKeys);
  } else if (selectedId) around(selectedId);
  else if (citedIds.length) {
    nodes = new Set(citedIds);
    links = new Set();
  }

  const filtered = Boolean(entityType);
  const inFilter = node => !entityType || node.type === entityType;

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
    filtered,
    // 点亮的连线取这个节点的颜色；学习路径和 AI 引用没有中心节点。
    centerId: activeId || (path ? null : selectedId),
    selectedId,
    pathEnds: path ? new Set([path.ids[0], path.ids.at(-1)]) : new Set(),
  };
}
