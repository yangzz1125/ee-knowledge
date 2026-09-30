import {
  loadApplicationData,
  loadLocalGraph,
  loadNeighbors,
  searchEntities,
} from "./api.js";
import { initializeChat } from "./chat.js";
import { graphControls, renderGraph, TYPE_COLORS } from "./graph.js";
import { renderFormula } from "./math.js";

const $ = selector => document.querySelector(selector);
const state = {
  chapters: [],
  fullGraph: { entities: [], relations: [] },
  visibleGraph: { entities: [], relations: [] },
  entitiesById: new Map(),
  typeLabels: {},
  relationLabels: {},
  chapterId: null,
  entityType: null,
  selectedId: null,
  localMode: false,
};

/** 创建带 class 和文字的元素。 */
function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

let toastTimer;
function notify(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function setServiceState(status, label) {
  const element = $("#serviceState");
  element.classList.remove("online", "offline");
  if (status) element.classList.add(status);
  element.querySelector("span:last-child").textContent = label;
}

function chapterName(chapterId) {
  return state.chapters.find(chapter => chapter.id === chapterId)?.name || chapterId;
}

function entityName(entityId) {
  return state.entitiesById.get(entityId)?.name || entityId;
}

function filteredGraph() {
  const entities = state.fullGraph.entities.filter(entity =>
    (!state.chapterId || entity.chapter_id === state.chapterId)
    && (!state.entityType || entity.type === state.entityType)
  );
  const ids = new Set(entities.map(entity => entity.id));
  return {
    center_id: null,
    entities,
    relations: state.fullGraph.relations.filter(relation =>
      ids.has(relation.source_id) && ids.has(relation.target_id)
    ),
  };
}

function updateGraphHeading(graph) {
  const context = state.localMode && state.selectedId
    ? `围绕「${entityName(state.selectedId)}」`
    : state.chapterId
      ? chapterName(state.chapterId)
      : "完整课程";
  $("#graphContext").textContent = context;
  // 进入局部图或做了筛选后，给出回到完整图谱的入口。
  $("#backToAll").hidden = !(state.localMode || state.chapterId || state.entityType);
  $("#graphSummary").textContent = `${graph.entities.length} 个知识点，${graph.relations.length} 条关系`;
}

function drawGraph(graph = state.visibleGraph) {
  state.visibleGraph = graph;
  $("#graphEmpty").hidden = graph.entities.length > 0;
  $("#knowledgeGraph").hidden = graph.entities.length === 0;
  renderGraph($("#knowledgeGraph"), graph, {
    chapters: state.chapters,
    typeLabels: state.typeLabels,
    relationLabels: state.relationLabels,
    selectedId: state.selectedId,
    onSelect: selectEntity,
  });
  updateGraphHeading(graph);
}

function showFilteredGraph() {
  state.localMode = false;
  drawGraph(filteredGraph());
}

function renderChapters() {
  const container = $("#chapterList");
  container.textContent = "";
  state.chapters.forEach(chapter => {
    const button = el("button", "chapter-button");
    button.type = "button";
    button.dataset.chapterId = chapter.id;
    const count = state.fullGraph.entities.filter(entity => entity.chapter_id === chapter.id).length;
    button.append(
      el("span", "chapter-index", String(chapter.order).padStart(2, "0")),
      el("span", "", chapter.name),
      el("span", "chapter-count", String(count)),
    );
    button.addEventListener("click", () => {
      state.chapterId = state.chapterId === chapter.id ? null : chapter.id;
      state.selectedId = null;
      updateActiveFilters();
      clearInspector();
      showFilteredGraph();
    });
    container.append(button);
  });
}

function renderTypes(types) {
  const container = $("#typeList");
  container.textContent = "";
  types.forEach(type => {
    const button = el("button", "type-button");
    button.type = "button";
    button.dataset.entityType = type.value;
    button.style.setProperty("--type-color", TYPE_COLORS[type.value]);
    button.append(el("span", "type-dot"), el("span", "", type.label));
    button.addEventListener("click", () => {
      state.entityType = state.entityType === type.value ? null : type.value;
      updateActiveFilters();
      showFilteredGraph();
    });
    container.append(button);
  });
}

function updateActiveFilters() {
  document.querySelectorAll(".chapter-button").forEach(button => {
    button.classList.toggle("active", button.dataset.chapterId === state.chapterId);
  });
  document.querySelectorAll(".type-button").forEach(button => {
    button.classList.toggle("active", button.dataset.entityType === state.entityType);
  });
}

function clearInspector() {
  $("#inspectorEmpty").hidden = false;
  $("#entityDetail").hidden = true;
  $("#assistantContext").textContent = "回答只依据当前知识图谱";
}

function setList(element, values) {
  element.replaceChildren(...values.map(value => el("li", "", value)));
}

function renderEntityDetail(entity) {
  $("#inspectorEmpty").hidden = true;
  $("#entityDetail").hidden = false;
  $("#entityType").textContent = `${state.typeLabels[entity.type] || entity.type}，${chapterName(entity.chapter_id)}`;
  $("#entityName").textContent = entity.name;
  $("#entitySummary").textContent = entity.summary;
  $("#assistantContext").textContent = `当前上下文：${entity.name}`;

  const formula = entity.details.plain_text || (entity.details.symbol
    ? `${entity.details.symbol}${entity.details.unit ? ` · ${entity.details.unit}` : ""}`
    : "");
  const latex = entity.details.latex || "";
  $("#formulaSection").hidden = !formula && !latex;
  renderFormula($("#entityFormula"), latex, formula);

  const definition = entity.details.definition
    || entity.details.purpose
    || entity.details.scenario
    || "";
  $("#definitionSection").hidden = !definition;
  $("#entityDefinition").textContent = definition;

  $("#conditionsSection").hidden = entity.conditions.length === 0;
  setList($("#entityConditions"), entity.conditions);
}

async function renderNeighbors(entityId) {
  const container = $("#neighborList");
  container.innerHTML = '<span class="muted">正在载入</span>';
  try {
    const result = await loadNeighbors(entityId);
    container.textContent = "";
    if (!result.items.length) {
      container.innerHTML = '<span class="muted">暂无直接关联</span>';
      return;
    }
    result.items.forEach(item => {
      const label = state.relationLabels[item.relation.type] || item.relation.type;
      const button = el("button", "neighbor-button", `${item.entity.name} · ${label}`);
      button.type = "button";
      button.addEventListener("click", () => selectEntity(item.entity.id));
      container.append(button);
    });
  } catch (error) {
    container.innerHTML = `<span class="muted">${error.message}</span>`;
  }
}

async function selectEntity(entityId) {
  const entity = state.entitiesById.get(entityId);
  if (!entity) return;
  state.selectedId = entityId;
  renderEntityDetail(entity);
  renderNeighbors(entityId);
  drawGraph(state.visibleGraph);
  try {
    const localGraph = await loadLocalGraph(entityId, 2);
    state.localMode = true;
    drawGraph(localGraph);
  } catch (error) {
    notify(error.message);
  }
}

function renderSearchResults(results) {
  const container = $("#searchResults");
  container.textContent = "";
  if (!results.length) {
    container.append(el("div", "search-result", "没有找到相关知识点"));
  }
  results.forEach(result => {
    const entity = result.entity;
    const button = el("button", "search-result");
    button.type = "button";
    button.append(
      el("strong", "", entity.name),
      el("small", "", state.typeLabels[entity.type] || entity.type),
      el("small", "result-summary", entity.summary),
    );
    button.addEventListener("click", () => {
      container.hidden = true;
      $("#searchInput").value = entity.name;
      selectEntity(entity.id);
    });
    container.append(button);
  });
  container.hidden = false;
}

function initializeSearch() {
  const input = $("#searchInput");
  let timer;
  async function runSearch() {
    const keyword = input.value.trim();
    if (!keyword) {
      $("#searchResults").hidden = true;
      return;
    }
    try {
      renderSearchResults(await searchEntities(keyword));
    } catch (error) {
      notify(error.message);
    }
  }
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(runSearch, 180);
  });
  $("#searchForm").addEventListener("submit", event => {
    event.preventDefault();
    runSearch();
  });
  document.addEventListener("click", event => {
    if (!event.target.closest("#searchForm")) $("#searchResults").hidden = true;
  });
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && !event.target.closest("input, textarea") && !$("#backToAll").hidden) {
      resetGraph();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      input.focus();
    }
  });
}

