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
const COMPACT_SIZE = { width: 1500, height: 820 };

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

export function renderGraph(svg, graph, options) {
  const { chapters, typeLabels, relationLabels, selectedId, onSelect } = options;
  svg.textContent = "";
  const roomy = graph.entities.length <= ROOMY_LIMIT;
  const size = roomy ? ROOMY_SIZE : COMPACT_SIZE;
  const positions = computeLayout(graph, chapters, size, roomy);

  // 小图随容器缩放；大图按真实像素尺寸绘制，由外层容器滚动。
  svg.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
  svg.style.width = roomy ? "" : `${size.width}px`;
  svg.style.height = roomy ? "" : `${size.height}px`;

  const defs = svgElement("defs");
  const marker = svgElement("marker", {
    id: "edgeArrow",
    markerWidth: "7",
    markerHeight: "7",
    refX: "6",
    refY: "3.5",
    orient: "auto",
  });
  marker.append(svgElement("path", { d: "M0 0 7 3.5 0 7Z", fill: "#8da9b5" }));
  defs.append(marker);
  svg.append(defs);

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
  svg.append(edges);

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
  svg.append(nodes);
}
