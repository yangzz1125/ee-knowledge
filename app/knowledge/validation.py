"""知识库结构之外的业务校验规则。"""

from __future__ import annotations

from pydantic import ValidationError

from ..domain.entities import FormulaEntity, KnowledgeBase, QuantityEntity
from ..domain.types import ENTITY_TYPE_ORDER, SUPPORTED_SCHEMA_VERSIONS

_PYDANTIC_MESSAGES_ZH: dict[str, str] = {
    "Field required": "缺少这个字段",
    "Extra inputs are not permitted": "该类型不允许这个字段（字段名拼错，或者 type 选错了）",
    "Input should be a valid string": "必须是字符串",
    "Input should be a valid list": "必须是数组",
    "Input should be a valid integer": "必须是整数",
    "Input should be 'scalar' or 'vector'": "只能是 scalar 或 vector",
}

_ENTITY_TYPE_NAMES = frozenset(ENTITY_TYPE_ORDER)


def format_validation_errors(exc: ValidationError) -> list[str]:
    """把 Pydantic 错误路径整理成中文定位信息。"""
    problems = []
    for error in exc.errors():
        location = list(error["loc"])
        type_hint = None
        parts: list[str] = []
        for index, part in enumerate(location):
            if isinstance(part, int):
                if parts:
                    parts[-1] = f"{parts[-1]}[{part}]"
                continue
            # 可辨识联合会插入实体类型名，它不是实际数据字段。
            if (
                index > 0
                and isinstance(location[index - 1], int)
                and part in _ENTITY_TYPE_NAMES
            ):
                type_hint = part
                continue
            parts.append(str(part))
        where = ".".join(parts) or "知识库"
        suffix = f"（type={type_hint}）" if type_hint else ""
        message = _PYDANTIC_MESSAGES_ZH.get(error["msg"], error["msg"])
        problems.append(f"{where}{suffix}：{message}")
    return problems


def validate_knowledge_base(kb: KnowledgeBase) -> list[str]:
    """执行 Pydantic 类型系统无法表达的知识库业务规则。"""
    errors: list[str] = []

    # 规则 1：结构版本必须受后端支持。
    if kb.schema_version not in SUPPORTED_SCHEMA_VERSIONS:
        supported = "、".join(sorted(SUPPORTED_SCHEMA_VERSIONS))
        errors.append(
            f"schema_version={kb.schema_version!r} 不受支持，当前支持：{supported}"
        )

    # 规则 2、18、19：章节 ID、顺序、层级和名称。
    chapter_ids: set[str] = set()
    orders: set[int] = set()
    for index, chapter in enumerate(kb.chapters):
        where = f"chapters[{index}] (id={chapter.id})"
        if chapter.id in chapter_ids:
            errors.append(f"{where}：章节 ID 重复")
        chapter_ids.add(chapter.id)
        if chapter.order < 1:
            errors.append(f"{where}：order 必须大于等于 1，实际 {chapter.order}")
        elif chapter.order in orders:
            errors.append(f"{where}：order={chapter.order} 与其他章节重复")
        orders.add(chapter.order)
        if chapter.parent_id is not None:
            errors.append(
                f"{where}：当前阶段 parent_id 必须为 null，实际 {chapter.parent_id!r}"
            )
        if not chapter.name.strip():
            errors.append(f"{where}：name 不能为空")

    # 规则 3、5、17：实体 ID、章节引用和必填文字。
    entity_ids: set[str] = set()
    for index, entity in enumerate(kb.entities):
        where = f"entities[{index}] (id={entity.id})"
        if entity.id in entity_ids:
            errors.append(f"{where}：实体 ID 重复")
        entity_ids.add(entity.id)
        if entity.chapter_id not in chapter_ids:
            errors.append(
                f"{where}：chapter_id={entity.chapter_id!r} 指向不存在的章节"
            )
        for field_name in ("name", "summary"):
            if not getattr(entity, field_name).strip():
                errors.append(f"{where}：{field_name} 不能为空")

    by_id = {entity.id: entity for entity in kb.entities}

    # 规则 4、6、15、17：关系引用、自环、重复和描述。
    seen_relations: set[tuple[str, str, str]] = set()
    for index, relation in enumerate(kb.relations):
        where = (
            f"relations[{index}] "
            f"({relation.source_id} --{relation.type}--> {relation.target_id})"
        )
        for field_name in ("source_id", "target_id"):
            value = getattr(relation, field_name)
            if value not in entity_ids:
                errors.append(f"{where}：{field_name}={value!r} 指向不存在的实体")
        if relation.source_id == relation.target_id:
            errors.append(f"{where}：关系不允许起点和终点相同")
        key = (relation.source_id, relation.target_id, relation.type)
        if key in seen_relations:
            errors.append(f"{where}：与前面某条关系的起点、终点、类型完全相同")
        seen_relations.add(key)
        if not relation.description.strip():
            errors.append(f"{where}：description 不能为空")

    # 规则 7、13、14：公式内容和变量引用。
    for index, entity in enumerate(kb.entities):
        if not isinstance(entity, FormulaEntity):
            continue
        where = f"entities[{index}] (id={entity.id})"
        if not entity.details.latex.strip():
            errors.append(f"{where}：details.latex 不能为空")
        for variable_index, variable in enumerate(entity.details.variables):
            variable_where = f"{where}.variables[{variable_index}] ({variable.symbol})"
            if variable.quantity_id is None:
                continue
            target = by_id.get(variable.quantity_id)
            if not isinstance(target, QuantityEntity):
                errors.append(
                    f"{variable_where}：quantity_id={variable.quantity_id!r} "
                    "不存在或不是物理量实体"
                )
                continue
            if variable.name != target.name:
                errors.append(
                    f"{variable_where}：name={variable.name!r} "
                    f"与物理量 {target.name!r} 不一致"
                )
            if variable.unit != target.details.unit:
                errors.append(
                    f"{variable_where}：unit={variable.unit!r} 与物理量 "
                    f"{target.details.unit!r} 不一致"
                )

    return errors
