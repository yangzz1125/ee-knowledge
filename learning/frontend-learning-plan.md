---
type: project
date_created: 2026-09-09
last_updated: 2026-09-09
tags: [学习计划, 前端, HTML, CSS, JavaScript, Vue]
sources:
  - https://github.com/qianguyihao/Web
  - https://github.com/javascript-tutorial/zh.javascript.info
  - https://github.com/microsoft/Web-Dev-For-Beginners
  - https://github.com/vuejs/docs
---

# 前端入门学习计划：电磁场与波 AI 知识图谱

## 学习目标

用较短时间建立前端入门能力，能够看懂、修改并逐步实现“电磁场与波 AI 知识图谱”的前端页面。

短期不追求成为专业前端工程师，先达到以下目标：

- 能看懂 HTML 页面结构。
- 能用 CSS 完成基础布局、卡片和响应式页面。
- 能用 JavaScript 实现点击、搜索和页面动态更新。
- 能使用 `fetch` 请求 FastAPI 后端接口。
- 能看懂 Vue 组件，并用 Vue 重做部分页面。

## 学习原则

1. 每次只学习一个小概念，并创建一个可以直接打开查看的 Demo。
2. 先理解 HTML、CSS、JavaScript，再进入 Vue。
3. 所有示例都围绕电磁场与波知识图谱，不做脱离项目的练习。
4. 先完成最小功能，再逐步增加样式和复杂度。
5. 学习笔记先记录到 `软件开发笔记/`；稳定后的通用知识再整理到 `llm-wiki/`。
6. 未经确认，不自动新增或移动 Obsidian 笔记。

## 当前进度

- [x] HTML 文档结构：`html`、`head`、`body`。
- [x] 常用标签：标题、段落、列表、按钮、语义化标签。
- [x] HTML 注释和属性：`id`、`class`、`data-*`。
- [x] CSS 基础语法和选择器。
- [x] CSS 盒模型、颜色、字体、边距、内边距和圆角。
- [x] 外部 CSS 文件。
- [x] Flex 布局：方向、对齐、间距、换行和伸缩。
- [x] 响应式布局和媒体查询。
- [x] JavaScript 点击事件和 DOM 基础。
- [ ] JavaScript 基础语法系统学习。
- [ ] `fetch` 请求 FastAPI。
- [ ] 动态渲染真实知识图谱数据。
- [ ] Vue 3 和 Vite。

## 十天入门计划

### 第一天：JavaScript 变量和数据类型

- [ ] 学习 `let`、`const` 和基本数据类型。
- [ ] 学习字符串、数字、布尔值和 `null`。
- [ ] 创建一个显示课程信息的简单 Demo。

**验收：**能解释变量是什么，并能修改页面中的课程名称。

### 第二天：数组、对象和函数

- [ ] 学习数组和对象。
- [ ] 学习函数的定义、参数和返回值。
- [ ] 用对象表示一个电磁场知识点。

**验收：**能用数组保存多个知识点，并用函数显示一个知识点。

### 第三天：条件判断和循环

- [ ] 学习 `if`、`else`。
- [ ] 学习 `for` 和 `forEach`。
- [ ] 根据知识点类型显示不同内容。

**验收：**能遍历知识点列表，并筛选出“基本定律”。

### 第四天：DOM 查询和修改

- [ ] 学习 `querySelector`。
- [ ] 学习 `querySelectorAll`。
- [ ] 学习 `textContent` 和元素属性。

**验收：**能点击知识点按钮并更新右侧详情区域。

### 第五天：事件处理

- [ ] 学习 `addEventListener`。
- [ ] 学习点击事件和输入事件。
- [ ] 给章节导航和搜索框添加交互。

**验收：**能点击章节并更新当前选中章节。

### 第六天：异步和网络请求

- [ ] 学习 Promise 的基本概念。
- [ ] 学习 `async` 和 `await`。
- [ ] 学习 `fetch` 的基本用法。

**验收：**能请求 `http://127.0.0.1:8001/api/health` 并显示返回结果。

### 第七天：前端请求知识图谱 API

- [ ] 请求 `/api/graph`。
- [ ] 读取返回的 `course`、`nodes` 和 `edges`。
- [ ] 将真实节点显示在页面上。

**验收：**页面不再依赖写死的知识点内容。

### 第八天：完成基础页面交互

- [ ] 实现知识点搜索。
- [ ] 实现知识点详情展示。
- [ ] 实现邻居知识点展示。

**验收：**用户可以搜索、点击并查看知识点关系。

### 第九天：Vue 基础

- [ ] 安装 Node.js 和 Vite。
- [ ] 创建 Vue 3 项目。
- [ ] 学习组件、模板、事件和响应式数据。

**验收：**用 Vue 实现一个知识点列表和详情面板。

### 第十天：迁移一个真实功能

- [ ] 将 HTML Demo 中的知识点详情区域迁移到 Vue。
- [ ] 使用 Vue 调用 FastAPI。
- [ ] 对比原生 JavaScript 和 Vue 的实现方式。

**验收：**Vue 页面能够请求后端，并显示真实知识点详情。

## 暂时不学习

- 不立即学习 React、Angular 等其他框架。
- 不立即学习 TypeScript 高级用法。
- 不立即学习复杂状态管理。
- 不立即学习 Webpack 深层原理。
- 不立即接入 Neo4j 和 AI 问答。

## 推荐资料

- [千古前端教程](https://github.com/qianguyihao/Web)：中文主线资料，按 HTML、CSS、JavaScript 和 Vue 组织。
- [现代 JavaScript 中文教程](https://github.com/javascript-tutorial/zh.javascript.info)：用于系统补充 JavaScript 和 DOM。
- [Microsoft Web Development for Beginners](https://github.com/microsoft/Web-Dev-For-Beginners)：用于项目练习和阶段验收。
- [Vue 3 官方文档](https://github.com/vuejs/docs)：进入 Vue 阶段后使用。

## 项目验收路线

```text
静态 HTML 页面
    ↓
CSS 布局和响应式页面
    ↓
JavaScript 点击和搜索
    ↓
fetch 请求 FastAPI
    ↓
动态显示 nodes 和 edges
    ↓
Vue 组件化页面
```

## 关联笔记

- [[软件开发笔记/前端学习笔记]]
- [[llm-wiki/wiki/concepts/fastapi-backend-api|FastAPI 后端开发入门]]
- [[llm-wiki/wiki/concepts/http-request-response|HTTP 请求与响应]]
