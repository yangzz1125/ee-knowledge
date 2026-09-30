import {
  findPath,
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
  pathTitle: null,
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
  const context = state.pathTitle
    ? state.pathTitle
    : state.localMode && state.selectedId
    ? `围绕「${entityName(state.selectedId)}」`
    : state.chapterId
      ? chapterName(state.chapterId)
      : "完整课程";
  $("#graphContext").textContent = context;
  // 进入局部图或做了筛选后，给出回到完整图谱的入口。
  $("#backToAll").hidden = !(state.pathTitle || state.localMode || state.chapterId || state.entityType);
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
  state.pathTitle = null;
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

  const variables = entity.details.variables || [];
  $("#variablesSection").hidden = variables.length === 0;
  $("#entityVariables").replaceChildren(...variables.map(variable => {
    const row = el("tr");
    const meaning = el("td");
    const name = variable.quantity_id && state.entitiesById.has(variable.quantity_id)
      ? el("button", "link-button", variable.name)
      : el("span", "", variable.name);
    if (name.tagName === "BUTTON") {
      name.type = "button";
      name.addEventListener("click", () => selectEntity(variable.quantity_id));
    }
    meaning.append(name, el("small", "", variable.description));
    row.append(el("td", "symbol", variable.symbol), meaning, el("td", "unit", variable.unit || "—"));
    return row;
  }));
}

const ARROWS = { outgoing: "→", incoming: "←", undirected: "↔" };

/** 把邻居分成前置知识、后续知识和其他关联三组。 */
async function renderNeighbors(entityId) {
  const container = $("#neighborSections");
  container.replaceChildren(el("span", "muted", "正在载入"));
  try {
    const result = await loadNeighbors(entityId);
    if (state.selectedId !== entityId) return;
    const groups = [
      { title: "前置知识", hint: "学这个之前要先掌握", items: [] },
      { title: "后续知识", hint: "学完可以继续学", items: [] },
      { title: "其他关联", hint: "", items: [] },
    ];
    result.items.forEach(item => {
      const isPrerequisite = item.relation.type === "prerequisite";
      const group = isPrerequisite && item.direction === "incoming"
        ? groups[0]
        : isPrerequisite && item.direction === "outgoing" ? groups[1] : groups[2];
      group.items.push(item);
    });

    const blocks = groups.filter(group => group.items.length).map(group => {
      const block = el("div", "neighbor-group");
      const heading = el("h3", "", group.title);
      if (group.hint) heading.append(el("small", "", group.hint));
      const list = el("div", "neighbor-list");
      group.items.forEach(item => {
        const button = el("button", "neighbor-button");
        button.type = "button";
        button.style.setProperty("--type-color", TYPE_COLORS[item.entity.type]);
        button.append(el("span", "type-dot"), el("span", "", item.entity.name));
        if (group !== groups[0] && group !== groups[1]) {
          const label = state.relationLabels[item.relation.type] || item.relation.type;
          button.append(el("small", "", `${ARROWS[item.direction]} ${label}`));
        }
        button.title = item.relation.description;
        button.addEventListener("click", () => selectEntity(item.entity.id));
        list.append(button);
      });
      block.append(heading, list);
      return block;
    });
    container.replaceChildren(...(blocks.length ? blocks : [el("span", "muted", "暂无直接关联")]));
  } catch (error) {
    container.replaceChildren(el("span", "muted", error.message));
  }
}

