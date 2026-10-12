<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { buildAdjacency, buildGraphData, computeEmphasis } from "../graph/model.js";
import { createGraph2D } from "../graph/graph2d.js";
import { chapterView, clearSelection, selectEntity, store } from "../store.js";

const host = ref(null);
const hoverId = ref(null);
let renderer = null;
let adjacency = null;
let resizeObserver = null;
let tourTimers = [];

function emphasis() {
  return computeEmphasis({
    hoverId: hoverId.value,
    path: store.path,
    selectedId: store.selectedId,
    citedIds: store.citedIds,
    entityType: store.entityType,
  }, adjacency);
}

function mount() {
  renderer = createGraph2D(host.value, {
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

/** 镜头沿学习路径逐个经过各个知识点，最后退回能看到整条路径的位置。 */
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

watch(
  () => [hoverId.value, store.path, store.selectedId, store.citedIds, store.entityType],
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
 * 镜头对准当前焦点：路径 > 选中的知识点和它的邻居 > 章节视图 > AI 引用 > 全景。
 * 首次布局完成、切换章节视图后布局成形时也调用，按当时的焦点对准镜头。
 */
function refocus() {
  if (!renderer) return;
  renderer.setInsets(overlayInsets());
  if (store.path) renderer.fitNodes(store.path.ids);
  else if (store.selectedId) renderer.fitNodes([store.selectedId, ...(adjacency.neighbors.get(store.selectedId) || [])]);
  else if (store.chapterId) renderer.fitAll();
  else if (store.citedIds.length) renderer.fitNodes(store.citedIds);
  else renderer.fitAll();
}

// flush: "post"：等抽屉等浮层渲染出来，再按它们的实际位置对焦。
watch(() => store.selectedId, id => { if (id) refocus(); }, { flush: "post" });
watch(() => store.path, path => { if (path) refocus(); }, { flush: "post" });
watch(() => store.citedIds, ids => { if (ids.length) refocus(); }, { flush: "post" });
// 章节视图换掉图上的节点并重新排布，布局成形后渲染器回调 refocus。
watch(() => store.chapterId, id => renderer?.setView(id ? chapterView(id) : null));

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
  <div ref="host" class="graph-canvas" role="img"
       :aria-label="`${store.course}知识图谱，${store.entities.length} 个知识点`"></div>
</template>