function showTab(name) {
  ["Detail", "Chat"].forEach(suffix => {
    const active = suffix.toLowerCase() === name;
    $(`#tab${suffix}`).classList.toggle("active", active);
    $(`#tab${suffix}`).setAttribute("aria-selected", String(active));
    $(`#${suffix.toLowerCase()}Pane`).hidden = !active;
  });
}

/** 拖动图谱两侧的边框调整左右栏宽度，宽度记在本地。 */
function initializeColumnResizers() {
  const shell = $(".shell");
  const columns = [
    { handle: $("#railResizer"), variable: "--rail-w", key: "ee-rail-width", fallback: 232, min: 180, max: 380, sign: 1 },
    { handle: $("#panelResizer"), variable: "--panel-w", key: "ee-panel-width", fallback: 360, min: 280, max: 640, sign: -1 },
  ];

  columns.forEach(column => {
    const { handle, variable, key, fallback, min, max, sign } = column;
    const current = () => parseFloat(getComputedStyle(shell).getPropertyValue(variable)) || fallback;
    const set = (value, persist = false) => {
      const width = Math.round(Math.min(max, Math.max(min, value)));
      shell.style.setProperty(variable, `${width}px`);
      handle.setAttribute("aria-valuenow", String(width));
      if (persist) {
        try { localStorage.setItem(key, String(width)); } catch { /* 忽略 */ }
      }
    };

    let saved = 0;
    try { saved = Number(localStorage.getItem(key)); } catch { /* 忽略 */ }
    set(saved > 0 ? saved : fallback);

    let start = null;
    handle.addEventListener("pointerdown", event => {
      start = { x: event.clientX, width: current() };
      handle.setPointerCapture(event.pointerId);
      handle.classList.add("active");
      document.body.classList.add("resizing-cols");
    });
    handle.addEventListener("pointermove", event => {
      if (start) set(start.width + sign * (event.clientX - start.x));
    });
    const stop = () => {
      if (!start) return;
      start = null;
      handle.classList.remove("active");
      document.body.classList.remove("resizing-cols");
      set(current(), true);
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
    handle.addEventListener("dblclick", () => set(fallback, true));
    handle.addEventListener("keydown", event => {
      const step = { ArrowLeft: -16, ArrowRight: 16 }[event.key];
      if (!step) return;
      event.preventDefault();
      set(current() + sign * step, true);
    });
  });
}

function initializeTheme() {
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem("ee-theme"); } catch { /* 存储不可用时不记忆主题。 */ }
  if (saved) root.dataset.theme = saved;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  $("#themeToggle").addEventListener("click", () => {
    const isDark = (root.dataset.theme || (systemDark.matches ? "dark" : "light")) === "dark";
    const next = isDark ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("ee-theme", next); } catch { /* 忽略 */ }
  });
}

