<script setup>
import { computed, ref, watch } from "vue";
import { chapterOf, entityColor, entityName, store } from "../store.js";

// v-model 绑定实体 ID；输入框里只是名字，必须从候选里选中才算数。
const model = defineModel({ type: String, default: null });
defineProps({ label: { type: String, required: true }, inputId: { type: String, required: true } });

const text = ref(model.value ? entityName(model.value) : "");
const open = ref(false);
const active = ref(0);

watch(model, id => { text.value = id ? entityName(id) : ""; });

const matches = computed(() => {
  const keyword = text.value.trim().toLowerCase();
  if (!keyword) return [];
  return store.entities.filter(entity =>
    entity.name.toLowerCase().includes(keyword)
    || entity.aliases.some(alias => alias.toLowerCase().includes(keyword)),
  ).slice(0, 8);
});

function onInput() {
  model.value = null;
  active.value = 0;
  open.value = true;
}

function choose(entity) {
  model.value = entity.id;
  text.value = entity.name;
  open.value = false;
}

function onKeydown(event) {
  if (event.key === "Escape") open.value = false;
  if (!open.value || !matches.value.length) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    active.value = (active.value + step + matches.value.length) % matches.value.length;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    choose(matches.value[active.value]);
  }
}
</script>

<template>
  <div class="picker" @focusout="event => !event.currentTarget.contains(event.relatedTarget) && (open = false)">
    <label :for="inputId">{{ label }}</label>
    <input :id="inputId" v-model="text" type="text" placeholder="输入知识点名称" autocomplete="off"
           :class="{ chosen: model }" @input="onInput" @keydown="onKeydown">
    <div v-if="open && text.trim()" class="picker-results glass-strong">
      <p v-if="!matches.length" class="search-empty">没有匹配的知识点</p>
      <button v-for="(entity, index) in matches" :key="entity.id" type="button" class="picker-option"
              :class="{ active: index === active }" @mouseenter="active = index" @click="choose(entity)">
        <span class="dot" :style="{ '--c': entityColor(entity.id) }"></span>
        {{ entity.name }}<small>{{ chapterOf(entity.chapter_id)?.name }}</small>
      </button>
    </div>
  </div>
</template>
