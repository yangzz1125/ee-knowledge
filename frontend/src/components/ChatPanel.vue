<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { streamAnswer } from "../api.js";
import { renderMarkdown } from "../lib/markdown.js";
import { entityColor, entityName, notify, selectEntity, showCitations, store } from "../store.js";

const HISTORY_KEY = "ee-conversation-history-v1";
const EXAMPLES = ["高斯定律为什么需要闭合曲面？", "电位和电场强度是什么关系？", "麦克斯韦方程组包含哪几条定律？"];

const input = ref(null);
const list = ref(null);
const question = ref("");
const streaming = ref(false);
// 每条消息：{ role: user | assistant, text, ids, done, error }
const messages = ref([]);
let history = loadHistory();
let controller = null;

const contextName = computed(() => (store.selectedId ? entityName(store.selectedId) : ""));

/** sessionStorage 里最近 10 轮问答，刷新页面可恢复，关闭标签页清除。 */
function loadHistory() {
  try {
    const value = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(turn =>
      typeof turn?.question === "string" && typeof turn?.answer === "string" && Array.isArray(turn?.used_entity_ids),
    ).slice(-10);
  } catch {
    try { sessionStorage.removeItem(HISTORY_KEY); } catch { /* 存储不可用时只保留内存历史。 */ }
    return [];
  }
}

function saveHistory() {
  try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* 保留内存历史。 */ }
}

function scrollToEnd() {
  nextTick(() => { if (list.value) list.value.scrollTop = list.value.scrollHeight; });
}

// 回答完成后把 Markdown 和公式渲染进对应的消息节点；每个节点只渲染一次。
const renderedElements = new WeakSet();
const renderTarget = (element, message) => {
  if (!element || renderedElements.has(element)) return;
  renderMarkdown(element, message.text);
  renderedElements.add(element);
};

async function ask(text) {
  const value = text.trim();
  if (!value || streaming.value) return;
  question.value = "";
  messages.value.push({ role: "user", text: value });
  messages.value.push({ role: "assistant", text: "", ids: [], done: false, error: "" });
  const answer = messages.value.at(-1);
  scrollToEnd();

  controller = new AbortController();
  streaming.value = true;
  let references = [];
  try {
    await streamAnswer(
      { question: value, context_entity_id: store.selectedId, history },
      (event, data) => {
        // metadata 只有检索命中的知识点；done 才带回答实际引用的知识点。
        if (event === "metadata") references = data.retrieved_entity_ids || [];
        if (event === "delta") {
          answer.text += data.text;
          scrollToEnd();
        }
        if (event === "error") answer.error = data.message || "回答生成失败";
        if (event === "done") {
          if (Array.isArray(data.used_entity_ids)) references = data.used_entity_ids;
          answer.ids = references;
          answer.done = true;
        }
      },
      controller.signal,
    );
    if (!answer.error && answer.text) {
      history = [...history, { question: value, answer: answer.text.slice(0, 4000), used_entity_ids: references }].slice(-10);
      saveHistory();
      // 用户正在看某个知识点或路径时不打断，引用可以点「在图谱中点亮」再看。
      if (references.length && !store.selectedId && !store.path) showCitations(references);
    }
  } catch (error) {
    answer.error = error.name === "AbortError" ? "回答已停止" : error.message;
  } finally {
    answer.done = true;
    streaming.value = false;
    controller = null;
    scrollToEnd();
  }
}

function stop() {
  controller?.abort();
}

function clear() {
  stop();
  history = [];
  messages.value = [];
  store.citedIds = [];
  try { sessionStorage.removeItem(HISTORY_KEY); } catch { /* 内存历史已清空。 */ }
  notify("对话已清空");
}

function onKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    ask(question.value);
  }
}

function autosize() {
  const element = input.value;
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
}

watch(question, () => nextTick(autosize));

onMounted(() => {
  messages.value = history.flatMap(turn => [
    { role: "user", text: turn.question },
    { role: "assistant", text: turn.answer, ids: turn.used_entity_ids, done: true, error: "" },
  ]);
});

defineExpose({
  /** 从知识点卡片发起提问：填好问题并聚焦，让用户确认后再发送。 */
  prefill(text) {
    question.value = text;
    nextTick(() => input.value.focus());
  },
});
</script>

<template>
  <section class="chat-panel" aria-label="AI 课程助教">
    <header class="chat-head">
      <span class="chat-context">{{ contextName ? `围绕「${contextName}」回答` : "只依据知识图谱作答" }}</span>
      <button v-if="messages.length" type="button" class="text-button" @click="clear">清空</button>
    </header>
    <div ref="list" class="chat-list" aria-live="polite">
      <div v-if="!messages.length" class="chat-welcome">
        <strong>从一个问题开始</strong>
        <p>回答只依据课程知识图谱，引用到的知识点会在图谱里高亮。</p>
        <div class="examples">
          <button v-for="example in EXAMPLES" :key="example" type="button" @click="ask(example)">{{ example }}</button>
        </div>
      </div>
      <template v-for="(message, index) in messages" :key="index">
        <p v-if="message.role === 'user'" class="bubble user">{{ message.text }}</p>
        <div v-else class="bubble assistant" :class="{ error: message.error }">
          <p v-if="message.error">{{ message.error }}</p>
          <p v-else-if="!message.text" class="thinking"><span></span><span></span><span></span>正在检索知识图谱</p>
          <div v-else-if="!message.done" class="streaming">{{ message.text }}</div>
          <div v-else :ref="element => renderTarget(element, message)" class="markdown"></div>
          <div v-if="message.done && message.ids?.length" class="citations">
            <span>依据</span>
            <button v-for="id in message.ids" :key="id" type="button" class="neighbor"
                    :style="{ '--c': entityColor(id) }" @click="selectEntity(id)">
              <span class="dot"></span>{{ entityName(id) }}
            </button>
            <button type="button" class="text-button" @click="showCitations(message.ids)">在图谱中高亮</button>
          </div>
        </div>
      </template>
    </div>

    <form class="composer" @submit.prevent="ask(question)">
      <textarea ref="input" v-model="question" rows="1" maxlength="500" placeholder="问问 AI 助教，Enter 发送，Shift+Enter 换行"
                aria-label="向 AI 课程助教提问" @keydown="onKeydown"></textarea>
      <button v-if="streaming" type="button" class="send-button stop" aria-label="停止回答" title="停止" @click="stop">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
      </button>
      <button v-else type="submit" class="send-button" aria-label="发送问题" :disabled="!question.trim()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
      </button>
    </form>
  </section>
</template>
