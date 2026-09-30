// 保存从后端加载的知识点。
// 使用 let 是因为数组内容会在请求成功后赋值。
let nodes = [];
let selectedNodeId = null;

const searchInput = document.querySelector("#search-input");
const resultCount = document.querySelector("#result-count");
const nodeList = document.querySelector("#node-list");
const apiStatus = document.querySelector("#api-status");
const nodeDetail = document.querySelector("#node-detail");
const detailName = document.querySelector("#detail-name");
const detailType = document.querySelector("#detail-type");
const detailChapter = document.querySelector("#detail-chapter");
const detailSummary = document.querySelector("#detail-summary");
const detailFormula = document.querySelector("#detail-formula");
const detailTags = document.querySelector("#detail-tags");
const neighborList = document.querySelector("#neighbor-list");

// 把一个知识点对象转换成页面上显示的文字。
function formatNode(node) {
  return `${node.name}（${node.type}）`;
}

// 根据传入的知识点数组，重新生成页面上的列表。
function renderNodes(nodeData) {
  nodeList.textContent = "";

  nodeData.forEach(function (node) {
    const listItem = document.createElement("li");
    const nodeButton = document.createElement("button");
    nodeButton.textContent = formatNode(node);
    nodeButton.dataset.nodeId = node.id;

    if (node.id === selectedNodeId) {
      nodeButton.classList.add("active");
    }

    listItem.append(nodeButton);
    nodeList.append(listItem);
  });

  resultCount.textContent = `共找到 ${nodeData.length} 个知识点`;
}

// 根据按钮中的节点 id，找到完整的节点对象。
function findNodeById(nodeId) {
  return nodes.find(function (node) {
    return node.id === nodeId;
  });
}

// 处理节点按钮点击：普通节点列表和关联节点列表都可以复用。
function handleNodeButtonClick(event) {
  if (event.target.tagName !== "BUTTON") {
    return;
  }

  const nodeId = event.target.dataset.nodeId;
  selectedNodeId = nodeId;

  document.querySelectorAll("#node-list button, #neighbor-list button")
    .forEach(function (button) {
      button.classList.remove("active");
    });

  event.target.classList.add("active");

  const selectedNode = findNodeById(nodeId);

  if (selectedNode) {
    showNodeDetail(selectedNode);
  }
}

// 事件委托：列表中的按钮是动态生成的，所以给列表统一绑定事件。
nodeList.addEventListener("click", handleNodeButtonClick);

// 关联节点也使用同一个点击处理函数。
neighborList.addEventListener("click", handleNodeButtonClick);

// 在详情区域显示用户点击的知识点。
function showNodeDetail(node) {
  nodeDetail.hidden = false;
  detailName.textContent = node.name;
  detailType.textContent = `类型：${node.type}`;
  detailChapter.textContent = `章节：${node.chapter}`;
  detailSummary.textContent = node.summary;
  detailFormula.textContent = node.formula
    ? `公式：${node.formula}`
    : "公式：暂无";

  detailTags.textContent = "";
  node.tags.forEach(function (tagText) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = `#${tagText}`;
    detailTags.append(tag);
  });

  loadNeighbors(node.id);
}

// 根据当前知识点的 id，从后端加载关联知识点。
async function loadNeighbors(nodeId) {
  neighborList.textContent = "正在加载关联知识点...";

  try {
    const response = await fetch(
      `http://127.0.0.1:8001/api/nodes/${nodeId}/neighbors`
    );

    if (!response.ok) {
      throw new Error(`关联节点请求失败：${response.status}`);
    }

    const neighbors = await response.json();
    neighborList.textContent = "";

    neighbors.forEach(function (neighbor) {
      const listItem = document.createElement("li");
      const neighborButton = document.createElement("button");
      neighborButton.dataset.nodeId = neighbor.node.id;
      neighborButton.textContent =
        `${neighbor.node.name}（${neighbor.edge.relation}）`;

      if (neighbor.node.id === selectedNodeId) {
        neighborButton.classList.add("active");
      }

      listItem.append(neighborButton);
      neighborList.append(listItem);
    });

    if (neighbors.length === 0) {
      neighborList.textContent = "暂无关联知识点";
    }
  } catch (error) {
    neighborList.textContent = "关联知识点加载失败";
    console.error(error);
  }
}

// 从 FastAPI 后端读取完整知识图谱。
async function loadGraph() {
  try {
    const response = await fetch("http://127.0.0.1:8001/api/graph");

    if (!response.ok) {
      throw new Error(`请求失败：${response.status}`);
    }

    const graph = await response.json();
    nodes = graph.nodes;

    apiStatus.textContent = `已加载课程：${graph.course.name}`;
    renderNodes(nodes);
  } catch (error) {
    apiStatus.textContent = "后端连接失败，请确认 FastAPI 正在运行。";
    console.error(error);
  }
}

// 用户每次输入文字时执行搜索。
searchInput.addEventListener("input", function () {
  const keyword = searchInput.value.trim().toLowerCase();

  const filteredNodes = nodes.filter(function (node) {
    const searchableText = `${node.name} ${node.type}`.toLowerCase();
    return searchableText.includes(keyword);
  });

  renderNodes(filteredNodes);
});

loadGraph();
