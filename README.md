# ee-knowledge

电磁场与波 AI 知识图谱。

把「电磁场与波」课程的概念、物理量、定律、公式、方法和应用整理成结构化知识图谱，提供搜索、关系探索、学习路径和 AI 问答。

## 文档

三份文档是唯一依据，改代码前先看：

| 文档 | 作用 |
| --- | --- |
| [产品需求文档.md](docs/产品需求文档.md) | 要做什么：页面、功能、验收标准 |
| [数据结构设计文档.md](docs/数据结构设计文档.md) | 数据长什么样：对象、字段、20 条校验规则 |
| [接口契约文档.md](docs/接口契约文档.md) | 前后端怎么说话：URL、参数、响应、错误 |

## 代码结构

```text
app/
├── main.py              创建应用、注册中间件和路由
├── dependencies.py      加载并提供共享知识图实例
├── ai/
│   └── client.py        DeepSeek Responses API 客户端
├── api/
│   ├── errors.py        统一错误处理
│   ├── system.py        系统、元数据和章节接口
│   ├── entities.py      实体搜索、详情和邻居接口
│   ├── graph.py         路径和图谱接口
│   └── ai.py            AI 问答接口
├── domain/
│   ├── types.py         基础类型、枚举和显示名称
│   ├── entities.py      与知识库 JSON 对应的领域模型
│   ├── results.py       搜索、邻居、路径和图谱查询结果
│   └── api.py           HTTP 请求和响应类型
└── knowledge/
    ├── errors.py        知识库异常
    ├── loader.py        JSON 读取和加载
    ├── validation.py    知识库业务校验
    ├── graph.py         搜索、邻居、路径和图谱算法
    └── retrieval.py     AI 问答检索上下文
frontend/
├── index.html           Apple 风格应用界面
├── styles.css           视觉系统与响应式布局
└── js/
    ├── api.js           后端请求与 SSE 解析
    ├── graph.js         SVG 知识图谱：力导向布局、缩放平移
    ├── chat.js          流式问答与页面内历史
    ├── markdown.js      Markdown 安全渲染
    ├── math.js          KaTeX 公式渲染
    └── app.js           页面状态和交互装配
tests/test_api.py        接口自检
data/knowledge_base.json 知识库数据（人工编写）
```

数据访问与业务逻辑分离，当前使用 JSON；后续迁移 Neo4j 时主要替换 `app/knowledge/loader.py` 和 `app/knowledge/graph.py`。

## 启动

```powershell
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

**端口固定为 8000**，前端请求地址也必须用这个端口。

另开一个终端启动前端：

```powershell
python -m http.server 5173 -d frontend
```

启动后：

- 前端 http://127.0.0.1:5173
- 接口文档 http://127.0.0.1:8000/docs
- 健康检查 http://127.0.0.1:8000/api/health
- 类型与中文名 http://127.0.0.1:8000/api/meta

## 自检

```powershell
uv run python tests/test_api.py
```

会启动真实的 ASGI 应用跑一遍契约，覆盖搜索评分、邻居方向、路径方向、图谱悬空边、错误形状和参数校验。模型调用使用模拟响应，不会消耗真实 API。

## RAG 评测

```powershell
uv run python tests/rag_eval.py          # 离线：检索评测 + 引用识别评测
uv run python tests/rag_eval.py --live   # 再用真实模型回答，对比检索命中与实际引用
```

- **检索评测**：每个问题标好应该命中的知识点，输出召回率和课程外问题的拒答情况。
- **引用识别评测**：给定回答，检查「实际引用了哪些知识点」的识别是否正确。
- **`--live`**：真实调用模型（消耗 API），列出每个问题「检索命中 / 实际引用 / 命中但没用到」，并统计检索命中的知识点有多少被回答用到。

任何一项低于门槛时以非零状态码退出。改检索逻辑或扩充数据后都应该跑一遍。

接口同时返回 `retrieved_entity_ids`（检索命中）和 `used_entity_ids`（回答实际引用），页面上的「依据」显示后者。

检索用的是按字段加权的 BM25（中文按相邻两字切词），实现在 `app/knowledge/retrieval.py`。

## AI 配置

本地 `.env` 需要配置：

```dotenv
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

`.env` 已被 Git 忽略。AI 客户端通过 OpenAI Responses 协议调用配置的服务。

AI 提供两个接口：

```text
POST /api/ai/ask         一次性返回完整回答
POST /api/ai/ask/stream  通过 SSE 流式返回回答
```

前端在当前标签页的 `sessionStorage` 中缓存最近 10 个完整问答轮次，并通过请求的 `history` 传给后端。刷新页面会恢复，关闭标签页后清除；后端不持久化，每一轮仍会重新检索知识图谱。

## 改数据

知识库在启动时加载并校验。**校验不通过服务不会启动**，错误信息会指出具体是哪条数据的哪个字段。

改动 `data/knowledge_base.json` 后需要重启服务（`--reload` 只监听 `.py` 文件）。热重载记在接口契约文档的待确认事项里。

## 当前进度

- [x] 领域模型与校验规则
- [x] 接口契约
- [x] 后端查询接口
- [x] MVP 章节骨架：6 章节
- [x] 扩充草稿数据：77 实体 / 110 关系（其中 40 条跨章节），覆盖 6 章、全部 6 种实体类型和 9 种关系类型（待人工审核）
- [ ] 按 6 个章节扩充课程知识数据
- [x] Apple 风格正式前端：图谱、搜索、详情、邻居、SSE 问答和页面内历史
- [x] 路径探索前端界面（学习路径标签页，图上按顺序展示）
- [x] DeepSeek AI 客户端（OpenAI Responses 协议）
- [x] 当前页面内最多 10 轮连续问答
- [x] SSE 流式回答

## 参考项目

`reference-projects/` 放的是只用于源码学习的外部项目，不参与构建，已在 `.gitignore` 中排除。

## 目录约定

| 目录 | 内容 |
| --- | --- |
| `app/` `frontend/` `data/` `tests/` | 项目代码与数据 |
| `docs/` | 需求、数据结构、接口契约文档 |
| `reports/` | 调研汇报稿、docx/pptx 及配图 |
| `assets/` | 汇报用图表和素材 |
| `tools/` | 生成汇报文档和图表的脚本 |
| `learning/` | 前端学习笔记和练习页面 |
| `scratch/` | 临时/QA 文件（不入库） |
