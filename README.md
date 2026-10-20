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
├── main.py              创建应用、注册路由、挂载前端构建产物 frontend/dist
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
    ├── retrieval.py     AI 问答检索上下文（BM25）
    └── citations.py     识别回答实际引用的知识点
frontend/                Vue 3 + Vite，构建产物在 dist/（不入库）
├── index.html           页面入口
├── vite.config.js       开发代理 /api → 8000；构建输出 dist/
└── src/
    ├── App.vue          页面骨架：顶栏、浮层面板、图谱
    ├── store.js         全页共享状态与操作（选中、聚焦、路径、AI 引用）
    ├── api.js           后端请求与 SSE 解析
    ├── palette.js       章节颜色（节点和界面都按章节取色）
    ├── graph/
    │   ├── model.js     实体/关系 → 节点/连线，高亮规则
    │   └── graph2d.js   图谱渲染（force-graph），Obsidian 式交互
    ├── components/
    │   ├── GraphCanvas.vue   挂载图谱渲染器，镜头对焦
    │   ├── SearchBox.vue     搜索与键盘选择
    │   ├── ChapterPanel.vue  章节与类型筛选
    │   ├── EntityCard.vue    知识点详情、公式、邻居
    │   ├── PathPanel.vue     学习路径查询与沿路径飞行
    │   ├── EntityPicker.vue  路径起终点选择框
    │   └── ChatPanel.vue     右侧栏 AI 助教页签：流式回答与页面内历史
    ├── lib/             Markdown 安全渲染、KaTeX 公式渲染
    └── styles/main.css  纸面配色与浮层样式
tests/
├── test_api.py          接口自检
└── rag_eval.py          检索与引用识别评测
data/knowledge_base.json 知识库数据（人工编写）
```

数据访问与业务逻辑分离，当前使用 JSON；后续迁移 Neo4j 时主要替换 `app/knowledge/loader.py` 和 `app/knowledge/graph.py`。

## 启动

需要 Python（uv）和 Node.js 20 以上。

```powershell
uv sync
npm --prefix frontend ci
npm --prefix frontend run build
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

后端同时提供接口和 `frontend/dist/` 里构建好的页面，只需启动这一个服务。前端用相对路径 `/api` 请求接口，与页面同源，不需要 CORS。没有构建前端时后端只提供接口，日志里会提示。

改前端时用 Vite 开发服务器，保存即热更新，`/api` 自动转给 8000 端口的后端：

```powershell
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload   # 一个终端
npm --prefix frontend run dev                                        # 另一个终端，打开 http://127.0.0.1:5173/
```

启动后：

- 前端 http://127.0.0.1:8000/（开发时 http://127.0.0.1:5173/）
- 接口文档 http://127.0.0.1:8000/docs
- 健康检查 http://127.0.0.1:8000/api/health
- 类型与中文名 http://127.0.0.1:8000/api/meta

## 自检

```powershell
npm --prefix frontend run build   # 自检会检查构建产物
uv run python tests/test_api.py
```

会启动真实的 ASGI 应用跑一遍契约，覆盖搜索评分、邻居方向、路径方向、图谱悬空边、错误形状、参数校验和前端构建产物。模型调用使用模拟响应，不会消耗真实 API。

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

把 `.env.example` 复制为 `.env` 并填写：

```dotenv
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
AI_RATE_LIMIT_PER_MINUTE=10   # 同一 IP 每分钟最多提问几次，超出返回 429；0 为不限
```

`.env` 已被 Git 忽略。AI 客户端通过 OpenAI Responses 协议调用配置的服务。服务器上也可以不用 `.env`，直接设置同名环境变量，环境变量优先。

AI 提供两个接口：

```text
POST /api/ai/ask         一次性返回完整回答
POST /api/ai/ask/stream  通过 SSE 流式返回回答
```

前端在当前标签页的 `sessionStorage` 中缓存最近 10 个完整问答轮次，并通过请求的 `history` 传给后端。刷新页面会恢复，关闭标签页后清除；后端不持久化，每一轮仍会重新检索知识图谱。

## 部署到服务器

当前服务器的目录、容器、重启和更新操作见 [服务器部署记录](deployment/服务器部署.md)。Docker 镜像构建文件位于 `deployment/Dockerfile`，需要先构建 `frontend/dist/`。

给学生用的服务只需要仓库里的内容：`app/`、`frontend/`、`data/`、`pyproject.toml`、`uv.lock`。个人汇报材料不在仓库里。

