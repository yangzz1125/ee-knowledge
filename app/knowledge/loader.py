"""从 JSON 文件加载并校验知识库。"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import ValidationError

from ..domain.entities import KnowledgeBase
from .errors import KnowledgeBaseError
from .validation import format_validation_errors, validate_knowledge_base

DATA_FILE = Path(__file__).resolve().parents[2] / "data" / "knowledge_base.json"


def load_knowledge_base(path: Path = DATA_FILE) -> KnowledgeBase:
    """读取知识库；文件、结构或业务规则错误均抛出 KnowledgeBaseError。"""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise KnowledgeBaseError([f"找不到知识库文件：{path}"]) from None
    except json.JSONDecodeError as exc:
        raise KnowledgeBaseError([f"{path} 不是合法 JSON：{exc}"]) from None

    try:
        knowledge_base = KnowledgeBase.model_validate(raw)
    except ValidationError as exc:
        raise KnowledgeBaseError(format_validation_errors(exc)) from None

    errors = validate_knowledge_base(knowledge_base)
    if errors:
        raise KnowledgeBaseError(errors)
    return knowledge_base
