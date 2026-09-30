const nodes = [
  { name: "梯度", type: "数学概念" },
  { name: "高斯定律（电场）", type: "基本定律" },
  { name: "波动方程", type: "基本方程" },
  { name: "法拉第定律", type: "基本定律" }
];

const nodeList = document.querySelector("#node-list");

// 遍历知识点数组
nodes.forEach(function (node) {
  // 创建一个新的 li 元素
  const listItem = document.createElement("li");

  // 设置 li 中显示的文字
  listItem.textContent = `${node.name}（${node.type}）`;

  // 把新创建的 li 放进 ul 中
  nodeList.append(listItem);
});
