<script setup>
import { computed } from "vue";
import { nebulaColor, TYPE_COLORS } from "../palette.js";
import { store, toggleChapter, toggleType } from "../store.js";

const chapterCounts = computed(() => {
  const counts = new Map();
  store.entities.forEach(entity => counts.set(entity.chapter_id, (counts.get(entity.chapter_id) || 0) + 1));
  return counts;
});
const typeCounts = computed(() => {
  const counts = new Map();
  store.entities.forEach(entity => counts.set(entity.type, (counts.get(entity.type) || 0) + 1));
  return counts;
});
const sortedChapters = computed(() => [...store.chapters].sort((a, b) => a.order - b.order));
</script>

<template>
  <nav class="chapter-panel glass" aria-label="课程章节与知识类型">
    <h2 class="panel-title">课程星团</h2>
    <ol class="chapter-list">
      <li v-for="chapter in sortedChapters" :key="chapter.id">
        <button type="button" class="chapter-button" :class="{ active: store.chapterId === chapter.id }"
                :style="{ '--c': nebulaColor(chapter.order) }" :aria-pressed="store.chapterId === chapter.id"
                @click="toggleChapter(chapter.id)">
          <span class="chapter-orb"></span>
          <span class="chapter-name">第{{ chapter.order }}章　{{ chapter.name }}</span>
          <span class="count">{{ chapterCounts.get(chapter.id) || 0 }}</span>
        </button>
        <p v-if="store.chapterId === chapter.id" class="chapter-desc">{{ chapter.description }}</p>
      </li>
    </ol>

    <h2 class="panel-title">星体类型</h2>
    <div class="type-list">
      <button v-for="type in store.entityTypes" :key="type.value" type="button" class="type-button"
              :class="{ active: store.entityType === type.value, muted: store.entityType && store.entityType !== type.value }"
              :style="{ '--c': TYPE_COLORS[type.value] }" :aria-pressed="store.entityType === type.value"
              @click="toggleType(type.value)">
        <span class="dot"></span>{{ type.label }}<span class="count">{{ typeCounts.get(type.value) || 0 }}</span>
      </button>
    </div>
    <p class="panel-foot">星越大，连接越多 · 点章节或类型可聚焦，再点一次取消</p>
  </nav>
</template>
