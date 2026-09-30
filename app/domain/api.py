"""HTTP 接口专用的请求和响应数据类型。"""

from __future__ import annotations

from pydantic import Field

from .types import StrictModel


class AIConversationTurn(StrictModel):
    """由前端随下一次请求传回的一轮完整问答。"""

    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1, max_length=4000)
    used_entity_ids: list[str]


class AIQuestionRequest(StrictModel):
    """AI 问答请求；历史只随请求传递，不在后端持久化。"""

    question: str = Field(min_length=1, max_length=500)
    context_entity_id: str | None = None
    history: list[AIConversationTurn] = Field(default_factory=list, max_length=10)


class AIAnswerResponse(StrictModel):
    """AI 问答响应。"""

    answer: str
    #: 回答文字里实际引用的知识点（名称或别名出现在回答中）。
    used_entity_ids: list[str]
    #: 检索阶段命中的知识点，模型不一定都用；与 used_entity_ids 对照可看出检索的浪费。
    retrieved_entity_ids: list[str] = Field(default_factory=list)
    insufficient_knowledge: bool
    message: str | None = None


class CourseInfo(StrictModel):
    """课程基本信息。"""

    id: str
    name: str
    description: str


class EnumOption(StrictModel):
    """前端筛选器使用的枚举选项。"""

    value: str
    label: str


class RelationTypeOption(StrictModel):
    """带方向属性的关系类型选项。"""

    value: str
    label: str
    directed: bool


class MetaResponse(StrictModel):
    """课程、版本和枚举元数据响应。"""

    course: CourseInfo
    schema_version: str
    entity_types: list[EnumOption]
    relation_types: list[RelationTypeOption]


class HealthCounts(StrictModel):
    """健康检查返回的知识库数据量。"""

    chapters: int
    entities: int
    relations: int


class HealthResponse(StrictModel):
    """服务健康检查响应。"""

    status: str
    course: str
    schema_version: str
    counts: HealthCounts


class ErrorDetail(StrictModel):
    """所有接口错误共用的详情结构。"""

    code: str
    message: str
    field: str | None = None


#: 固定课程信息不写入知识库文件，避免每份数据重复维护。
COURSE = CourseInfo(
    id="electromagnetic-field-and-waves",
    name="电磁场与波",
    description="电磁场与波课程固定知识图谱。",
)
