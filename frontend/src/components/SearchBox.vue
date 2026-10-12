<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { searchEntities } from "../api.js";
import { TYPE_COLORS } from "../palette.js";
import { notify, selectEntity, store } from "../store.js";

const LIMIT = 10;
const input = ref(null);
const keyword = ref("");
const results = ref([]);
const truncated = ref(false);
const open = ref(false);
const active = ref(0);
let timer;

async function run() {
  const value = keyword.value.trim();
  if (!value) {
    open.value = false;
    return;
  }
  try {
    // 多取一条，用来判断结果是否被截断。
    const found = await searchEntities(value, LIMIT + 1);
    if (keyword.value.trim() !== value) return;
    results.value = found.slice(0, LIMIT).map(item => item.entity);
    truncated.value = found.length > LIMIT;
    active.value = 0;
    open.value = true;
  } catch (error) {
    notify(error.message);
  }
}

function onInput() {
  clearTimeout(timer);
  timer = setTimeout(run, 180);
}

function choose(entity) {
  open.value = false;
  keyword.value = entity.name;
  input.value.blur();
  selectEntity(entity.id);
}

function onKeydown(event) {
  if (event.key === "Escape") {
    open.value = false;
    return;
  }
  if (!open.value || !results.value.length) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    active.value = (active.value + step + results.value.length) % results.value.length;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    choose(results.value[active.value]);
  }
}

function onGlobalKey(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    input.value.focus();
    input.value.select();
  }
}

onMounted(() => window.addEventListener("keydown", onGlobalKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onGlobalKey));
</script>

<template>
  <div class="search" @focusout="event => !event.currentTarget.contains(event.relatedTarget) && (open = false)">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
    <input ref="input" v-model="keyword" type="search" placeholder="搜索概念、公式或定律，如：高斯定律"
           autocomplete="off" aria-label="搜索知识点" role="combobox" :aria-expanded="open"
           aria-controls="searchResults" @input="onInput" @keydown="onKeydown" @focus="results.length && keyword && (open = true)">
    <kbd>Ctrl K</kbd>
    <div v-if="open" id="searchResults" class="search-results glass-strong" role="listbox">
      <p v-if="!results.length" class="search-empty">没有找到相关知识点，换个说法试试</p>
      <button v-for="(entity, index) in results" :key="entity.id" type="button" class="search-result"
              :class="{ active: index === active }" role="option" :aria-selected="index === active"
              @mouseenter="active = index" @click="choose(entity)">
        <span class="dot" :style="{ '--c': TYPE_COLORS[entity.type] }"></span>
        <strong>{{ entity.name }}</strong>
        <small>{{ store.typeLabels[entity.type] }}</small>
        <span class="result-summary">{{ entity.summary }}</span>
      </button>
      <p v-if="truncated" class="search-empty">只显示前 {{ LIMIT }} 条，输入更具体的关键词可以缩小范围</p>
    </div>
  </div>
</template>
