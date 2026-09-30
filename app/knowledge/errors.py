"""知识库加载和查询过程中使用的异常。"""


class KnowledgeBaseError(Exception):
    """知识库校验失败，服务不允许带着错误数据启动。"""

    def __init__(self, errors: list[str]) -> None:
        """保存全部错误，并组合成人类可读的异常信息。"""
        self.errors = errors
        lines = "\n".join(f"  {i}. {error}" for i, error in enumerate(errors, 1))
        super().__init__(f"知识库校验失败：{len(errors)} 处错误\n{lines}")


class EntityNotFound(Exception):
    """查询参数中的实体 ID 不在知识库中。"""

    def __init__(self, entity_id: str) -> None:
        """记录未找到的实体 ID。"""
        self.entity_id = entity_id
        super().__init__(entity_id)
