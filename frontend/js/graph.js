const SVG_NS = "http://www.w3.org/2000/svg";

// 在深色画布上发光的六种类型色，亮度接近，只靠色相区分。
export const TYPE_COLORS = {
  concept: "#5ad1e6",
  quantity: "#7aa2ff",
  law: "#6fdc9a",
  formula: "#c792ff",
  method: "#ffc266",
  application: "#ff8a9a",
};

// 节点不超过此数量时使用大节点（名称写在圆内），否则用小节点（名称写在圆下方）。
const ROOMY_LIMIT = 14;
const ROOMY_SIZE = { width: 1100, height: 640 };
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

  // 路径：按顺序从左到右排成一条起伏的线，不做力模拟。
  if (graph.path_ids) {
    const count = graph.path_ids.length;
    const step = 220;
    const left = middle.x - (step * (count - 1)) / 2;
    graph.path_ids.forEach((id, index) => {
      positions.set(id, {
        id,
        x: left + index * step,
        y: middle.y + (index % 2 ? 50 : -50) * (count > 2 ? 1 : 0),
        radius: 30,
      });
    });
    return positions;
  }

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
  const restLength = roomy ? 200 : 95;
  const anchorPull = centerId ? 0.006 : 0.02;
  const springPull = centerId ? 0.03 : 0.012;
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
      const pull = (distance - restLength) * springPull;
      a.fx += (dx / distance) * pull; a.fy += (dy / distance) * pull;
      b.fx -= (dx / distance) * pull; b.fy -= (dy / distance) * pull;
    });
    nodes.forEach(node => {
      if (node.fixed) { node.x = middle.x; node.y = middle.y; return; }
      node.fx += (node.anchor.x - node.x) * anchorPull;
      node.fy += (node.anchor.y - node.y) * anchorPull;
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

/** 两点间的轻微弧线，起止点让出节点半径，避免线压在圆上。 */
function edgePath(source, target, sourceRadius, targetRadius) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  const bend = Math.min(40, length * 0.12);
  const cx = (source.x + target.x) / 2 - (dy / length) * bend;
  const cy = (source.y + target.y) / 2 + (dx / length) * bend;
  const trim = (from, radius) => {
    const ex = cx - from.x;
    const ey = cy - from.y;
    const d = Math.hypot(ex, ey) || 1;
    return [from.x + (ex / d) * radius, from.y + (ey / d) * radius];
  };
  const [x1, y1] = trim(source, sourceRadius + 3);
  const [x2, y2] = trim(target, targetRadius + 4);
  return {
    d: `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`,
    // t 处的曲线坐标，用来放关系名称。
    at: t => [
      (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t * t * x2,
      (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t * t * y2,
    ],
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
  view.k = Math.min(room.width / boxWidth, room.height / boxHeight, 1.25);
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

  // 画出来的圆点比布局时预留的小，连接越多的节点越大。
  const degree = new Map();
  graph.relations.forEach(({ source_id: a, target_id: b }) => {
    degree.set(a, (degree.get(a) || 0) + 1);
    degree.set(b, (degree.get(b) || 0) + 1);
  });
  const dotRadius = id => {
    if (id === graph.center_id) return roomy ? 20 : 13;
    if (graph.path_ids && (id === graph.path_ids[0] || id === graph.path_ids.at(-1))) return 18;
    const base = roomy ? 12 : 6;
    return base + Math.min(5, Math.sqrt(degree.get(id) || 0) * 1.6);
  };

  // 适应窗口时以节点实际占据的范围为准（含名称标签所需的余量）。
  const boxes = [...positions.values()];
  const margin = roomy ? 40 : 34;
  const minX = Math.min(...boxes.map(node => node.x)) - margin - 30;
  const minY = Math.min(...boxes.map(node => node.y)) - margin;
  view.bounds = {
    minX,
    minY,
    width: Math.max(...boxes.map(node => node.x)) + margin + 30 - minX,
    height: Math.max(...boxes.map(node => node.y)) + margin + 16 - minY,
  };

  const defs = svgElement("defs");
  [["edgeArrow", "arrow"], ["edgeArrowLit", "arrow lit"]].forEach(([id, className]) => {
    const marker = svgElement("marker", {
      id,
      markerUnits: "userSpaceOnUse",
      markerWidth: "8",
      markerHeight: "8",
      refX: "7",
      refY: "4",
      orient: "auto",
    });
    marker.append(svgElement("path", { d: "M0 0.5 7 4 0 7.5Z", class: className }));
    defs.append(marker);
  });
  svg.append(defs);
  const layer = svgElement("g");
  svg.append(layer);
  view.layer = layer;

  if (!graph.center_id && !graph.path_ids) {
    // 全图：每个章节簇画一块淡淡的区域，章节名写在区域上方。
    const groups = new Map();
    graph.entities.forEach(entity => {
      const list = groups.get(entity.chapter_id) || [];
      list.push(positions.get(entity.id));
      groups.set(entity.chapter_id, list);
    });
    if (groups.size > 1) {
      const regions = svgElement("g", { class: "chapter-regions" });
      groups.forEach((points, chapterId) => {
        const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
        const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
        const r = Math.max(...points.map(p => Math.hypot(p.x - cx, p.y - cy))) + 42;
        regions.append(svgElement("circle", { class: "chapter-region", cx, cy, r }));
        const label = svgElement("text", { class: "chapter-label", x: cx, y: cy - r + 22 });
        label.textContent = chapters.find(chapter => chapter.id === chapterId)?.name || "";
        regions.append(label);
      });
      layer.append(regions);
    }
  }

  // 节点圆点和名称占据的位置，用来给关系名称找空地。
  const occupied = [];
  graph.entities.forEach(entity => {
    const { x, y } = positions.get(entity.id);
    const r = dotRadius(entity.id);
    occupied.push([x, y], [x, y + r + (roomy ? 14 : 10)]);
  });
  const clearance = ([lx, ly]) => Math.min(...occupied.map(([x, y]) => Math.hypot((lx - x) / 60, (ly - y) / 16)));

  /** 沿曲线挑一个离节点和名字最远的位置放关系名称。 */
  const labelPoint = at => {
    let best = at(0.5);
    let bestScore = clearance(best);
    for (let t = 0.25; t <= 0.75; t += 0.05) {
      const point = at(t);
      const score = clearance(point) - Math.abs(t - 0.5) * 0.3;
      if (score > bestScore) { best = point; bestScore = score; }
    }
    return best;
  };

  const edgeItems = [];
  const edges = svgElement("g", { class: "graph-edges" });
  const edgeLabels = svgElement("g", { class: "graph-edge-labels" });
  graph.relations.forEach(relation => {
    const source = positions.get(relation.source_id);
    const target = positions.get(relation.target_id);
    if (!source || !target) return;
    const directed = !["equivalent_to", "related_to"].includes(relation.type);
    const highlighted = Boolean(graph.path_ids) || (Boolean(selectedId)
      && [relation.source_id, relation.target_id].includes(selectedId));
    const { d, at } = edgePath(
      source, target, dotRadius(relation.source_id), dotRadius(relation.target_id),
    );
    const path = svgElement("path", {
      d,
      class: `graph-edge${highlighted ? " highlighted" : ""}${directed ? "" : " undirected"}`,
    });
    const setArrow = lit => {
      if (directed) path.setAttribute("marker-end", `url(#${lit ? "edgeArrowLit" : "edgeArrow"})`);
    };
    setArrow(highlighted);
    edges.append(path);

    // 每条关系都准备好名称：选中节点的关系常显，其余只在悬停时出现。
    const [lx, ly] = labelPoint(at);
    const label = svgElement("text", {
      x: lx,
      y: ly - 4,
      class: `graph-edge-label${highlighted ? " highlighted" : ""}`,
    });
    label.textContent = relationLabels[relation.type] || relation.type;
    edgeLabels.append(label);

    edgeItems.push({ relation, path, label, highlighted, setArrow });
  });
  layer.append(edges);

  // 悬停时只突出该节点及其直接关联（连线、箭头、关系名称），其余全部变暗。
  const nodeElements = new Map();
  const focus = id => {
    svg.classList.toggle("focusing", Boolean(id));
    const related = new Set(id ? [id] : []);
    edgeItems.forEach(({ relation, path, label, highlighted, setArrow }) => {
      const lit = Boolean(id) && (relation.source_id === id || relation.target_id === id);
      path.classList.toggle("lit", lit);
      label.classList.toggle("lit", lit);
      setArrow(lit || (!id && highlighted));
      if (lit) { related.add(relation.source_id); related.add(relation.target_id); }
    });
    nodeElements.forEach((element, nodeId) => element.classList.toggle("lit", related.has(nodeId)));
  };

  const nodes = svgElement("g", { class: "graph-nodes" });
  graph.entities.forEach(entity => {
    const position = positions.get(entity.id);
    const selected = entity.id === selectedId;
    const radius = dotRadius(entity.id);
    const group = svgElement("g", {
      class: `graph-node${selected ? " selected" : ""}${roomy ? " roomy" : ""}`,
      transform: `translate(${position.x} ${position.y})`,
      tabindex: "0",
      role: "button",
      "aria-label": `${entity.name}，${typeLabels[entity.type] || entity.type}`,
      style: `--node-color:${TYPE_COLORS[entity.type] || "#7aa2ff"}`,
    });
    group.dataset.entityId = entity.id;
    if (selected) group.append(svgElement("circle", { class: "node-halo", r: radius + 7 }));
    group.append(svgElement("circle", { class: "node-glow", r: radius + 5 }));
    group.append(svgElement("circle", { class: "node-dot", r: radius }));

    const name = svgElement("text", { class: "node-name", x: "0", y: String(radius + (roomy ? 18 : 14)) });
    const limit = roomy ? 12 : 9;
    name.textContent = entity.name.length > limit ? `${entity.name.slice(0, limit - 1)}…` : entity.name;
    group.append(name);

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
    group.addEventListener("pointerenter", () => focus(entity.id));
    group.addEventListener("pointerleave", () => focus(null));
    nodeElements.set(entity.id, group);
    nodes.append(group);
  });
  layer.append(edgeLabels, nodes);
  fitView(svg, view);
}
