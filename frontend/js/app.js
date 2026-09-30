import {
  loadApplicationData,
  loadLocalGraph,
  loadNeighbors,
  searchEntities,
} from "./api.js";
import { initializeChat } from "./chat.js";
import { renderGraph, TYPE_COLORS } from "./graph.js";
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
  $("#graphSummary").textContent = `${graph.entities.length} 个知识点 · ${graph.relations.length} 条关系`;
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
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chapter-button";
    button.dataset.chapterId = chapter.id;
    const index = document.createElement("span");
    index.className = "chapter-index";
    index.textContent = String(chapter.order).padStart(2, "0");
    const name = document.createElement("span");
    name.textContent = chapter.name;
    button.append(index, name);
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
    const button = document.createElement("button");
    button.type = "button";
    button.className = "type-button";
    button.dataset.entityType = type.value;
    button.style.setProperty("--type-color", TYPE_COLORS[type.value]);
    const dot = document.createElement("span");
    dot.className = "type-dot";
    const label = document.createElement("span");
    label.textContent = type.label;
    button.append(dot, label);
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
  element.textContent = "";
  values.forEach(value => {
    const item = document.createElement("li");
    item.textContent = value;
    element.append(item);
  });
}

function renderEntityDetail(entity) {
  $("#inspectorEmpty").hidden = true;
  $("#entityDetail").hidden = false;
  $("#entityType").textContent = `${state.typeLabels[entity.type] || entity.type} · ${chapterName(entity.chapter_id)}`;
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
      const button = document.createElement("button");
      button.type = "button";
      button.className = "neighbor-button";
      button.textContent = `${item.entity.name} · ${state.relationLabels[item.relation.type] || item.relation.type}`;
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
    const empty = document.createElement("div");
    empty.className = "search-result";
    empty.textContent = "没有找到相关知识点";
    container.append(empty);
  }
  results.forEach(result => {
    const entity = result.entity;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result";
    const name = document.createElement("strong");
    name.textContent = entity.name;
    const type = document.createElement("small");
    type.textContent = state.typeLabels[entity.type] || entity.type;
    const summary = document.createElement("small");
    summary.className = "result-summary";
    summary.textContent = entity.summary;
    button.append(name, type, summary);
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
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      input.focus();
    }
  });
}

function initializeAssistantResizer() {
  const workspace = $(".workspace");
  const resizer = $("#assistantResizer");
  const defaultHeight = 224;
  const minimumHeight = 180;
  let dragging = false;
  let startY = 0;
  let startHeight = defaultHeight;

  function maximumHeight() {
    return Math.min(560, Math.max(minimumHeight, workspace.clientHeight - 278));
  }

  function currentHeight() {
    return parseFloat(getComputedStyle(workspace).getPropertyValue("--assistant-height"))
      || defaultHeight;
  }

  function setHeight(value, persist = false) {
    const height = Math.round(Math.min(maximumHeight(), Math.max(minimumHeight, value)));
    workspace.style.setProperty("--assistant-height", `${height}px`);
    resizer.setAttribute("aria-valuenow", String(height));
    resizer.setAttribute("aria-valuemax", String(Math.round(maximumHeight())));
    if (persist) localStorage.setItem("ee-assistant-height", String(height));
  }

  const savedHeight = Number(localStorage.getItem("ee-assistant-height"));
  setHeight(Number.isFinite(savedHeight) && savedHeight > 0 ? savedHeight : defaultHeight);

  resizer.addEventListener("pointerdown", event => {
    dragging = true;
    startY = event.clientY;
    startHeight = currentHeight();
    resizer.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-panel");
  });
  resizer.addEventListener("pointermove", event => {
    if (dragging) setHeight(startHeight + startY - event.clientY);
  });
  resizer.addEventListener("pointerup", event => {
    if (!dragging) return;
    dragging = false;
    resizer.releasePointerCapture(event.pointerId);
    document.body.classList.remove("resizing-panel");
    setHeight(currentHeight(), true);
  });
  resizer.addEventListener("dblclick", () => setHeight(defaultHeight, true));
  resizer.addEventListener("keydown", event => {
    if (!["ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home"
      ? defaultHeight
      : currentHeight() + (event.key === "ArrowUp" ? 24 : -24);
    setHeight(next, true);
  });
  window.addEventListener("resize", () => setHeight(currentHeight()));
}

function initializeTheme() {
  const root = document.documentElement;
  const saved = localStorage.getItem("ee-theme");
  if (saved) root.dataset.theme = saved;
  $("#themeToggle").addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem("ee-theme", next);
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
  initializeAssistantResizer();
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
    if (state.selectedId) chat.ask(`请解释${entityName(state.selectedId)}，并说明它的关键点。`);
  });
  $("#resetView").addEventListener("click", resetGraph);
  $("#fitGraph").addEventListener("click", resetGraph);

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
    $("#knowledgeCount").textContent = `${health.counts.entities} 个知识点 · ${health.counts.relations} 条关系`;
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
