import ForceGraph from "force-graph";
import { nebulaColor, TYPE_COLORS, withAlpha } from "../palette.js";
import { chapterAnchors, chapterClusters, chapterForce } from "./forces.js";
import { SPRITE_SCALE, starCanvas, starfieldTile } from "./starSprite.js";

const LABEL_FONT = '"Microsoft YaHei UI", "PingFang SC", "Noto Sans SC", sans-serif';
// 星座连线统一一种淡蓝白；点亮时换成暖金色。
const LINK_COLORS = {
  lit: "rgba(255, 207, 112, 1)",
  normal: "rgba(169, 189, 245, 0.42)",
  dim: "rgba(90, 105, 170, 0.1)",
};
const GRID_COLOR = "rgba(90, 120, 200, 0.2)";
const SPACE = "#060b1c";

/**
 * 2D 平面星图：配色和高亮规则与 3D 相同，适合查细节和看路径。
 * callbacks 与返回的方法同 galaxy3d.js。
 */
export function createGalaxy2D(element, chapters, callbacks) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let emphasis = null;
  // 随机星空作为最上层背景，见 main.css 的 .galaxy-2d。
  element.style.setProperty("--starfield", `url(${starfieldTile()})`);
  const scaleOf = node => node.radius * 1.5;

  const graph = new ForceGraph(element)
    .backgroundColor("rgba(0,0,0,0)")
    .autoPauseRedraw(false)
    .enableNodeDrag(false)
    .warmupTicks(80)
    .cooldownTicks(160)
    .minZoom(0.3)
    .maxZoom(8)
    .nodeRelSize(1)
    .nodeVal(node => scaleOf(node) ** 2)
    .nodeLabel(node => callbacks.describe(node))
    .nodeCanvasObject((node, context, scale) => drawNode(node, context, scale))
    .nodePointerAreaPaint((node, color, context) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(node.x, node.y, scaleOf(node) * 1.6 + 2, 0, Math.PI * 2);
      context.fill();
    })
    .linkDirectionalParticleSpeed(0.008)
    .linkDirectionalParticleWidth(3)
    .linkDirectionalParticleColor(() => "#fff3d0")
    .linkDirectionalArrowRelPos(0.86)
    .linkDirectionalArrowColor(() => LINK_COLORS.lit)
    .onRenderFramePre((context, scale) => {
      drawGrid(context, scale);
      drawNebulae(context, scale);
    })
    .onNodeClick(node => callbacks.onSelect(node.id))
    .onNodeHover(node => {
      element.style.cursor = node ? "pointer" : "";
      callbacks.onHover(node ? node.id : null);
    })
    .onBackgroundClick(() => callbacks.onBackground());

  const anchors = chapterAnchors(chapters, 300, 2);
  graph.d3Force("chapter", chapterForce(anchors, 0.14));
  graph.d3Force("charge").strength(-140);
  graph.d3Force("link").distance(48).strength(link => (link.sameChapter ? 0.45 : 0.015));

  let fitted = false;
  graph.onEngineStop(() => {
    if (fitted) return;
    fitted = true;
    callbacks.onLayoutReady();
  });

  /** 天球坐标环：以全图中心为圆心的同心圆、每 30° 一条经线、外圈刻度和度数。 */
  function drawGrid(context, scale) {
    const nodes = graph.graphData().nodes;
    if (!nodes.length || !nodes.every(node => Number.isFinite(node.x))) return;
    const cx = nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length;
    const cy = nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length;
    const radius = Math.max(...nodes.map(node => Math.hypot(node.x - cx, node.y - cy))) + 80;
    context.strokeStyle = GRID_COLOR;
    context.lineWidth = 1 / scale;
    [0.35, 0.7, 1, 1.05].forEach(k => {
      context.beginPath();
      context.arc(cx, cy, radius * k, 0, Math.PI * 2);
      context.stroke();
    });
    context.beginPath();
    for (let degree = 0; degree < 360; degree += 5) {
      const angle = (degree / 180) * Math.PI;
      const inner = degree % 30 === 0 ? radius * 0.35 : radius * (degree % 10 === 0 ? 1 : 1.022);
      context.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      context.lineTo(cx + Math.cos(angle) * radius * 1.05, cy + Math.sin(angle) * radius * 1.05);
    }
    context.stroke();
    context.font = `${11 / scale}px ${LABEL_FONT}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "rgba(130, 155, 225, 0.55)";
    for (let degree = 0; degree < 360; degree += 30) {
      const angle = (degree / 180) * Math.PI;
      context.fillText(`${degree}°`, cx + Math.cos(angle) * radius * 1.1, cy + Math.sin(angle) * radius * 1.1);
    }
  }

  function drawNebulae(context, scale) {
    const nodes = graph.graphData().nodes;
    if (!nodes.length || !nodes.every(node => Number.isFinite(node.x))) return;
    chapterClusters(nodes).forEach((cluster, chapterId) => {
      const chapter = chapters.find(item => item.id === chapterId);
      const color = nebulaColor(chapter.order);
      const radius = cluster.radius + 70;
      const gradient = context.createRadialGradient(cluster.x, cluster.y, 0, cluster.x, cluster.y, radius);
      gradient.addColorStop(0, withAlpha(color, 0.14));
      gradient.addColorStop(0.55, withAlpha(color, 0.05));
      gradient.addColorStop(1, withAlpha(color, 0));
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(cluster.x, cluster.y, radius, 0, Math.PI * 2);
      context.fill();

      const size = 16 / scale;
      context.font = `700 ${size}px ${LABEL_FONT}`;
      context.textAlign = "center";
      context.textBaseline = "bottom";
      context.fillStyle = withAlpha(color, 0.95);
      context.fillText(chapter.name, cluster.x, cluster.y - cluster.radius - 18);
    });
  }

  function drawNode(node, context, scale) {
    // 刚换数据时，渲染循环可能在布局初始化前先画一帧，此时节点还没有坐标。
    if (!Number.isFinite(node.x)) return;
    const level = emphasis ? emphasis.level(node) : "normal";
    const lit = level === "lit";
    const radius = scaleOf(node);
    context.globalAlpha = level === "dim" ? 0.2 : 1;
    // 与 3D 相同的星体贴图；亮星和点亮的星带十字星芒。
    const side = radius * SPRITE_SCALE * (lit ? 1.35 : 1);
    const previous = context.globalCompositeOperation;
    context.globalCompositeOperation = "lighter";
    context.drawImage(starCanvas(TYPE_COLORS[node.type], node.landmark || lit), node.x - side / 2, node.y - side / 2, side, side);
    context.globalCompositeOperation = previous;

    if (emphasis && (node.id === emphasis.selectedId || emphasis.pathEnds.has(node.id))) {
      const pulse = reduceMotion ? 1 : 1 + Math.sin(performance.now() / 380) * 0.08;
      context.strokeStyle = "rgba(255, 255, 255, 0.9)";
      context.lineWidth = 1.6 / scale;
      context.beginPath();
      context.arc(node.x, node.y, radius * 2 * pulse, 0, Math.PI * 2);
      context.stroke();
    }

    const showLabel = emphasis ? emphasis.showLabel(node) : node.landmark;
    if (showLabel || (level !== "dim" && scale > 2.6)) {
      const size = 12.5 / scale;
      context.font = `600 ${size}px ${LABEL_FONT}`;
      context.textAlign = "center";
      context.textBaseline = "top";
      context.lineJoin = "round";
      context.lineWidth = 3.5 / scale;
      context.strokeStyle = SPACE;
      context.strokeText(node.name, node.x, node.y + radius + 4 / scale);
      context.fillStyle = "#eef2ff";
      context.fillText(node.name, node.x, node.y + radius + 4 / scale);
    }
    context.globalAlpha = 1;
  }

  function nodeById(id) {
    return graph.graphData().nodes.find(node => node.id === id);
  }

  // 浮层挡住的边距：缩放按可见区域计算，并把内容中心放到可见区域中央。
  let insets = { left: 0, right: 0, top: 0, bottom: 0 };
  let size = { width: element.clientWidth || 1, height: element.clientHeight || 1 };
  const visibleOffset = () => ({ x: (insets.left - insets.right) / 2, y: (insets.top - insets.bottom) / 2 });

  function fitWithin(nodes, durationMs = 900) {
    const placed = nodes.filter(node => Number.isFinite(node.x));
    if (!placed.length) return;
    const margin = 60;
    const xs = placed.flatMap(node => [node.x - scaleOf(node), node.x + scaleOf(node)]);
    const ys = placed.flatMap(node => [node.y - scaleOf(node), node.y + scaleOf(node) + 14]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const room = {
      width: Math.max(120, size.width - insets.left - insets.right - margin * 2),
      height: Math.max(120, size.height - insets.top - insets.bottom - margin * 2),
    };
    const scale = Math.min(4, Math.max(0.3, Math.min(room.width / (maxX - minX || 1), room.height / (maxY - minY || 1))));
    const offset = visibleOffset();
    graph.centerAt((minX + maxX) / 2 - offset.x / scale, (minY + maxY) / 2 - offset.y / scale, durationMs);
    graph.zoom(scale, durationMs);
  }

  return {
    setData(data) {
      fitted = false;
      graph.graphData(data);
    },
    applyStyle(next) {
      emphasis = next;
      const level = link => next.linkLevel(link);
      graph
        .linkColor(link => LINK_COLORS[level(link)])
        .linkWidth(link => ({ lit: 2.6, normal: 1.3, dim: 0.8 })[level(link)])
        .linkDirectionalParticles(link => (level(link) === "lit" && link.directed ? 3 : 0))
        .linkDirectionalArrowLength(link => (level(link) === "lit" && link.directed ? 5 : 0));
    },
    focusNode(id, durationMs = 900) {
      const node = nodeById(id);
      if (!node) return;
      const scale = Math.max(graph.zoom(), 2.6);
      const offset = visibleOffset();
      graph.centerAt(node.x - offset.x / scale, node.y - offset.y / scale, durationMs);
      graph.zoom(scale, durationMs);
    },
    fitNodes(ids) {
      const set = new Set(ids);
      fitWithin(graph.graphData().nodes.filter(node => set.has(node.id)));
    },
    fitAll() {
      fitWithin(graph.graphData().nodes);
    },
    setInsets(next) {
      insets = next;
    },
    resize(width, height) {
      size = { width, height };
      graph.width(width).height(height);
    },
    destroy() {
      graph._destructor();
      element.style.removeProperty("--starfield");
      element.replaceChildren();
    },
  };
}
