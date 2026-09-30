const SVG_NS = "http://www.w3.org/2000/svg";

export const TYPE_COLORS = {
  concept: "#32a8c7",
  quantity: "#007aff",
  law: "#34c759",
  formula: "#af52de",
  method: "#ff9f0a",
  application: "#ff375f",
};

// 节点不超过此数量时使用大节点（名称写在圆内），否则用小节点（名称写在圆下方）。
const ROOMY_LIMIT = 14;
const ROOMY_SIZE = { width: 900, height: 430 };
const COMPACT_AREA_PER_NODE = 14500;   // 每个小节点分到的画布面积（世界坐标）
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function splitLabel(text, maxLength = 7) {
  if (text.length <= maxLength) return [text];
  const first = text.slice(0, maxLength);
  const rest = text.slice(maxLength);
  return [first, rest.length > maxLength ? `${rest.slice(0, maxLength - 1)}…` : rest];
}

/**
 * 力导向布局：节点互相排斥、关系像弹簧、并被吸向各自的锚点。
 * 全图按章节分成若干簇；局部图所有节点吸向画布中心，中心实体固定。
 * 初始位置与迭代过程完全确定，同一份数据每次画出来都一样。
 */
function computeLayout(graph, chapters, size, roomy) {
  const positions = new Map();
  const centerId = graph.center_id;
  const middle = { x: size.width / 2, y: size.height / 2 };
  // 只为图中实际出现的章节分配簇，避免筛选后节点挤在画布一角。
  const present = new Set(graph.entities.map(entity => entity.chapter_id));
  chapters = chapters.filter(chapter => present.has(chapter.id));
  const columns = Math.min(3, chapters.length);
  const rows = Math.ceil(chapters.length / columns) || 1;
  const anchorOf = entity => {
    if (centerId) return middle;
    const index = Math.max(0, chapters.findIndex(chapter => chapter.id === entity.chapter_id));
    return {
      x: size.width * ((index % columns) + 0.5) / columns,
      y: size.height * (Math.floor(index / columns) + 0.5) / rows,
    };
  };

  const nodes = graph.entities.map((entity, index) => {
    const anchor = anchorOf(entity);
    const angle = index * 2.4;
    const spread = 30 + 14 * Math.sqrt(index);
    return {
      id: entity.id,
      anchor,
      x: anchor.x + Math.cos(angle) * spread,
      y: anchor.y + Math.sin(angle) * spread,
      radius: roomy ? (entity.id === centerId ? 54 : 41) : (entity.id === centerId ? 19 : 13),
      fixed: entity.id === centerId,
    };
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const links = graph.relations
    .map(relation => [byId.get(relation.source_id), byId.get(relation.target_id)])
    .filter(([a, b]) => a && b);

  const gap = roomy ? 36 : 62;          // 两节点圆心的最小间距余量
  const restLength = roomy ? 150 : 95;
  for (let step = 0; step < 300; step += 1) {
    const cooling = 1 - step / 300;
    nodes.forEach(node => { node.fx = 0; node.fy = 0; });

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x || 0.01;
        const dy = b.y - a.y || 0.01;
        const distance = Math.hypot(dx, dy);
        const minimum = a.radius + b.radius + gap;
        const push = (distance < minimum ? (minimum - distance) * 0.6 : 0)
          + 1800 / (distance * distance);
        const ux = dx / distance;
        const uy = dy / distance;
        a.fx -= ux * push; a.fy -= uy * push;
        b.fx += ux * push; b.fy += uy * push;
      }
    }
    links.forEach(([a, b]) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 0.01;
      const pull = (distance - restLength) * 0.012;
      a.fx += (dx / distance) * pull; a.fy += (dy / distance) * pull;
      b.fx -= (dx / distance) * pull; b.fy -= (dy / distance) * pull;
    });
    nodes.forEach(node => {
      if (node.fixed) { node.x = middle.x; node.y = middle.y; return; }
      node.fx += (node.anchor.x - node.x) * 0.02;
      node.fy += (node.anchor.y - node.y) * 0.02;
      node.x += Math.max(-24, Math.min(24, node.fx)) * cooling;
      node.y += Math.max(-24, Math.min(24, node.fy)) * cooling;
      const margin = node.radius + 24;
      node.x = Math.max(margin, Math.min(size.width - margin, node.x));
      node.y = Math.max(margin, Math.min(size.height - margin, node.y));
    });
  }

  nodes.forEach(node => positions.set(node.id, node));
  return positions;
}

