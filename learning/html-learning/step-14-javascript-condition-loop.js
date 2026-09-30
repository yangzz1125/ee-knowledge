const nodes = [
  { name: "梯度", type: "数学概念" },
  { name: "高斯定律（电场）", type: "基本定律" },
  { name: "波动方程", type: "基本方程" },
  { name: "法拉第定律", type: "基本定律" }
];

// 使用 for 循环依次处理每一个知识点
for (let i = 0; i < nodes.length; i++) {
  const node = nodes[i];
  const element = document.querySelector(`#node-${i}`);

  element.textContent = `${node.name}（${node.type}）`;

  // 使用 if 判断知识点类型
  if (node.type === "基本定律") {
    element.textContent += " —— 重点";
  }
}
