// 使用 const 保存不会重新赋值的课程信息
const courseName = "电磁场与波";
const nodeCount = 23;

// 使用 let 保存以后可能变化的状态
let isLearning = true;

// 把 JavaScript 变量显示到 HTML 页面中
document.querySelector("#course-name").textContent = courseName;
document.querySelector("#node-count").textContent = nodeCount;
document.querySelector("#is-learning").textContent = isLearning ? "是" : "否";
