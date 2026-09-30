// 数组：用来保存多个有顺序的数据
const conceptNames = ["梯度", "散度", "旋度"];

// 对象：用键值对描述一个具体知识点
const maxwellNode = {
  name: "麦克斯韦方程组",
  chapter: "时变电磁场",
  formula: "∇ · D = ρᵥ；∇ · B = 0；∇ × E = −∂B/∂t"
};

// 通过下标访问数组中的元素
document.querySelector("#concept-0").textContent = conceptNames[0];
document.querySelector("#concept-1").textContent = conceptNames[1];
document.querySelector("#concept-2").textContent = conceptNames[2];

// 通过键访问对象中的值
document.querySelector("#node-name").textContent = maxwellNode.name;
document.querySelector("#node-chapter").textContent = maxwellNode.chapter;
document.querySelector("#node-formula").textContent = maxwellNode.formula;
