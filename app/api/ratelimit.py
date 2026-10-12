"""AI 问答的按来源 IP 限流，防止个别用户短时间内大量提问、耗尽模型额度。

计数保存在进程内存里，只在单进程部署时准确：uvicorn 不要开多个 worker。
来源 IP 取自 request.client；部署在 nginx 后面时，uvicorn 默认信任 127.0.0.1 发来的
X-Forwarded-For，所以拿到的是学生的真实 IP，而不是 nginx 的地址。
"""

from __future__ import annotations

import os
import threading
import time
from collections import deque
from collections.abc import Callable

LIMIT_ENV = "AI_RATE_LIMIT_PER_MINUTE"
DEFAULT_LIMIT = 10
# 记录的来源数超过这个值时，顺手清掉窗口内已经没有请求的来源，避免字典无限增长。
_PRUNE_AT = 1000


class RateLimiter:
    """滑动窗口：每个来源在 window 秒内最多 limit 次。limit 为 0 表示不限流。"""

    def __init__(self, limit: int, window: float = 60.0, clock: Callable[[], float] = time.monotonic):
        self.limit = limit
        self.window = window
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str) -> float:
        """记一次请求。未超限返回 0；超限时不计数，返回还需等待的秒数。"""
        if not self.limit:
            return 0.0
        now = self._clock()
        with self._lock:
            if len(self._hits) > _PRUNE_AT:
                self._hits = {k: v for k, v in self._hits.items() if v and now - v[-1] < self.window}
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] >= self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return self.window - (now - hits[0])
            hits.append(now)
            return 0.0


def configured_limit() -> int:
    """从环境变量读取每个 IP 每分钟的提问上限；配置写错时启动即报错，而不是静默不限流。"""
    raw = os.getenv(LIMIT_ENV, str(DEFAULT_LIMIT)).strip()
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{LIMIT_ENV} 必须是非负整数，当前为 {raw!r}") from exc
    if value < 0:
        raise ValueError(f"{LIMIT_ENV} 必须是非负整数，当前为 {raw!r}")
    return value

