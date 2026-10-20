import ForceGraph from "force-graph";

const LABEL_FONT = '"Microsoft YaHei UI", "PingFang SC", "Noto Sans SC", sans-serif';
const INK = "#363b47";
const PAPER = "#f5f4ef";
const LINK_COLOR = "rgba(60, 70, 95, 0.2)";
// 变暗时的透明度：节点留一点影子，连线几乎消失。
const DIM_NODE = 0.12;
const DIM_LINK = 0.06;
// 章节视图里别章的节点：画小、画淡，只用来说明本章知识和哪些别章知识相连。
const GHOST_NODE = 0.4;
const GHOST_LINK = 0.5;
const GHOST_SCALE = 0.75;
const radiusOf = node => (node.ghost ? node.radius * GHOST_SCALE : node.radius);
// 名字和节点一样跟着缩放：字号（世界坐标）随节点半径增大，关键节点的名字更大。
// 名字在屏幕上小于 LABEL_HIDE_PX 时不画，到 LABEL_SHOW_PX 时完全不透明；
// 所以放大时大节点的名字先出现，继续放大小节点的名字才陆续淡入。
const labelSize = radius => 1.8 + radius * 0.5;
const LABEL_HIDE_PX = 6;
const LABEL_SHOW_PX = 9;
const LABEL_MAX_PX = 14;

/**
 * 2D 图谱，参照 Obsidian 关系图谱：纯色圆点按章节上色、细线、悬停聚焦、标签随缩放淡入、可拖动节点。
 * 不按章节分区，布局只由连线和斥力决定；同章节点连线多，自然会聚在一起。
 * 悬停时直接显示邻居名字，所以不弹提示框。
 * setView 切换全景和章节视图：章节视图只留本章和相连的别章节点并重新排布，退出时节点飞回全景原位。
 * callbacks: onSelect(id)、onBackground()、onHover(id | null)、onDrag(id | null)、
 * onLayoutReady()（首次布局完成、切换视图后布局成形时调用，此时才能按节点位置移动镜头）。
 */
