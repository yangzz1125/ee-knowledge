<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { loadApplicationData } from "./api.js";
import ChapterPanel from "./components/ChapterPanel.vue";
import ChatDock from "./components/ChatDock.vue";
import EntityCard from "./components/EntityCard.vue";
import GraphCanvas from "./components/GraphCanvas.vue";
import PathPanel from "./components/PathPanel.vue";
import SearchBox from "./components/SearchBox.vue";
import { clearSelection, loadInto, resetView, store } from "./store.js";

const graph = ref(null);
const chat = ref(null);
const navOpen = ref(false);

const focusTitle = computed(() => {
  if (store.path) return store.path.title;
  const chapter = store.chapters.find(item => item.id === store.chapterId);
  if (chapter) return `第${chapter.order}章 ${chapter.name}`;
  if (store.entityType) return `只看${store.typeLabels[store.entityType]}`;
  return "";
});

function openPanel(name) {
  store.panel = store.panel === name ? null : name;
}

function backToOverview() {
  resetView();
  graph.value?.fitAll();
}

function askAbout(entity) {
  chat.value.prefill(`请解释${entity.name}，并说明它的关键点。`);
}

function setPathEnd(which, id) {
  store[which] = id;
  store.panel = "path";
}

function onKeydown(event) {
  if (event.key !== "Escape" || event.target.closest("input, textarea")) return;
  if (store.selectedId) clearSelection();
  else if (store.panel) store.panel = null;
  else if (focusTitle.value) backToOverview();
}

onMounted(async () => {
  window.addEventListener("keydown", onKeydown);
  try {
    loadInto(await loadApplicationData());
  } catch (error) {
    store.status = "offline";
    store.error = error.message;
  }
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div class="app">
    <GraphCanvas v-if="store.status === 'online'" ref="graph" />
    <div v-else class="graph-placeholder">
      <div v-if="store.status === 'loading'" class="boot">
        <span class="boot-orb"></span>
        <p>正在加载知识图谱…</p>
      </div>
      <div v-else class="boot">
        <strong>无法连接知识库</strong>
        <p>{{ store.error }}</p>
        <p class="muted">请确认后端服务正在运行，然后刷新页面。</p>
      </div>
    </div>

    <header class="topbar">
      <div class="brand">
        <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="3.2" />
          <ellipse cx="16" cy="16" rx="13" ry="5.2" />
          <ellipse cx="16" cy="16" rx="13" ry="5.2" transform="rotate(60 16 16)" />
          <ellipse cx="16" cy="16" rx="13" ry="5.2" transform="rotate(-60 16 16)" />
        </svg>
        <div>
          <strong>场域</strong>
          <span>{{ store.course || "电磁场与波" }}知识图谱</span>
        </div>
      </div>
      <SearchBox v-if="store.status === 'online'" />
      <div class="top-actions">
        <button type="button" class="pill-button nav-toggle" :aria-expanded="navOpen" @click="navOpen = !navOpen">章节</button>
        <button type="button" class="pill-button" :class="{ active: store.panel === 'path' }" aria-label="学习路径"
                @click="openPanel('path')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="18" r="2.2" /><circle cx="19" cy="6" r="2.2" /><path d="M7 17c6-1 4-9 10-10" /></svg>
          <span class="pill-label">学习路径</span>
        </button>
        <span class="status" :class="store.status" role="status">
          <span class="status-dot"></span>
          {{ store.status === "online" ? `${store.counts.entities} 个知识点 · ${store.counts.relations} 条关系`
            : store.status === "loading" ? "连接中" : "后端未连接" }}
        </span>
      </div>
    </header>

    <ChapterPanel v-if="store.status === 'online'" :class="{ open: navOpen }" />

    <div v-if="focusTitle" class="focus-banner glass">
      <span>{{ focusTitle }}</span>
      <button type="button" class="text-button" @click="backToOverview">回到全景</button>
    </div>

    <aside v-if="store.panel" class="drawer glass-strong" aria-label="知识点详情与学习路径">
      <div class="drawer-tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="store.panel === 'detail'" :class="{ active: store.panel === 'detail' }"
                :disabled="!store.selectedId" @click="store.panel = 'detail'">知识点</button>
        <button type="button" role="tab" :aria-selected="store.panel === 'path'" :class="{ active: store.panel === 'path' }"
                @click="store.panel = 'path'">学习路径</button>
        <button type="button" class="icon-button" aria-label="关闭面板" title="关闭" @click="store.panel = null">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div class="drawer-body">
        <EntityCard v-if="store.panel === 'detail'" @ask="askAbout"
                    @path-start="id => setPathEnd('pathStartId', id)" @path-end="id => setPathEnd('pathEndId', id)" />
        <PathPanel v-else @tour="ids => graph?.tour(ids)" />
      </div>
    </aside>

    <div class="view-tools">
      <button type="button" class="round-button" title="回到全景" aria-label="回到全景" @click="backToOverview">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></svg>
      </button>
      <p class="hint">拖动画布平移 · 拖动节点 · 滚轮缩放 · 点击节点查看详情</p>
    </div>

    <ChatDock v-if="store.status === 'online'" ref="chat" />

    <div class="toast" :class="{ show: store.toast }" role="status" aria-live="polite">{{ store.toast }}</div>
  </div>
</template>
