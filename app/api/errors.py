"""HTTP 接口的统一错误处理。"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..knowledge import EntityNotFound


def error_response(
    status_code: int,
    code: str,
    message: str,
    field: str | None = None,
) -> JSONResponse:
    """构造接口统一使用的错误响应。"""
    return JSONResponse(
        status_code=status_code,
        content={"detail": {"code": code, "message": message, "field": field}},
    )


async def http_exception_handler(
    _request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """把 HTTP 异常转换为统一错误结构。"""
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail:
        return JSONResponse(status_code=exc.status_code, content={"detail": detail})
    code = "not_found" if exc.status_code == 404 else "internal_error"
    return error_response(exc.status_code, code, str(detail))


async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    """把 FastAPI 参数校验错误转换为统一错误结构。"""
    first = exc.errors()[0]
    parts = [str(part) for part in first["loc"] if part not in ("query", "body", "path")]
    field = ".".join(parts) or None
    message = f"参数不合法：{field or '请求体'}（{first['msg']}）"
    return error_response(422, "invalid_parameter", message, field)


async def entity_not_found_handler(_request: Request, exc: EntityNotFound) -> JSONResponse:
    """实体不存在统一返回 404。"""
    return error_response(404, "entity_not_found", f"未找到知识点：{exc.entity_id}", exc.field)


async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """兜底处理未捕获异常，避免直接暴露框架错误格式。"""
    return error_response(500, "internal_error", f"服务内部错误：{exc}")


def register_error_handlers(app: FastAPI) -> None:
    """为 FastAPI 应用注册全部统一错误处理器。"""
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(EntityNotFound, entity_not_found_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