function edgeCoordinates(source, target, directed) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  return {
    x1: source.x + ux * (source.radius + 3),
    y1: source.y + uy * (source.radius + 3),
    x2: target.x - ux * (target.radius + (directed ? 8 : 3)),
    y2: target.y - uy * (target.radius + (directed ? 8 : 3)),
  };
}

// ---- 缩放与平移：所有图形放在一个 <g> 里，只改它的 transform ----

const views = new WeakMap();

function applyView(view) {
  view.layer.setAttribute("transform", `translate(${view.x} ${view.y}) scale(${view.k})`);
}

/** 让整幅图完整出现在容器中央。 */
function fitView(svg, view) {
  const { width, height } = svg.getBoundingClientRect();
  if (!width || !height) return;
  // 四周留白：左侧和顶部要让出缩放按钮与标题的位置。
  const pad = { left: 76, top: 72, right: 28, bottom: 48 };
  const room = { width: width - pad.left - pad.right, height: height - pad.top - pad.bottom };
  const { minX, minY, width: boxWidth, height: boxHeight } = view.bounds;
  view.k = Math.min(room.width / boxWidth, room.height / boxHeight, 1.8);
  view.x = pad.left + (room.width - boxWidth * view.k) / 2 - minX * view.k;
  view.y = pad.top + (room.height - boxHeight * view.k) / 2 - minY * view.k;
  applyView(view);
}

/** 以 (cx, cy)（svg 内的像素坐标）为不动点缩放。 */
function zoomAt(view, factor, cx, cy) {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.k * factor));
  view.x = cx - (cx - view.x) * (k / view.k);
  view.y = cy - (cy - view.y) * (k / view.k);
  view.k = k;
  applyView(view);
}

function bindInteractions(svg, view) {
  const local = event => {
    const rect = svg.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  svg.addEventListener("wheel", event => {
    event.preventDefault();
    zoomAt(view, Math.exp(-event.deltaY * 0.0015), ...local(event));
  }, { passive: false });

  let drag = null;
  svg.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.target.closest(".graph-node")) return;
    drag = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
    svg.setPointerCapture(event.pointerId);
    svg.parentElement.classList.add("panning");
  });
  svg.addEventListener("pointermove", event => {
    if (!drag) return;
    view.x = drag.vx + event.clientX - drag.x;
    view.y = drag.vy + event.clientY - drag.y;
    applyView(view);
  });
  const stop = () => { drag = null; svg.parentElement.classList.remove("panning"); };
  svg.addEventListener("pointerup", stop);
  svg.addEventListener("pointercancel", stop);
  svg.addEventListener("dblclick", event => {
    if (!event.target.closest(".graph-node")) fitView(svg, view);
  });
}

/** 返回该 svg 的缩放控制器，按钮可直接调用。 */
export function graphControls(svg) {
  const view = views.get(svg) || { layer: null };
  const center = () => {
    const rect = svg.getBoundingClientRect();
    return [rect.width / 2, rect.height / 2];
  };
  return {
    zoomBy: factor => view.layer && zoomAt(view, factor, ...center()),
    fit: () => view.layer && fitView(svg, view),
  };
}

/** 画布面积随节点数增长，长宽比跟随容器，这样适应窗口后图形能铺满。 */
function compactSize(svg, count) {
  const rect = svg.getBoundingClientRect();
  const aspect = rect.width && rect.height ? Math.min(1.9, Math.max(0.8, rect.width / rect.height)) : 1.5;
  const area = Math.max(count, 20) * COMPACT_AREA_PER_NODE;
  const width = Math.round(Math.sqrt(area * aspect));
  return { width, height: Math.round(width / aspect) };
}

