<script setup>
import { computed, ref, watch } from "vue";
import { loadNeighbors } from "../api.js";
import { formulaHtml } from "../lib/math.js";
import { TYPE_COLORS, VALUE_KIND_LABELS } from "../palette.js";
import { chapterOf, selectEntity, store } from "../store.js";

const emit = defineEmits(["ask", "path-start", "path-end"]);

const entity = computed(() => store.entitiesById.get(store.selectedId));
const details = computed(() => entity.value?.details || {});
const formula = computed(() => (details.value.latex ? formulaHtml(details.value.latex) : ""));
const description = computed(() => details.value.definition || details.value.purpose || details.value.scenario || "");
const descriptionTitle = computed(() =>
  details.value.definition ? "定义" : details.value.purpose ? "用途" : "应用场景");

const neighbors = ref({ loading: false, error: "", groups: [] });
const ARROWS = { outgoing: "→", incoming: "←", undirected: "↔" };

/** 邻居分三组：前置知识、后续知识、其他关联。 */
watch(() => store.selectedId, async id => {
  if (!id) return;
  neighbors.value = { loading: true, error: "", groups: [] };
  try {
    const result = await loadNeighbors(id);
    if (store.selectedId !== id) return;
    const groups = [
      { title: "前置知识", hint: "先掌握这些", items: [] },
      { title: "后续知识", hint: "学完可以继续", items: [] },
      { title: "其他关联", hint: "", items: [] },
    ];
    result.items.forEach(item => {
      const prerequisite = item.relation.type === "prerequisite";
      const group = prerequisite && item.direction === "incoming" ? groups[0]
        : prerequisite && item.direction === "outgoing" ? groups[1] : groups[2];
      group.items.push(item);
    });
    neighbors.value = { loading: false, error: "", groups: groups.filter(group => group.items.length) };
  } catch (error) {
    neighbors.value = { loading: false, error: error.message, groups: [] };
  }
}, { immediate: true });
</script>

<template>
  <article v-if="entity" class="entity-card" :style="{ '--c': TYPE_COLORS[entity.type] }">
    <header class="entity-head">
      <p class="entity-kind">
        <span class="dot"></span>{{ store.typeLabels[entity.type] }}
        <span class="sep">·</span>第{{ chapterOf(entity.chapter_id)?.order }}章 {{ chapterOf(entity.chapter_id)?.name }}
      </p>
      <h2>{{ entity.name }}</h2>
      <p v-if="entity.aliases.length" class="aliases">又称 {{ entity.aliases.join("、") }}</p>
      <p class="summary">{{ entity.summary }}</p>
    </header>

    <section v-if="formula || details.plain_text" class="formula-card">
      <div v-if="formula" class="formula" v-html="formula"></div>
      <p v-else class="formula-plain">{{ details.plain_text }}</p>
    </section>

    <section v-if="details.symbol" class="quantity-row">
      <div><small>符号</small><span class="symbol">{{ details.symbol }}</span></div>
      <div><small>单位</small><span>{{ details.unit || "无量纲" }}</span></div>
      <div v-if="details.value_kind"><small>类型</small><span>{{ VALUE_KIND_LABELS[details.value_kind] || details.value_kind }}</span></div>
    </section>

    <section v-if="details.variables?.length" class="block">
      <h3>变量</h3>
      <table class="variable-table">
        <tbody>
          <tr v-for="variable in details.variables" :key="variable.symbol">
            <td class="symbol">{{ variable.symbol }}</td>
            <td>
              <button v-if="variable.quantity_id && store.entitiesById.has(variable.quantity_id)" type="button"
                      class="link-button" @click="selectEntity(variable.quantity_id)">{{ variable.name }}</button>
              <span v-else>{{ variable.name }}</span>
              <small>{{ variable.description }}</small>
            </td>
            <td class="unit">{{ variable.unit || "—" }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="description" class="block">
      <h3>{{ descriptionTitle }}</h3>
      <p>{{ description }}</p>
    </section>

    <section v-if="details.key_points?.length" class="block">
      <h3>要点</h3>
      <ul class="points"><li v-for="point in details.key_points" :key="point">{{ point }}</li></ul>
    </section>

    <section v-if="details.steps?.length" class="block">
      <h3>步骤</h3>
      <ol class="steps"><li v-for="step in details.steps" :key="step">{{ step }}</li></ol>
    </section>

    <section v-if="details.key_parameters?.length" class="block">
      <h3>关键参数</h3>
      <div class="tags"><span v-for="parameter in details.key_parameters" :key="parameter">{{ parameter }}</span></div>
    </section>

    <section v-if="entity.conditions.length" class="block">
      <h3>适用条件</h3>
      <ul class="points"><li v-for="condition in entity.conditions" :key="condition">{{ condition }}</li></ul>
    </section>

    <section v-if="details.common_misconceptions?.length" class="block misconceptions">
      <h3>常见误区</h3>
      <ul class="points"><li v-for="item in details.common_misconceptions" :key="item">{{ item }}</li></ul>
    </section>

    <section class="block">
      <p v-if="neighbors.loading" class="muted">正在载入关联知识…</p>
      <p v-else-if="neighbors.error" class="muted">{{ neighbors.error }}</p>
      <p v-else-if="!neighbors.groups.length" class="muted">暂无直接关联</p>
      <div v-for="group in neighbors.groups" :key="group.title" class="neighbor-group">
        <h3>{{ group.title }}<small v-if="group.hint">{{ group.hint }}</small></h3>
        <div class="neighbor-list">
          <button v-for="item in group.items" :key="item.relation.source_id + item.relation.target_id + item.relation.type"
                  type="button" class="neighbor" :style="{ '--c': TYPE_COLORS[item.entity.type] }"
                  :title="item.relation.description" @click="selectEntity(item.entity.id)">
            <span class="dot"></span>{{ item.entity.name }}
            <small v-if="group.title === '其他关联'">{{ ARROWS[item.direction] }} {{ store.relationLabels[item.relation.type] }}</small>
          </button>
        </div>
      </div>
    </section>

    <footer class="entity-actions">
      <button type="button" class="primary-button" @click="emit('ask', entity)">问 AI 助教</button>
      <button type="button" class="ghost-button" @click="emit('path-start', entity.id)">设为路径起点</button>
      <button type="button" class="ghost-button" @click="emit('path-end', entity.id)">设为路径终点</button>
    </footer>
  </article>
</template>
