import { renderAnswerMath } from "./math.js";

export function renderMarkdown(element, source) {
  if (!window.marked || !window.DOMPurify) {
    element.textContent = source;
    renderAnswerMath(element);
    return false;
  }

  const html = window.marked.parse(source, {
    breaks: true,
    gfm: true,
  });
  element.innerHTML = window.DOMPurify.sanitize(html);
  renderAnswerMath(element);
  return true;
}
