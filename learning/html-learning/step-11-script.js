// 找到所有知识点按钮和详情区域
const buttons = document.querySelectorAll(".knowledge-button");
const detailName = document.querySelector("#detail-name");
const detailDescription = document.querySelector("#detail-description");
const detailFormula = document.querySelector("#detail-formula");

// 给每一个知识点按钮绑定点击事件
buttons.forEach(function (button) {
  button.addEventListener("click", function () {
    detailName.textContent = button.dataset.name;
    detailDescription.textContent = button.dataset.description;
    detailFormula.textContent = button.dataset.formula;
  });
});