export function createGraph2D(element, callbacks) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let emphasis = null;
  let litColor = INK;
  let draggingId = null;

  const graph = new ForceGraph(element)
    .backgroundColor("rgba(0,0,0,0)")
    .autoPauseRedraw(false)
    .warmupTicks(100)
    .cooldownTicks(120)
    .cooldownTime(1800)
    .d3AlphaMin(0.005)
    .d3AlphaDecay(0.05)
    .d3VelocityDecay(0.65)
    .minZoom(0.3)
    .maxZoom(12)
    .nodeLabel(() => "")
    .nodeCanvasObject((node, context, scale) => drawNode(node, context, scale))
    .nodePointerAreaPaint((node, color, context) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(node.x, node.y, radiusOf(node) + 2, 0, Math.PI * 2);
      context.fill();
    })
    .linkCanvasObjectMode(() => "replace")
    .linkCanvasObject((link, context, scale) => drawLink(link, context, scale))
    .onNodeClick(node => callbacks.onSelect(node.id))
    .onNodeHover(node => {
      if (draggingId) return;
      element.style.cursor = node ? "pointer" : "";
      callbacks.onHover(node ? node.id : null);
    })
    .onNodeDrag(node => {
      if (draggingId === node.id) return;
      draggingId = node.id;
      // 冷却后的 alpha 已低于停止阈值，仅重置计时不会让邻居重新运动。
      // 每次开始拖动都重新启动模拟，拖动过程由库维持温度。
      graph.d3ReheatSimulation();
      element.style.cursor = "grabbing";
      callbacks.onDrag(node.id);
    })
    .onNodeDragEnd(node => {
      // 松手后解除鼠标约束，节点与邻居一起回到力学平衡，再随冷却停下。
      node.fx = undefined;
      node.fy = undefined;
      draggingId = null;
      element.style.cursor = "pointer";
      callbacks.onHover(node.id);
      callbacks.onDrag(null);
    })
    .onBackgroundClick(() => callbacks.onBackground());

  // 本图谱平均每个节点只有约 3 条关系，比一般 Obsidian 笔记库稀疏得多；
  // 所以连线更短、斥力更弱、中心力更强，让整体收成一团，而不是摊成一棵树。
  // 单章更稀，还会断成几块，章节视图的中心力更强、斥力作用范围更短，断开的小块才不会飘远。
  const FORCES = {
    overview: { gravity: 0.1, chargeRange: 250 },
    chapter: { gravity: 0.22, chargeRange: 120 },
  };
  let forces = FORCES.overview;
  const gravity = alpha => {
    graph.graphData().nodes.forEach(node => {
      node.vx -= node.x * forces.gravity * alpha;
      node.vy -= node.y * forces.gravity * alpha;
    });
  };
  function useForces(next) {
    forces = next;
    graph.d3Force("charge").distanceMax(next.chargeRange);
  }
  graph.d3Force("center", null);
  graph.d3Force("gravity", gravity);
  graph.d3Force("charge").strength(-110).distanceMax(FORCES.overview.chargeRange);
  graph.d3Force("link").distance(26).strength(0.8);

  let full = { nodes: [], links: [] };
  let view = null;          // null 为全景，否则为 { ids, ghosts }
  let saved = null;         // 进入章节视图前的全景坐标，退出时飞回这里
  let timers = [];
  let restoreFrame = 0;

  // 首次布局在后台先算 warmupTicks 步再显示；之后切换视图不预算，节点从原位置动起来。
  // 只在首次布局和切换视图后停下时通知，拖动节点引起的重排不移动镜头。
  let fitted = false;
  let settling = false;
  let releaseOnStop = false;
  graph.onEngineStop(() => {
    if (releaseOnStop) {
      releaseOnStop = false;
      unpinAll();
    }
    if (fitted && !settling) return;
    if (!fitted) graph.warmupTicks(0);
    fitted = true;
    settling = false;
    callbacks.onLayoutReady();
  });

  const endId = end => (typeof end === "object" ? end.id : end);

  function unpinAll() {
    full.nodes.forEach(node => {
      node.fx = undefined;
      node.fy = undefined;
      node.vx = 0;
      node.vy = 0;
    });
  }

  function cancelTransition() {
    timers.forEach(clearTimeout);
    timers = [];
    settling = false;
    releaseOnStop = false;
    cancelAnimationFrame(restoreFrame);
    full.nodes.forEach(node => { node.leaving = false; });
    unpinAll();
  }

  function subset(next) {
    const visible = id => next.ids.has(id) || next.ghosts.has(id);
    return {
      nodes: full.nodes.filter(node => visible(node.id)),
      // 两端都是别章节点的连线和本章无关，不画。
      links: full.links.filter(link => {
        const [source, target] = [endId(link.source), endId(link.target)];
        return visible(source) && visible(target) && (next.ids.has(source) || next.ids.has(target));
      }),
    };
  }

  function enterView(next, shown) {
    if (!saved) saved = new Map(full.nodes.map(node => [node.id, { x: node.x, y: node.y }]));
    view = next;
    full.nodes.forEach(node => { node.ghost = next.ghosts.has(node.id); });
    const data = subset(next);
    const keep = new Set(data.nodes.map(node => node.id));
    // 先让要离开的节点淡出，再换数据；留下的节点从当前位置出发重新排布。
    graph.graphData().nodes.forEach(node => { node.leaving = !keep.has(node.id); });
    timers.push(setTimeout(() => {
      full.nodes.forEach(node => { node.leaving = false; });
      data.nodes.forEach(node => {
        if (!shown.has(node.id)) node.alpha = 0;
        node.vx = 0;
        node.vy = 0;
      });
      useForces(FORCES.chapter);
      graph.graphData(data);
      settling = true;
      timers.push(setTimeout(callbacks.onLayoutReady, 900));
    }, reduceMotion ? 0 : 260));
  }

  // 退出章节视图：节点从当前位置平滑移回全景坐标。换回全量数据会让力导向重新升温，
  // 所以节点一直固定到这轮模拟停下再松开，否则它们会从原位慢慢漂走。
  function leaveView(shown) {
    view = null;
    useForces(FORCES.overview);
    const from = new Map(full.nodes.map(node => [node.id, { x: node.x, y: node.y }]));
    full.nodes.forEach(node => {
      node.ghost = false;
      if (!shown.has(node.id)) node.alpha = 0;
      node.fx = node.x;
      node.fy = node.y;
    });
    graph.graphData(full);
    const start = performance.now();
    const duration = reduceMotion ? 0 : 700;
    const step = now => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      const k = 1 - (1 - t) ** 3;
      full.nodes.forEach(node => {
        const a = from.get(node.id);
        const b = saved.get(node.id);
        node.x = node.fx = a.x + (b.x - a.x) * k;
        node.y = node.fy = a.y + (b.y - a.y) * k;
      });
      if (t < 1) {
        restoreFrame = requestAnimationFrame(step);
        return;
      }
      releaseOnStop = true;
      saved = null;
      callbacks.onLayoutReady();
    };
    restoreFrame = requestAnimationFrame(step);
  }

  // 透明度每帧向目标值靠近，聚焦切换是渐变而不是跳变。
  function ease(item, target) {
    item.alpha = item.alpha === undefined || reduceMotion ? target : item.alpha + (target - item.alpha) * 0.16;
    return item.alpha;
  }

  function drawNode(node, context, scale) {
    // 刚换数据时，渲染循环可能在布局初始化前先画一帧，此时节点还没有坐标。
    if (!Number.isFinite(node.x)) return;
    const level = emphasis ? emphasis.level(node) : "normal";
    const radius = radiusOf(node);
    const target = node.leaving ? 0 : level === "dim" ? DIM_NODE : node.ghost && level !== "lit" ? GHOST_NODE : 1;
    const alpha = ease(node, target);
    context.globalAlpha = alpha;
    context.fillStyle = node.color;
    context.beginPath();
    context.arc(node.x, node.y, radius, 0, Math.PI * 2);
    context.fill();

    if (emphasis && (node.id === emphasis.selectedId || emphasis.pathEnds.has(node.id))) {
      context.strokeStyle = INK;
      context.lineWidth = 1.4 / scale;
      context.beginPath();
      context.arc(node.x, node.y, radius + 1 + 2.5 / scale, 0, Math.PI * 2);
      context.stroke();
    }

    // 标签放大到屏幕上最多 14px；点亮和筛选时至少 10px，其余按屏幕字号淡入。
    const lit = level === "lit";
    const forced = lit || (level === "normal" && emphasis?.filtered);
    let size = Math.min(labelSize(radius), LABEL_MAX_PX / scale);
    let show = Math.min(1, Math.max(0, (size * scale - LABEL_HIDE_PX) / (LABEL_SHOW_PX - LABEL_HIDE_PX)));
    if (forced) {
      size = Math.max(size, 10 / scale);
      show = 1;
    } else if (level === "dim") {
      show = 0;
    }
    if (show * alpha < 0.02) {
      context.globalAlpha = 1;
      return;
    }
    // 名字和圆点之间留出约半个字高的空隙。
    const y = node.y + radius + size * 0.6;
    context.globalAlpha = show * alpha;
    // 名字一律用细体，靠字号区分轻重。
    context.font = `300 ${size}px ${LABEL_FONT}`;
    context.textAlign = "center";
    context.textBaseline = "top";
    context.lineJoin = "round";
    context.lineWidth = size * 0.28;
    context.strokeStyle = PAPER;
    context.strokeText(node.name, node.x, y);
    context.fillStyle = INK;
    context.fillText(node.name, node.x, y);
    context.globalAlpha = 1;
  }

  function drawLink(link, context, scale) {
    const { source, target } = link;
    if (!Number.isFinite(source.x) || !Number.isFinite(target.x)) return;
    const level = emphasis ? emphasis.linkLevel(link) : "normal";
    const lit = level === "lit";
    const alpha = source.leaving || target.leaving ? 0
      : level === "dim" ? DIM_LINK : (source.ghost || target.ghost) && !lit ? GHOST_LINK : 1;
    context.globalAlpha = ease(link, alpha);
    context.strokeStyle = lit ? litColor : LINK_COLOR;
    context.lineWidth = Math.max(0.5, 0.6 / scale) * (lit ? 1.8 : 1);
    context.beginPath();
    context.moveTo(source.x, source.y);
    context.lineTo(target.x, target.y);
    context.stroke();

    if (lit && link.directed) {
      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      const tip = radiusOf(target) + 1;
      const length = Math.max(3, 7 / scale);
      const x = target.x - Math.cos(angle) * tip;
      const y = target.y - Math.sin(angle) * tip;
      context.fillStyle = litColor;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - Math.cos(angle - 0.4) * length, y - Math.sin(angle - 0.4) * length);
      context.lineTo(x - Math.cos(angle + 0.4) * length, y - Math.sin(angle + 0.4) * length);
      context.fill();
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

  // trim：横纵两个方向各去掉两端这个比例的节点再取范围，镜头对准主体，零散的边缘节点可以落到屏幕外。
  function fitWithin(nodes, { maxScale = 4, trim = 0, durationMs = 900 } = {}) {
    const placed = nodes.filter(node => Number.isFinite(node.x));
    if (!placed.length) return;
    const margin = 30;
    const span = values => {
      const sorted = values.sort((a, b) => a - b);
      const cut = Math.floor(sorted.length * trim);
      return [sorted[cut], sorted[sorted.length - 1 - cut]];
    };
    const [minX, maxX] = span(placed.map(node => node.x));
    const [minY, maxY] = span(placed.map(node => node.y));
    const pad = Math.max(...placed.map(radiusOf));
    const width = maxX - minX + pad * 2;
    // 底部多留出名字的高度。
    const height = maxY - minY + pad * 2 + 14;
    const room = {
      width: Math.max(120, size.width - insets.left - insets.right - margin * 2),
      height: Math.max(120, size.height - insets.top - insets.bottom - margin * 2),
    };
    const scale = Math.min(maxScale, Math.max(0.3, Math.min(room.width / width, room.height / height)));
    const offset = visibleOffset();
    graph.centerAt((minX + maxX) / 2 - offset.x / scale, (minY + maxY + 14) / 2 - offset.y / scale, durationMs);
    graph.zoom(scale, durationMs);
  }

  return {
    setData(data) {
      cancelTransition();
      full = data;
      view = null;
      saved = null;
      fitted = false;
      graph.graphData(data);
    },
    /** next 为 null 回到全景，否则为 { ids: 本章节点, ghosts: 相连的别章节点 }。 */
    setView(next) {
      if (!next && !view) return;
      cancelTransition();
      const shown = new Set(graph.graphData().nodes.map(node => node.id));
      if (next) enterView(next, shown);
      else leaveView(shown);
    },
    applyStyle(next) {
      emphasis = next;
      litColor = (next.centerId && nodeById(next.centerId)?.color) || INK;
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
      // 全景不求一眼看全：镜头对准中间的主体并放大，打开页面就能看清名字，四周的节点拖动画布再看。
      // 章节视图节点少，完整显示。
      fitWithin(graph.graphData().nodes, view ? { maxScale: 3.5 } : { maxScale: 4, trim: 0.18 });
    },
    setInsets(next) {
      insets = next;
    },
    resize(width, height) {
      size = { width, height };
      graph.width(width).height(height);
    },
    destroy() {
      cancelTransition();
      graph._destructor();
      element.replaceChildren();
    },
  };
}
