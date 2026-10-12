import katex from "katex";
import renderMathInElement from "katex/contrib/auto-render";

const DELIMITERS = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "\\(", right: "\\)", display: false },
  { left: "$", right: "$", display: false },
];

/** 渲染 AI 回答等混排文本里的公式。 */
export function renderAnswerMath(element) {
  renderMathInElement(element, {
    delimiters: DELIMITERS,
    throwOnError: false,
    strict: false,
  });
}

/** 把单条 LaTeX 渲染成 HTML 字符串（展示模式）。 */
export function formulaHtml(latex) {
  return katex.renderToString(latex, {
    displayMode: true,
    throwOnError: false,
    strict: false,
  });
}