1. 环境：Python 3.11 以上、[uv](https://docs.astral.sh/uv/)、Node.js 20 以上（只在构建前端时用）。
2. 拉代码、安装依赖、构建前端：

   ```bash
   git clone https://github.com/yangzz1125/ee-knowledge.git
   cd ee-knowledge
   uv sync --frozen
   npm --prefix frontend ci && npm --prefix frontend run build
   ```

3. 配置：`cp .env.example .env`，填 DeepSeek 密钥，按班级规模调整 `AI_RATE_LIMIT_PER_MINUTE`。
4. 启动，只开一个进程，不带 `--reload`：

   ```bash
   uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

   - 限流计数保存在进程内存里，开多个 worker 会各算各的，所以只开一个进程。
   - 推荐前面放 nginx 负责 HTTPS 和对外端口，uvicorn 只监听本机。不用 nginx、直接对外时改成 `--host 0.0.0.0`。

5. nginx 反向代理示例：

   ```nginx
   location / {
       proxy_pass http://127.0.0.1:8000;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_buffering off;       # AI 回答是 SSE 流，开着缓冲会等整段生成完才显示
       proxy_read_timeout 300s;   # 长回答
   }
   ```

   uvicorn 默认信任 127.0.0.1 发来的 `X-Forwarded-For`，所以限流按学生的真实 IP 计算。如果学生都经同一个出口 IP 访问（例如服务器在校外、学生都在校园网里），他们会共用一份额度，这时把上限调大或设为 0。

6. 开机自启、崩溃自动重启（systemd，路径按实际修改，`uv` 的位置用 `which uv` 查）：

   ```ini
   # /etc/systemd/system/ee-knowledge.service
   [Unit]
   Description=ee-knowledge
   After=network.target

   [Service]
   WorkingDirectory=/opt/ee-knowledge
   ExecStart=/usr/local/bin/uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo systemctl enable --now ee-knowledge
   ```

7. 更新版本：

   ```bash
   git pull && uv sync --frozen
   npm --prefix frontend ci && npm --prefix frontend run build
   sudo systemctl restart ee-knowledge
   ```

8. 检查：`curl http://127.0.0.1:8000/api/health` 返回 `"status": "ok"` 即正常。

## 改数据

知识库在启动时加载并校验。**校验不通过服务不会启动**，错误信息会指出具体是哪条数据的哪个字段。

改动 `data/knowledge_base.json` 后需要重启服务（`--reload` 只监听 `.py` 文件）。热重载记在接口契约文档的待确认事项里。

## 当前进度

- [x] 领域模型与校验规则
- [x] 接口契约
- [x] 后端查询接口
- [x] MVP 章节骨架：6 章节
- [x] 课程知识数据：127 实体 / 232 关系（其中 75 条跨章节），覆盖 6 章、全部 6 种实体类型和 9 种关系类型
- [x] 按 6 个章节补充 50 个知识点与 122 条关系，完善场论基础、静态场、时变场和电磁波知识
- [x] 知识图谱前端（Vue 3 + Vite）：Obsidian 式关系图谱、按章节上色、搜索、详情、邻居、SSE 问答和页面内历史
- [x] 路径探索：图上点亮路径，镜头可沿路径飞行
- [x] DeepSeek AI 客户端（OpenAI Responses 协议）
- [x] 当前页面内最多 10 轮连续问答
- [x] SSE 流式回答

本次知识扩充的章节分布：

| 章节 | 知识点数 | 本次新增 | 主要补充内容 |
| --- | ---: | ---: | --- |
| 矢量分析 | 15 | 6 | 标量场、保守场、拉普拉斯算子、梯度表达式、二次旋度恒等式、叠加原理 |
| 静电场 | 32 | 8 | 电荷体密度、极化强度、电位移与极化关系、导体静电平衡、电容公式、电场能量密度 |
| 恒定电流场 | 15 | 9 | 恒定电流场、电流、电荷守恒、界面条件、欧姆定律、电阻与电阻器 |
| 恒定磁场 | 20 | 9 | 磁通量、磁化、洛伦兹力、毕奥-萨伐尔公式、磁场能量密度、自感定义 |
| 时变电磁场 | 22 | 8 | 电动势、位移电流密度、全电流积分方程、电磁场边界条件、能量守恒微分式、相量法 |
| 电磁波 | 23 | 10 | 传播常数、衰减与相位常数、正入射反射系数、驻波、驻波比、趋肤深度公式、阻抗匹配 |

公式与物理条件的参考资料：[MIT《Electromagnetic Fields and Energy》](https://web.mit.edu/6.013_book/www/index.html)（极化、磁化、场能量、边界条件与传输线）和 [UT Austin 导电介质中的波传播讲义](https://farside.ph.utexas.edu/teaching/jk1/lectures/node70.html)（有耗传播与趋肤深度）。新增公式明确记录介质条件和相量约定，使用 `e^{jωt}` 时间因子时，沿正向传播的波取 `e^{−γz}`。

## 目录约定

| 目录 | 内容 |
| --- | --- |
| `app/` `frontend/` `data/` `tests/` | 项目代码与数据 |
| `docs/` | 需求、数据结构、接口契约文档 |
| `scratch/` | 临时/QA 文件（不入库） |
| `reports/` `assets/` `tools/` `learning/` | 个人汇报、配图和学习材料（只在本机，不入库，不部署） |
