import { renderAnswerMath } from "./math.js";

// Markdown 会吃掉公式里的反斜杠转义（\, \{ \\）和 * _，所以先把公式换成占位符，
// 渲染完 Markdown 再原样放回，最后交给 KaTeX。顺序与 math.js 的分隔符一致，$$ 必须先于 $。
const MATH_PATTERN = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$/g;

const escapeHtml = text => text
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

export function renderMarkdown(element, source) {
  if (!window.marked || !window.DOMPurify) {
    element.textContent = source;
    renderAnswerMath(element);
    return false;
  }

  const formulas = [];
  const protectedSource = source.replace(MATH_PATTERN, match => {
    formulas.push(match);
    return `MATHPLACEHOLDER${formulas.length - 1}END`;
  });
  const html = window.marked.parse(protectedSource, {
    breaks: true,
    gfm: true,
  });
  element.innerHTML = window.DOMPurify.sanitize(html).replace(
    /MATHPLACEHOLDER(\d+)END/g,
    (_, index) => escapeHtml(formulas[Number(index)]),
  );
  renderAnswerMath(element);
  return true;
}
