"""FastAPI 应用装配入口：同一个进程提供 /api 接口和 frontend/ 静态页面。"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .api import ai, entities, graph, system
from .api.errors import register_error_handlers

FRONTEND_DIR = Path(__file__).resolve().parents[1] / "frontend"

app = FastAPI(
    title="电磁场与波 AI 知识图谱 API",
    description="固定课程知识图谱的只读查询接口，契约见《接口契约文档.md》。",
    version="0.2.0",
)

register_error_handlers(app)
app.include_router(system.router)
app.include_router(entities.router)
app.include_router(graph.router)
app.include_router(ai.router)
# 必须在所有路由之后挂载：/api、/docs 先匹配，其余路径才去 frontend/ 找文件。
# 页面和接口同源，浏览器不跨域，所以不需要 CORS。
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