async function selectEntity(entityId) {
  const entity = state.entitiesById.get(entityId);
  if (!entity) return;
  state.selectedId = entityId;
  state.pathTitle = null;
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
  ["Detail", "Path", "Chat"].forEach(suffix => {
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

// ---- 学习路径 ----

/** 带下拉候选的知识点选择框；选中的实体 ID 记在 input.dataset.entityId。 */
function initializePicker(input) {
  const results = input.parentElement.querySelector(".picker-results");
  const choose = entity => {
    input.value = entity.name;
    input.dataset.entityId = entity.id;
    results.hidden = true;
  };
  input.addEventListener("input", () => {
    delete input.dataset.entityId;
    const keyword = input.value.trim().toLowerCase();
    if (!keyword) { results.hidden = true; return; }
    const matches = state.fullGraph.entities.filter(entity =>
      entity.name.toLowerCase().includes(keyword)
      || entity.aliases.some(alias => alias.toLowerCase().includes(keyword))
    ).slice(0, 8);
    results.replaceChildren(...(matches.length ? matches.map(entity => {
      const button = el("button", "picker-option");
      button.type = "button";
      button.style.setProperty("--type-color", TYPE_COLORS[entity.type]);
      button.append(el("span", "type-dot"), el("span", "", entity.name), el("small", "", chapterName(entity.chapter_id)));
      button.addEventListener("click", () => choose(entity));
      return button;
    }) : [el("div", "picker-empty", "没有匹配的知识点")]));
    results.hidden = false;
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !results.hidden) {
      const first = results.querySelector(".picker-option");
      if (first) { event.preventDefault(); first.click(); }
    }
    if (event.key === "Escape") results.hidden = true;
  });
  document.addEventListener("click", event => {
    if (!input.parentElement.contains(event.target)) results.hidden = true;
  });
  return { set: id => choose(state.entitiesById.get(id)) };
}

function fillPathPicker(picker, entityId) {
  picker.set(entityId);
  showTab("path");
}

function renderPathResult(result, undirected) {
  const container = $("#pathResult");
  if (!result.found) {
    const box = el("div", "path-empty");
    box.append(el("strong", "", "没有找到路径"), el("p", "", result.message || ""));
    if (!undirected) {
      const retry = el("button", "quiet-button", "忽略方向再找一次");
      retry.type = "button";
      retry.addEventListener("click", () => {
        $("#pathUndirected").checked = true;
        $("#pathForm").requestSubmit();
      });
      box.append(retry);
    }
    container.replaceChildren(box);
    return;
  }

  const steps = el("ol", "path-steps");
  result.entities.forEach((entity, index) => {
    const node = el("li", "path-node");
    const button = el("button", "path-entity");
    button.type = "button";
    button.style.setProperty("--type-color", TYPE_COLORS[entity.type]);
    button.append(
      el("span", "type-dot"),
      el("span", "", entity.name),
      el("small", "", state.typeLabels[entity.type] || entity.type),
    );
    button.addEventListener("click", () => selectEntity(entity.id));
    node.append(button);
    steps.append(node);

    const relation = result.relations[index];
    if (relation) {
      const reversed = relation.source_id !== entity.id;
      const link = el("li", `path-link${reversed ? " reversed" : ""}`);
      const label = state.relationLabels[relation.type] || relation.type;
      link.append(
        el("span", "path-relation", reversed ? `${label}（反向）` : label),
        el("small", "", relation.description),
      );
      steps.append(link);
    }
  });
  const summary = el("p", "path-summary",
    result.relations.length ? `共 ${result.relations.length} 步` : "起点和终点是同一个知识点");
  container.replaceChildren(summary, steps);
}

function initializePath() {
  const start = initializePicker($("#pathStart"));
  const end = initializePicker($("#pathEnd"));

  $("#setPathStart").addEventListener("click", () => state.selectedId && fillPathPicker(start, state.selectedId));
  $("#setPathEnd").addEventListener("click", () => state.selectedId && fillPathPicker(end, state.selectedId));
  $("#swapPath").addEventListener("click", () => {
    const [a, b] = [$("#pathStart").dataset.entityId, $("#pathEnd").dataset.entityId];
    if (b) start.set(b); else { $("#pathStart").value = ""; delete $("#pathStart").dataset.entityId; }
    if (a) end.set(a); else { $("#pathEnd").value = ""; delete $("#pathEnd").dataset.entityId; }
  });

  $("#pathForm").addEventListener("submit", async event => {
    event.preventDefault();
    const startId = $("#pathStart").dataset.entityId;
    const endId = $("#pathEnd").dataset.entityId;
    if (!startId || !endId) {
      notify("请从候选列表中选择起点和终点");
      return;
    }
    const undirected = $("#pathUndirected").checked;
    try {
      const result = await findPath(startId, endId, undirected);
      renderPathResult(result, undirected);
      if (result.found) {
        state.selectedId = null;
        state.localMode = false;
        state.pathTitle = `从「${entityName(startId)}」到「${entityName(endId)}」`;
        drawGraph({
          center_id: null,
          path_ids: result.entities.map(entity => entity.id),
          entities: result.entities,
          relations: result.relations,
        });
      }
    } catch (error) {
      notify(error.message);
    }
  });
}

function resetGraph() {
  state.pathTitle = null;
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
  $("#tabPath").addEventListener("click", () => showTab("path"));
  initializePath();
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
