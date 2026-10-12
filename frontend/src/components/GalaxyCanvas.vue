<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { buildAdjacency, buildGraphData, computeEmphasis } from "../graph/model.js";
import { createGalaxy2D } from "../graph/galaxy2d.js";
import { createGalaxy3D } from "../graph/galaxy3d.js";
import { chapterOf, clearSelection, selectEntity, store } from "../store.js";

const host = ref(null);
const hoverId = ref(null);
let renderer = null;
let adjacency = null;
let resizeObserver = null;
let tourTimers = [];

const escapeHtml = text => text.replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

function describe(node) {
  return `<div class="star-tip"><strong>${escapeHtml(node.name)}</strong>`
    + `<span>${escapeHtml(store.typeLabels[node.type] || node.type)} · ${escapeHtml(chapterOf(node.chapterId)?.name || "")}</span>`
    + `<p>${escapeHtml(node.summary)}</p></div>`;
}

function emphasis() {
  return computeEmphasis({
    hoverId: hoverId.value,
    path: store.path,
    selectedId: store.selectedId,
    citedIds: store.citedIds,
    chapterId: store.chapterId,
    entityType: store.entityType,
  }, adjacency);
}

function mount() {
  const create = store.mode === "3d" ? createGalaxy3D : createGalaxy2D;
  renderer = create(host.value, store.chapters, {
    onSelect: id => {
      stopTour();
      selectEntity(id);
    },
    onBackground: () => {
      stopTour();
      clearSelection();
    },
    onHover: id => { hoverId.value = id; },
    onLayoutReady: refocus,
    describe,
  });
  const { width, height } = host.value.getBoundingClientRect();
  renderer.resize(width, height);
  renderer.setData(buildGraphData(store.entities, store.relations, store.chapters, store.directedRelations));
  renderer.applyStyle(emphasis());
}

function unmount() {
  stopTour();
  renderer?.destroy();
  renderer = null;
}

function stopTour() {
  tourTimers.forEach(clearTimeout);
  tourTimers = [];
}

/** 镜头沿学习路径逐颗飞过，最后退回能看到整条路径的位置。 */
function tour(ids) {
  stopTour();
  renderer?.setInsets(overlayInsets());
  ids.forEach((id, index) => {
    tourTimers.push(setTimeout(() => renderer?.focusNode(id, 1100), index * 1700));
  });
  tourTimers.push(setTimeout(() => renderer?.fitNodes(ids), ids.length * 1700 + 400));
}

onMounted(() => {
  adjacency = buildAdjacency(store.relations);
  mount();
  resizeObserver = new ResizeObserver(([entry]) => {
    renderer?.resize(entry.contentRect.width, entry.contentRect.height);
  });
  resizeObserver.observe(host.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  unmount();
});

watch(() => store.mode, () => {
  unmount();
  mount();
});

watch(
  () => [hoverId.value, store.path, store.selectedId, store.citedIds, store.chapterId, store.entityType],
  () => renderer?.applyStyle(emphasis()),
);

/**
 * 浮层挡住画布的边距。高度超过画布一半的浮层算侧栏（挡左或右），其余算挡上或挡下。
 * 窄屏时抽屉变成底部面板，这样也能正确处理。
 */
function overlayInsets() {
  const canvas = host.value.getBoundingClientRect();
  const insets = { left: 0, right: 0, top: 0, bottom: 0 };
  const gap = 12;
  document.querySelectorAll(".topbar, .chapter-panel, .drawer, .chat-dock").forEach(element => {
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height) return;
    if (box.height > canvas.height / 2 && box.width < canvas.width / 2) {
      if (box.left + box.width / 2 < canvas.left + canvas.width / 2) insets.left = Math.max(insets.left, box.right - canvas.left + gap);
      else insets.right = Math.max(insets.right, canvas.right - box.left + gap);
    } else if (box.top + box.height / 2 < canvas.top + canvas.height / 2) {
      insets.top = Math.max(insets.top, box.bottom - canvas.top + gap);
    } else {
      insets.bottom = Math.max(insets.bottom, canvas.bottom - box.top + gap);
    }
  });
  return insets;
}

/**
 * 镜头对准当前焦点：路径 > 选中的星和它的邻居 > 聚焦的章节 > AI 引用 > 全景。
 * 切换 2D/3D 后布局完成时也调用一次，保持切换前的焦点。
 */
function refocus() {
  if (!renderer) return;
  renderer.setInsets(overlayInsets());
  if (store.path) renderer.fitNodes(store.path.ids);
  else if (store.selectedId) renderer.fitNodes([store.selectedId, ...(adjacency.neighbors.get(store.selectedId) || [])]);
  else if (store.chapterId) renderer.fitNodes(store.entities.filter(entity => entity.chapter_id === store.chapterId).map(entity => entity.id));
  else if (store.citedIds.length) renderer.fitNodes(store.citedIds);
  else renderer.fitAll();
}

// flush: "post"：等抽屉等浮层渲染出来，再按它们的实际位置对焦。
watch(() => store.selectedId, id => { if (id) refocus(); }, { flush: "post" });
watch(() => store.path, path => { if (path) refocus(); }, { flush: "post" });
watch(() => store.citedIds, ids => { if (ids.length) refocus(); }, { flush: "post" });
watch(() => store.chapterId, refocus, { flush: "post" });

defineExpose({
  fitAll: () => {
    stopTour();
    renderer?.setInsets(overlayInsets());
    renderer?.fitAll();
  },
  tour,
});
</script>

<template>
  <div ref="host" class="galaxy" :class="`galaxy-${store.mode}`" role="img"
       :aria-label="`${store.course}知识星图，${store.entities.length} 个知识点`"></div>
</template>
