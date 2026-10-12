<script setup>
import { ref } from "vue";
import { findPath } from "../api.js";
import { TYPE_COLORS } from "../palette.js";
import { notify, selectEntity, showPath, store } from "../store.js";
import EntityPicker from "./EntityPicker.vue";

const emit = defineEmits(["tour"]);
const undirected = ref(false);
const busy = ref(false);
const result = ref(null);   // { found, message, entities, relations, startId, endId, undirected }

function swap() {
  [store.pathStartId, store.pathEndId] = [store.pathEndId, store.pathStartId];
}

async function search() {
  const { pathStartId: startId, pathEndId: endId } = store;
  if (!startId || !endId) {
    notify("请从候选列表中选择起点和终点");
    return;
  }
  busy.value = true;
  try {
    const found = await findPath(startId, endId, undirected.value);
    result.value = { ...found, startId, endId, undirected: undirected.value };
    if (found.found) showPath(found, startId, endId);
  } catch (error) {
    notify(error.message);
  } finally {
    busy.value = false;
  }
}

function retryUndirected() {
  undirected.value = true;
  search();
}

function flyAlong() {
  const { startId, endId } = result.value;
  showPath(result.value, startId, endId);
  emit("tour", result.value.entities.map(entity => entity.id));
}

/** 路径上的关系可能是逆着走的（忽略方向时），这时标注「反向」。 */
const isReversed = (relation, entity) => relation.source_id !== entity.id;
</script>

<template>
  <div class="path-panel">
    <form class="path-form" autocomplete="off" @submit.prevent="search">
      <p class="intro">选两个知识点，看看从一个学到另一个要经过哪些知识。</p>
      <EntityPicker v-model="store.pathStartId" label="起点" input-id="pathStart" />
      <button type="button" class="swap-button" title="交换起点和终点" aria-label="交换起点和终点" @click="swap">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" /></svg>
      </button>
      <EntityPicker v-model="store.pathEndId" label="终点" input-id="pathEnd" />
      <label class="check"><input v-model="undirected" type="checkbox"> 忽略关系方向（只看有没有联系）</label>
      <button type="submit" class="primary-button" :disabled="busy">{{ busy ? "正在查找…" : "查找路径" }}</button>
    </form>

    <div v-if="result" class="path-result" aria-live="polite">
      <div v-if="!result.found" class="path-empty">
        <strong>没有找到路径</strong>
        <p v-if="result.undirected">这两个知识点之间没有任何关系链相连，换一组起点和终点试试。</p>
        <p v-else>顺着「前置 → 后续」的方向走不通。可以忽略方向再找，看看它们是否通过其他关系相连。</p>
        <button v-if="!result.undirected" type="button" class="ghost-button" @click="retryUndirected">忽略方向再找一次</button>
      </div>
      <template v-else>
        <div class="path-summary">
          <span>{{ result.relations.length ? `共 ${result.relations.length} 步` : "起点和终点是同一个知识点" }}</span>
          <button v-if="result.relations.length" type="button" class="ghost-button" @click="flyAlong">沿路径飞行</button>
        </div>
        <ol class="path-steps">
          <template v-for="(entity, index) in result.entities" :key="entity.id">
            <li class="path-node">
              <button type="button" class="path-entity" :style="{ '--c': TYPE_COLORS[entity.type] }"
                      @click="selectEntity(entity.id)">
                <span class="step-index">{{ index + 1 }}</span>
                <span class="dot"></span>{{ entity.name }}
                <small>{{ store.typeLabels[entity.type] }}</small>
              </button>
            </li>
            <li v-if="result.relations[index]" class="path-link" :class="{ reversed: isReversed(result.relations[index], entity) }">
              <span class="relation">
                {{ store.relationLabels[result.relations[index].type] }}{{ isReversed(result.relations[index], entity) ? "（反向）" : "" }}
              </span>
              <small>{{ result.relations[index].description }}</small>
            </li>
          </template>
        </ol>
      </template>
    </div>
  </div>
</template>
