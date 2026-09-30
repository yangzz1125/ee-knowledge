const nodes = [
  { name: "梯度", type: "数学概念" },
  { name: "高斯定律（电场）", type: "基本定律" },
  { name: "波动方程", type: "基本方程" }
];

// 定义一个函数：接收一个知识点，返回格式化后的文字
function formatNode(node) {
  return `${node.name}（${node.type}）`;
}

const nodeList = document.querySelector("#node-list");

nodes.forEach(function (node) {
  const listItem = document.createElement("li");

  // 调用函数，而不是重复拼接文字的逻辑
  listItem.textContent = formatNode(node);
  nodeList.append(listItem);
});
