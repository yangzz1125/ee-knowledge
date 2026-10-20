# ee-knowledge 项目导航

电磁场与波课程知识图谱，包含结构化知识数据、FastAPI 查询服务、Vue 图谱页面与基于检索的 AI 问答。

## 第一次启动

需要 Python 3.11 以上、uv 和 Node.js 20 以上。在仓库根目录运行：

```powershell
uv sync
npm --prefix frontend ci
npm --prefix frontend run build
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

打开 `http://127.0.0.1:8000/` 查看页面，`/docs` 查看 API 文档，`/api/health` 查看服务状态。AI 问答需按[首页配置说明](../README.md#ai-配置)填写 `.env`，普通图谱浏览与查询不需要模型密钥。

## 先读哪份文档

| 任务 | 文档 |
| --- | --- |
| 了解页面、功能与验收标准 | [产品需求文档](产品需求文档.md) |
| 修改知识实体、关系或校验规则 | [数据结构设计文档](数据结构设计文档.md) |
| 修改请求、响应或错误格式 | [接口契约文档](接口契约文档.md) |
| 部署、评测与常见操作 | [项目首页](../README.md) |

前三份文档继续作为产品与接口的依据，本页只负责导航。

## 代码与数据流

`data/knowledge_base.json` → `app/knowledge/` 加载与校验 → `app/api/` 查询接口 → `frontend/` 页面。

AI 问答先检索知识实体，再调用模型；`retrieved_entity_ids` 表示检索命中，`used_entity_ids` 表示回答实际引用。

| 目录 | 内容 |
| --- | --- |
| [app/domain/](../app/domain/) | 领域类型和接口模型 |
| [app/knowledge/](../app/knowledge/) | 校验、搜索、路径、检索与引用识别 |
| [app/ai/](../app/ai/) | 模型客户端 |
| [frontend/](../frontend/) | Vue 3 + Vite 页面 |
| [tests/](../tests/) | 接口自检和 RAG 评测 |

## 修改后的检查

```powershell
npm --prefix frontend run build
uv run python tests/test_api.py
uv run python tests/rag_eval.py
```

以上自检使用离线数据或模拟模型响应。`rag_eval.py --live` 才会调用真实模型。知识库在启动时加载，修改 JSON 后需要重启服务。
