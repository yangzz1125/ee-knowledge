FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app
RUN pip install --no-cache-dir uv==0.12.16
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --python /usr/local/bin/python
COPY app ./app
COPY data/knowledge_base.json ./data/knowledge_base.json
COPY frontend/dist ./frontend/dist

USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["/app/.venv/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).read()"]
CMD ["/app/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "172.17.0.1"]
