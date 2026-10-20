import { markRaw, reactive } from "vue";
import { chapterColor } from "./palette.js";

/**
 * 全页共享状态。图谱、面板、问答都读写这里，彼此不直接调用。
 *
 * 高亮优先级（graph/model.js 的 computeEmphasis 实现）：拖动 > 悬停 > 学习路径 > 选中知识点 > AI 回答引用。
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

  chapterId: null,              // 章节视图：只显示本章和直接相连的别章知识点，见 chapterView
  entityType: null,             // 聚焦的类型，其余类型变暗
  selectedId: null,
  path: null,                   // { title, ids, relationKeys }
  pathStartId: null,            // 学习路径表单里选好的起点和终点
  pathEndId: null,
  citedIds: [],                 // 最近一次 AI 回答实际引用的知识点
  // 右侧栏页签：detail | path | chat，null 为收起。宽屏默认打开 AI 助教；窄屏侧栏会挡住大半个图谱，默认收起。
  panel: window.matchMedia("(min-width: 901px)").matches ? "chat" : null,
  toast: "",
});

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
/** 知识点的显示颜色，即所属章节的颜色。 */
export const entityColor = id => chapterColor(chapterOf(store.entitiesById.get(id).chapter_id).order);

let toastTimer;
export function notify(message) {
  store.toast = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { store.toast = ""; }, 2200);
}

/**
 * 章节视图里显示的知识点：本章的全部（ids），加上和它们直接相连的别章知识点（ghosts）。
 * 很多前置知识在前面的章节，只显示本章的话图会断成几块，也看不出知识从哪来。
 */
export function chapterView(chapterId) {
  const ids = new Set(store.entities.filter(entity => entity.chapter_id === chapterId).map(entity => entity.id));
  const ghosts = new Set();
  store.relations.forEach(({ source_id: source, target_id: target }) => {
    if (ids.has(source) && !ids.has(target)) ghosts.add(target);
    if (ids.has(target) && !ids.has(source)) ghosts.add(source);
  });
  return { ids, ghosts };
}

/** 要看的知识点有不在当前章节视图里的，就退回全景，否则图上找不到它。 */
function leaveChapterIfHidden(targetIds) {
  if (!store.chapterId) return;
  const { ids, ghosts } = chapterView(store.chapterId);
  if (targetIds.every(id => ids.has(id) || ghosts.has(id))) return;
  store.chapterId = null;
  notify("不在当前章节，已回到全景");
}

export function selectEntity(id) {
  if (!store.entitiesById.has(id)) return;
  leaveChapterIfHidden([id]);
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

/** 从别章知识点的详情转到它所在的章节，保持选中。 */
export function enterChapterOf(id) {
  store.chapterId = store.entitiesById.get(id).chapter_id;
}

export function toggleType(type) {
  clearFocus();
  store.entityType = store.entityType === type ? null : type;
}

/** 在图谱里点亮 AI 回答引用的知识点；它的优先级低于路径和选中，所以先清掉这两者。 */
export function showCitations(ids) {
  clearFocus();
  leaveChapterIfHidden(ids);
  store.citedIds = ids;
}

/** 学习路径通常跨好几章，所以总是退回全景再显示。 */
export function showPath(result, startId, endId) {
  store.chapterId = null;
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
