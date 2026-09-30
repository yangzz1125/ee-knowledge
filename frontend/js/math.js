const DELIMITERS = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "\\(", right: "\\)", display: false },
  { left: "$", right: "$", display: false },
];

export function renderAnswerMath(element) {
  if (typeof window.renderMathInElement !== "function") return false;
  window.renderMathInElement(element, {
    delimiters: DELIMITERS,
    throwOnError: false,
    strict: false,
  });
  return true;
}

export function renderFormula(element, latex, fallback = latex) {
  if (latex && window.katex) {
    window.katex.render(latex, element, {
      displayMode: true,
      throwOnError: false,
      strict: false,
    });
    return;
  }
  element.textContent = fallback || "";
}
