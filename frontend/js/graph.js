const SVG_NS = "http://www.w3.org/2000/svg";
const CENTER = { x: 450, y: 215 };

export const TYPE_COLORS = {
  concept: "#32a8c7",
  quantity: "#007aff",
  law: "#34c759",
  formula: "#af52de",
  method: "#ff9f0a",
  application: "#ff375f",
};

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

function placeRing(items, radiusX, radiusY, nodeRadius, positions, layer, angleOffset = -Math.PI / 2) {
  items.forEach((entity, index) => {
    const angle = angleOffset + index * (Math.PI * 2 / Math.max(items.length, 1));
    positions.set(entity.id, {
      x: CENTER.x + Math.cos(angle) * radiusX,
      y: CENTER.y + Math.sin(angle) * radiusY,
      radius: nodeRadius,
      layer,
    });
  });
}

function adjacencyFor(graph) {
  const adjacency = new Map(graph.entities.map(entity => [entity.id, new Set()]));
  graph.relations.forEach(relation => {
    adjacency.get(relation.source_id)?.add(relation.target_id);
    adjacency.get(relation.target_id)?.add(relation.source_id);
  });
  return adjacency;
}

function localPositions(graph) {
  const positions = new Map();
  const centerId = graph.center_id;
  const center = graph.entities.find(entity => entity.id === centerId);
  if (!center) return positions;

  positions.set(center.id, { ...CENTER, radius: 54, layer: 0 });
  const adjacency = adjacencyFor(graph);
  const distances = new Map([[center.id, 0]]);
  const queue = [center.id];
  while (queue.length) {
    const current = queue.shift();
    const distance = distances.get(current);
    adjacency.get(current)?.forEach(next => {
      if (distances.has(next)) return;
      distances.set(next, distance + 1);
      queue.push(next);
    });
  }

  const inner = graph.entities.filter(entity => distances.get(entity.id) === 1);
  const outer = graph.entities.filter(entity => entity.id !== center.id && distances.get(entity.id) !== 1);
  placeRing(inner, 175, 105, 43, positions, 1);
  placeRing(outer, 310, 165, 39, positions, 2, -Math.PI / 2 + Math.PI / Math.max(outer.length, 1));
  return positions;
}

function globalPositions(graph, chapters) {
  const positions = new Map();
  const chapterOrder = new Map(chapters.map((chapter, index) => [chapter.id, index]));
  const degree = new Map(graph.entities.map(entity => [entity.id, 0]));
  graph.relations.forEach(relation => {
    degree.set(relation.source_id, (degree.get(relation.source_id) || 0) + 1);
    degree.set(relation.target_id, (degree.get(relation.target_id) || 0) + 1);
  });
  const ranked = [...graph.entities].sort((left, right) =>
    (degree.get(right.id) || 0) - (degree.get(left.id) || 0)
    || (chapterOrder.get(left.chapter_id) || 0) - (chapterOrder.get(right.chapter_id) || 0)
    || left.id.localeCompare(right.id)
  );
  const innerCount = Math.min(6, Math.max(1, Math.round(ranked.length * 0.38)));
  placeRing(ranked.slice(0, innerCount), 175, 105, 43, positions, 1);
  placeRing(
    ranked.slice(innerCount),
    310,
    165,
    39,
    positions,
    2,
    -Math.PI / 2 + Math.PI / Math.max(ranked.length - innerCount, 1),
  );
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

function appendGuides(svg) {
  const guides = svgElement("g", { class: "orbit-guides", "aria-hidden": "true" });
  [[175, 105], [310, 165]].forEach(([radiusX, radiusY]) => {
    guides.append(svgElement("ellipse", {
      cx: CENTER.x,
      cy: CENTER.y,
      rx: radiusX,
      ry: radiusY,
      class: "orbit-guide",
    }));
  });
  svg.append(guides);
}

export function renderGraph(svg, graph, options) {
  const {
    chapters,
    typeLabels,
    relationLabels,
    selectedId,
    onSelect,
  } = options;
  svg.textContent = "";
  const localMode = Boolean(graph.center_id);
  const positions = localMode
    ? localPositions(graph)
    : globalPositions(graph, chapters);

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
  appendGuides(svg);

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
    if (!position) return;
    const selected = entity.id === selectedId;
    const group = svgElement("g", {
      class: `graph-node${selected ? " selected" : ""}`,
      transform: `translate(${position.x} ${position.y})`,
      tabindex: "0",
      role: "button",
      "aria-label": `${entity.name}，${typeLabels[entity.type] || entity.type}`,
      style: `--node-color:${TYPE_COLORS[entity.type] || "#007aff"}`,
    });
    group.dataset.entityId = entity.id;
    if (selected) {
      group.append(svgElement("circle", {
        class: "node-halo",
        r: position.radius + 8,
      }));
    }
    group.append(svgElement("circle", {
      class: "node-surface",
      r: position.radius,
    }));

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
