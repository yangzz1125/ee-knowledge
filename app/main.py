"""FastAPI 应用装配入口。"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import ai, entities, graph, system
from .api.errors import register_error_handlers

app = FastAPI(
    title="电磁场与波 AI 知识图谱 API",
    description="固定课程知识图谱的只读查询接口，契约见《接口契约文档.md》。",
    version="0.2.0",
)

# 本地单用户工具允许 file:// 和任意本地静态服务访问。
# 部署到公网前必须改为明确的来源列表。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

register_error_handlers(app)
app.include_router(system.router)
app.include_router(entities.router)
app.include_router(graph.router)
app.include_router(ai.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