export function renderGraph(svg, graph, options) {
  const { chapters, typeLabels, relationLabels, selectedId, onSelect } = options;
  svg.textContent = "";
  const roomy = graph.entities.length <= ROOMY_LIMIT;
  const size = roomy ? ROOMY_SIZE : compactSize(svg, graph.entities.length);
  const positions = computeLayout(graph, chapters, size, roomy);

  let view = views.get(svg);
  if (!view) {
    view = { k: 1, x: 0, y: 0, bounds: null, layer: null };
    views.set(svg, view);
    bindInteractions(svg, view);
    new ResizeObserver(() => fitView(svg, view)).observe(svg);
  }
  // 适应窗口时以节点实际占据的范围为准（含名称标签所需的余量）。
  const boxes = [...positions.values()];
  const margin = roomy ? 12 : 30;
  const minX = Math.min(...boxes.map(node => node.x - node.radius)) - margin;
  const minY = Math.min(...boxes.map(node => node.y - node.radius)) - margin;
  view.bounds = {
    minX,
    minY,
    width: Math.max(...boxes.map(node => node.x + node.radius)) + margin - minX,
    height: Math.max(...boxes.map(node => node.y + node.radius)) + margin - minY + (roomy ? 0 : 16),
  };

  const defs = svgElement("defs");
  const marker = svgElement("marker", {
    id: "edgeArrow",
    markerUnits: "userSpaceOnUse",
    markerWidth: "9",
    markerHeight: "9",
    refX: "8",
    refY: "4.5",
    orient: "auto",
  });
  marker.append(svgElement("path", { d: "M0 0 9 4.5 0 9Z", fill: "#8da9b5" }));
  defs.append(marker);
  svg.append(defs);
  const layer = svgElement("g");
  svg.append(layer);
  view.layer = layer;

  if (!graph.center_id) {
    // 全图：在每个章节簇的中心放一个淡淡的章节名，帮助定位。
    const groups = new Map();
    graph.entities.forEach(entity => {
      const position = positions.get(entity.id);
      const group = groups.get(entity.chapter_id) || { x: 0, y: 0, count: 0 };
      group.x += position.x; group.y += position.y; group.count += 1;
      groups.set(entity.chapter_id, group);
    });
    if (groups.size > 1) {
      groups.forEach((group, chapterId) => {
        const label = svgElement("text", { class: "chapter-label", x: group.x / group.count, y: group.y / group.count });
        label.textContent = chapters.find(chapter => chapter.id === chapterId)?.name || "";
        layer.append(label);
      });
    }
  }

  const edges = svgElement("g", { class: "graph-edges" });
  graph.relations.forEach(relation => {
    const source = positions.get(relation.source_id);
    const target = positions.get(relation.target_id);
    if (!source || !target) return;
    const directed = !["equivalent_to", "related_to"].includes(relation.type);
    const highlighted = selectedId && [relation.source_id, relation.target_id].includes(selectedId);
    const line = svgElement("line", {
      ...edgeCoordinates(source, target, directed),
      class: `graph-edge${highlighted ? " highlighted" : ""}`,
    });
    if (directed) line.setAttribute("marker-end", "url(#edgeArrow)");
    edges.append(line);

    if (highlighted) {
      const label = svgElement("text", {
        x: (source.x + target.x) / 2,
        y: (source.y + target.y) / 2 - 7,
        class: "graph-edge-label",
      });
      label.textContent = relationLabels[relation.type] || relation.type;
      edges.append(label);
    }
  });
  layer.append(edges);

  const nodes = svgElement("g", { class: "graph-nodes" });
  graph.entities.forEach(entity => {
    const position = positions.get(entity.id);
    const selected = entity.id === selectedId;
    const group = svgElement("g", {
      class: `graph-node${selected ? " selected" : ""}${roomy ? "" : " compact"}`,
      transform: `translate(${position.x} ${position.y})`,
      tabindex: "0",
      role: "button",
      "aria-label": `${entity.name}，${typeLabels[entity.type] || entity.type}`,
      style: `--node-color:${TYPE_COLORS[entity.type] || "#007aff"}`,
    });
    group.dataset.entityId = entity.id;
    if (selected) {
      group.append(svgElement("circle", { class: "node-halo", r: position.radius + 8 }));
    }
    group.append(svgElement("circle", { class: "node-surface", r: position.radius }));

    if (roomy) {
      const lines = splitLabel(entity.name, selected ? 8 : 7);
      lines.forEach((lineText, index) => {
        const line = svgElement("text", {
          class: "node-name",
          x: "0",
          y: lines.length === 1 ? "-2" : String(-10 + index * 15),
        });
        line.textContent = lineText;
        group.append(line);
      });
      const type = svgElement("text", {
        class: "node-type",
        x: "0",
        y: lines.length === 1 ? "17" : "24",
      });
      type.textContent = typeLabels[entity.type] || entity.type;
      group.append(type);
    } else {
      const name = svgElement("text", { class: "node-name", x: "0", y: String(position.radius + 14) });
      name.textContent = splitLabel(entity.name, 9)[0] + (entity.name.length > 9 ? "…" : "");
      group.append(name);
    }

    const title = svgElement("title");
    title.textContent = `${entity.name}：${entity.summary}`;
    group.append(title);

    const activate = () => onSelect(entity.id);
    group.addEventListener("click", activate);
    group.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
    nodes.append(group);
  });
  layer.append(nodes);
  fitView(svg, view);
}