function resetGraph() {
  state.chapterId = null;
  state.entityType = null;
  state.selectedId = null;
  state.localMode = false;
  updateActiveFilters();
  clearInspector();
  drawGraph(state.fullGraph);
}

async function start() {
  initializeTheme();
  initializeColumnResizers();
  initializeSearch();

  const chat = initializeChat({
    form: $("#chatForm"),
    input: $("#chatInput"),
    sendButton: $("#sendButton"),
    conversation: $("#conversation"),
    clearButton: $("#clearConversation"),
    getContextEntityId: () => state.selectedId,
    entityName,
    notify,
  });
  $("#askAboutEntity").addEventListener("click", () => {
    if (!state.selectedId) return;
    showTab("chat");
    chat.ask(`请解释${entityName(state.selectedId)}，并说明它的关键点。`);
  });
  $("#tabDetail").addEventListener("click", () => showTab("detail"));
  $("#tabChat").addEventListener("click", () => showTab("chat"));
  $("#resetView").addEventListener("click", resetGraph);
  $("#backToAll").addEventListener("click", resetGraph);
  const controls = graphControls($("#knowledgeGraph"));
  $("#zoomIn").addEventListener("click", () => controls.zoomBy(1.3));
  $("#zoomOut").addEventListener("click", () => controls.zoomBy(1 / 1.3));
  $("#fitGraph").addEventListener("click", controls.fit);

  try {
    const { health, meta, chapters, graph } = await loadApplicationData();
    state.chapters = chapters;
    state.fullGraph = graph;
    state.visibleGraph = graph;
    state.entitiesById = new Map(graph.entities.map(entity => [entity.id, entity]));
    state.typeLabels = Object.fromEntries(meta.entity_types.map(type => [type.value, type.label]));
    state.relationLabels = Object.fromEntries(meta.relation_types.map(type => [type.value, type.label]));
    chat.refreshReferences();

    renderChapters();
    renderTypes(meta.entity_types);
    drawGraph(graph);
    $("#knowledgeCount").textContent = `${health.counts.entities} 个知识点，${health.counts.relations} 条关系`;
    setServiceState("online", "知识库已连接");
  } catch (error) {
    setServiceState("offline", "后端未连接");
    $("#graphEmpty").hidden = false;
    $("#knowledgeGraph").hidden = true;
    $("#graphEmpty strong").textContent = "无法连接知识库";
    $("#graphEmpty span").textContent = "请确认 FastAPI 正在 127.0.0.1:8000 运行。";
    notify(error.message);
  }
}

start();
