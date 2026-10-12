import { markRaw, reactive } from "vue";

/**
 * 全页共享状态。图谱、面板、问答都读写这里，彼此不直接调用。
 *
 * 高亮优先级（graph/emphasis.js 实现）：悬停 > 学习路径 > 选中知识点 > AI 回答引用。
 */
export const store = reactive({
  status: "loading",            // loading | online | offline
  error: "",
  course: "",
  counts: { entities: 0, relations: 0 },
  chapters: [],
  entities: [],
  relations: [],
  entitiesById: markRaw(new Map()),
  typeLabels: {},
  relationLabels: {},
  directedRelations: markRaw(new Set()),
  entityTypes: [],

  mode: readMode(),             // 3d | 2d
  chapterId: null,              // 聚焦的章节，其余章节变暗
  entityType: null,             // 聚焦的类型，其余类型变暗
  selectedId: null,
  path: null,                   // { title, ids, relationKeys }
  pathStartId: null,            // 学习路径表单里选好的起点和终点
  pathEndId: null,
  citedIds: [],                 // 最近一次 AI 回答实际引用的知识点
  panel: null,                  // detail | path | null
  toast: "",
});

function readMode() {
  try {
    return localStorage.getItem("ee-graph-mode") === "2d" ? "2d" : "3d";
  } catch {
    return "3d"; // 存储不可用时用默认值，不影响功能。
  }
}

export function setMode(mode) {
  store.mode = mode;
  try { localStorage.setItem("ee-graph-mode", mode); } catch { /* 只是不记住选择。 */ }
}

export const relationKey = relation => `${relation.source_id}|${relation.target_id}|${relation.type}`;

export function loadInto({ health, meta, chapters, graph }) {
  store.course = meta.course.name;
  store.chapters = chapters;
  store.entities = graph.entities;
  store.relations = graph.relations;
  store.entitiesById = markRaw(new Map(graph.entities.map(entity => [entity.id, entity])));
  store.entityTypes = meta.entity_types;
  store.typeLabels = Object.fromEntries(meta.entity_types.map(type => [type.value, type.label]));
  store.relationLabels = Object.fromEntries(meta.relation_types.map(type => [type.value, type.label]));
  store.directedRelations = markRaw(new Set(
    meta.relation_types.filter(type => type.directed).map(type => type.value),
  ));
  store.counts = health.counts;
  store.status = "online";
}

export const entityName = id => store.entitiesById.get(id)?.name || id;
export const chapterOf = id => store.chapters.find(chapter => chapter.id === id);

let toastTimer;
export function notify(message) {
  store.toast = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { store.toast = ""; }, 2200);
}

export function selectEntity(id) {
  if (!store.entitiesById.has(id)) return;
  store.selectedId = id;
  store.path = null;
  store.citedIds = [];
  store.panel = "detail";
}

export function clearSelection() {
  store.selectedId = null;
  store.citedIds = [];
  if (store.panel === "detail") store.panel = null;
}

// 聚焦章节或类型时清掉选中和路径，否则它们的高亮优先级更高，聚焦看不出效果。
function clearFocus() {
  store.selectedId = null;
  store.path = null;
  store.citedIds = [];
  if (store.panel === "detail") store.panel = null;
}

export function toggleChapter(id) {
  clearFocus();
  store.chapterId = store.chapterId === id ? null : id;
}

export function toggleType(type) {
  clearFocus();
  store.entityType = store.entityType === type ? null : type;
}

/** 在星图里点亮 AI 回答引用的知识点；它的优先级低于路径和选中，所以先清掉这两者。 */
export function showCitations(ids) {
  clearFocus();
  store.citedIds = ids;
}

export function showPath(result, startId, endId) {
  store.selectedId = null;
  store.citedIds = [];
  store.path = {
    title: `从「${entityName(startId)}」到「${entityName(endId)}」`,
    ids: result.entities.map(entity => entity.id),
    relationKeys: result.relations.map(relationKey),
  };
}

export function resetView() {
  store.chapterId = null;
  store.entityType = null;
  store.selectedId = null;
  store.path = null;
  store.citedIds = [];
  store.panel = null;
}
