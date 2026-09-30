import { streamAnswer } from "./api.js";
import { renderMarkdown } from "./markdown.js";

const HISTORY_KEY = "ee-conversation-history-v1";

function loadStoredHistory() {
  try {
    const value = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(turn =>
        typeof turn?.question === "string"
        && typeof turn?.answer === "string"
        && Array.isArray(turn?.used_entity_ids)
      )
      .slice(-10)
      .map(turn => ({
        question: turn.question.slice(0, 500),
        answer: turn.answer.slice(0, 4000),
        used_entity_ids: turn.used_entity_ids.filter(id => typeof id === "string"),
      }));
  } catch {
    try { sessionStorage.removeItem(HISTORY_KEY); } catch { /* 存储不可用时退化为内存历史。 */ }
    return [];
  }
}

function saveHistory(history) {
  try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* 保留内存历史。 */ }
}

export function initializeChat(options) {
  const {
    form,
    input,
    sendButton,
    conversation,
    clearButton,
    getContextEntityId,
    entityName,
    notify,
  } = options;

  let history = loadStoredHistory();
  let activeController = null;

  function addMessage(role, text = "") {
    conversation.querySelector(".welcome-message")?.remove();
    const message = document.createElement("div");
    message.className = `message ${role === "user" ? "user" : "assistant-message"}`;
    message.textContent = text;
    conversation.append(message);
    conversation.scrollTop = conversation.scrollHeight;
    return message;
  }

  function showReferences(message, ids) {
    if (!ids.length) return;
    const references = document.createElement("div");
    references.className = "message-references";
    references.dataset.entityIds = JSON.stringify(ids);
    references.textContent = `依据：${ids.map(entityName).join("、")}`;
    message.append(references);
  }

  function refreshReferences() {
    conversation.querySelectorAll(".message-references").forEach(element => {
      const ids = JSON.parse(element.dataset.entityIds || "[]");
      element.textContent = `依据：${ids.map(entityName).join("、")}`;
    });
  }

  function restoreConversation() {
    if (!history.length) return;
    conversation.textContent = "";
    history.forEach(turn => {
      addMessage("user", turn.question);
      const answerMessage = addMessage("assistant");
      renderMarkdown(answerMessage, turn.answer);
      showReferences(answerMessage, turn.used_entity_ids);
    });
  }

  restoreConversation();

  async function submitQuestion(question) {
    if (activeController) return;
    addMessage("user", question);
    const answerMessage = addMessage("assistant", "正在组织知识…");
    answerMessage.classList.add("streaming");
    const controller = new AbortController();
    activeController = controller;
    sendButton.disabled = true;
    let answer = "";
    let references = [];
    let failed = false;

    try {
      await streamAnswer(
        {
          question,
          context_entity_id: getContextEntityId(),
          history,
        },
        (event, data) => {
          if (event === "metadata") references = data.used_entity_ids || [];
          if (event === "delta") {
            if (!answer) answerMessage.textContent = "";
            answer += data.text;
            answerMessage.textContent = answer;
            conversation.scrollTop = conversation.scrollHeight;
          }
          if (event === "error") {
            failed = true;
            answerMessage.classList.remove("streaming");
            answerMessage.classList.add("error");
            answerMessage.textContent = data.message || "回答生成失败";
          }
          if (event === "done" && !failed) {
            answerMessage.classList.remove("streaming");
            renderMarkdown(answerMessage, answer);
            showReferences(answerMessage, references);
          }
        },
        controller.signal,
      );

      if (!failed && answer) {
        history.push({
          question,
          answer: answer.slice(0, 4000),
          used_entity_ids: references,
        });
        history = history.slice(-10);
        saveHistory(history);
      }
    } catch (error) {
      failed = true;
      answerMessage.classList.remove("streaming");
      answerMessage.classList.add("error");
      answerMessage.textContent = error.name === "AbortError" ? "回答已停止" : error.message;
    } finally {
      activeController = null;
      sendButton.disabled = false;
      input.focus();
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return notify("请输入一个问题");
    input.value = "";
    input.style.height = "auto";
    submitQuestion(question);
  });

  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 110)}px`;
  });

  clearButton.addEventListener("click", () => {
    activeController?.abort();
    history = [];
    try { sessionStorage.removeItem(HISTORY_KEY); } catch { /* 内存历史已经清空。 */ }
    conversation.innerHTML = `
      <div class="welcome-message">
        <strong>从一个问题开始</strong>
        <p>试试“高斯定律为什么需要闭合曲面？”</p>
      </div>`;
    notify("对话已清空");
  });

  return {
    ask(question) {
      input.value = question;
      input.focus();
    },
    refreshReferences,
  };
}
