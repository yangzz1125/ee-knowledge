"""接口自检：python tests/test_api.py

覆盖两层：

* knowledge 层的查询语义（搜索评分、邻居方向、路径方向、图谱悬空边）
* HTTP 层的契约（状态码、统一错误形状、参数校验）

通过真实的 ASGI 应用发请求，所以测的是前端实际会看到的东西。
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.ai import AIUnavailable  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app, raise_server_exceptions=False)


def check(label: str, condition: bool, extra: object = "") -> None:
    """断言单项接口检查，并在失败时显示实际结果。"""
    if not condition:
        raise AssertionError(f"{label} —— 实际：{extra!r}")


# ---------------------------------------------------------------- 系统接口

r = client.get("/api/health")
check("health 状态码", r.status_code == 200, r.status_code)
health = r.json()
check("health 计数非零", health["counts"]["entities"] > 0, health)

r = client.get("/api/meta")
meta = r.json()
check("meta 类型数", len(meta["entity_types"]) == 6, meta["entity_types"])
check("meta 关系数", len(meta["relation_types"]) == 9, meta["relation_types"])
check(
    "meta 中文名来自后端",
    meta["entity_types"][0] == {"value": "concept", "label": "概念"},
    meta["entity_types"][0],
)
check(
    "meta 标出无向关系",
    all(
        item["directed"] is (item["value"] not in {"equivalent_to", "related_to"})
        for item in meta["relation_types"]
    ),
)

# ---------------------------------------------------------------- 章节

r = client.get("/api/chapters")
chapters = r.json()
check("章节按 order 升序", [c["order"] for c in chapters] == sorted(c["order"] for c in chapters))
check("章节都是平铺", all(c["parent_id"] is None for c in chapters))

# ---------------------------------------------------------------- 搜索

r = client.get("/api/entities", params={"keyword": "高斯定律"})
results = r.json()
check("精确命中排第一", results[0]["entity"]["id"] == "gauss-law", results[0])
check("精确命中得分 1.0", results[0]["score"] == 1.0, results[0]["score"])
check("命中字段只有 name", results[0]["matched_fields"] == ["name"], results[0])
check("部分匹配排在后面", results[1]["score"] == 0.8, results[1]["score"])

r = client.get("/api/entities", params={"keyword": "∇ × E"})
check(
    "公式纯文本可搜",
    any(x["entity"]["id"] == "faraday-law-differential-form" for x in r.json()),
    r.json(),
)

r = client.get("/api/entities", params={"keyword": "", "limit": 200})
browse = r.json()
check("空关键词 = 浏览", len(browse) == health["counts"]["entities"], len(browse))
check("浏览模式分数为 0", all(x["score"] == 0.0 for x in browse))

r = client.get("/api/entities", params={"keyword": "", "entity_types": ["formula"]})
check("按类型筛选", all(x["entity"]["type"] == "formula" for x in r.json()), r.json())

r = client.get(
    "/api/entities",
    params=[("keyword", ""), ("entity_types", "law"), ("entity_types", "formula")],
)
check(
    "重复参数多选",
    {x["entity"]["type"] for x in r.json()} == {"law", "formula"},
    r.json(),
)

r = client.get("/api/entities", params={"keyword": "不存在的词xyz"})
check("搜不到返回空数组而不是 404", r.status_code == 200 and r.json() == [], r.status_code)

# ---------------------------------------------------------------- 实体详情

r = client.get("/api/entities/gauss-law")
check("详情 200", r.status_code == 200, r.status_code)
check("详情带 conditions", r.json()["conditions"] == ["适用于静电场"], r.json())

r = client.get("/api/entities/does-not-exist")
check("详情 404", r.status_code == 404, r.status_code)
check("404 错误形状", set(r.json()["detail"]) == {"code", "message", "field"}, r.json())
check("404 错误码", r.json()["detail"]["code"] == "entity_not_found", r.json())
check("404 说明原因", "does-not-exist" in r.json()["detail"]["message"], r.json())

# ---------------------------------------------------------------- 邻居

r = client.get("/api/entities/gauss-law/neighbors")
items = r.json()["items"]
check("邻居非空", items, items)
check("邻居方向取值合法", all(i["direction"] in {"incoming", "outgoing", "undirected"} for i in items))

r = client.get("/api/entities/gauss-law-integral-form/neighbors")
undirected = [i for i in r.json()["items"] if i["relation"]["type"] == "equivalent_to"]
check("无向关系只出现一次", len(undirected) == 1, undirected)
check("无向关系报 undirected", undirected[0]["direction"] == "undirected", undirected)

r = client.get(
    "/api/entities/gauss-law-integral-form/neighbors", params={"direction": "outgoing"}
)
check(
    "方向筛选不隐藏无向关系",
    any(i["direction"] == "undirected" for i in r.json()["items"]),
    r.json(),
)

r = client.get("/api/entities/nope/neighbors")
check("邻居 404", r.status_code == 404, r.status_code)

# ---------------------------------------------------------------- 路径

r = client.get("/api/path", params={"start_id": "maxwell-equations", "end_id": "wave-equation"})
path = r.json()
check("有向路径可达", path["found"] is True, path)
check(
    "路径长度不变量 relations == entities - 1",
    len(path["relations"]) == len(path["entities"]) - 1,
    path,
)
check(
    "有向路径方向一致",
    all(
        path["relations"][i]["source_id"] == path["entities"][i]["id"]
        and path["relations"][i]["target_id"] == path["entities"][i + 1]["id"]
        for i in range(len(path["relations"]))
    ),
    path,
)

r = client.get("/api/path", params={"start_id": "wave-equation", "end_id": "maxwell-equations"})
backward = r.json()
check("反方向默认走不通", backward["found"] is False, backward)
check("无路径时给出建议", "undirected" in (backward["message"] or ""), backward["message"])

r = client.get(
    "/api/path",
    params={"start_id": "wave-equation", "end_id": "maxwell-equations", "direction": "undirected"},
)
check("无向就能走通", r.json()["found"] is True, r.json())

r = client.get("/api/path", params={"start_id": "gradient", "end_id": "gradient"})
same = r.json()
check("起点等于终点", same["found"] and len(same["entities"]) == 1 and same["relations"] == [], same)

r = client.get("/api/path", params={"start_id": "gradient", "end_id": "nope"})
check("路径 404", r.status_code == 404, r.status_code)

# ---------------------------------------------------------------- 图谱

r = client.get("/api/graph")
view = r.json()
ids = {e["id"] for e in view["entities"]}
check("全图 center 为 null", view["center_id"] is None, view["center_id"])
check(
    "全图没有悬空边",
    all(x["source_id"] in ids and x["target_id"] in ids for x in view["relations"]),
    [x for x in view["relations"] if x["source_id"] not in ids or x["target_id"] not in ids],
)

r = client.get("/api/graph", params={"center_id": "gauss-law", "depth": 2})
view = r.json()
ids = {e["id"] for e in view["entities"]}
check("局部图含中心", "gauss-law" in ids, ids)
check(
    "局部图没有悬空边",
    all(x["source_id"] in ids and x["target_id"] in ids for x in view["relations"]),
    [x for x in view["relations"] if x["source_id"] not in ids or x["target_id"] not in ids],
)

r = client.get("/api/graph", params={"center_id": "gauss-law", "entity_types": ["quantity"]})
ids = {e["id"] for e in r.json()["entities"]}
check("类型过滤不作用于中心", "gauss-law" in ids, ids)

r = client.get("/api/graph", params={"center_id": "nope"})
check("图谱 404 而不是退化成全图", r.status_code == 404, r.status_code)

# ---------------------------------------------------------------- 参数校验

r = client.get("/api/entities", params={"keyword": "", "limit": 999})
check("limit 超范围 422", r.status_code == 422, r.status_code)
check("422 错误码", r.json()["detail"]["code"] == "invalid_parameter", r.json())
check("422 指向出错参数", r.json()["detail"]["field"] == "limit", r.json())

r = client.get("/api/entities", params={"keyword": "", "entity_types": ["nonsense"]})
check("非法枚举值 422", r.status_code == 422, r.status_code)

r = client.get("/api/graph", params={"depth": 9})
check("depth 超范围 422", r.status_code == 422, r.status_code)

r = client.get("/api/does-not-exist")
check("未知路径 404", r.status_code == 404, r.status_code)
check("未知路径也是统一形状", set(r.json()["detail"]) == {"code", "message", "field"}, r.json())

# ---------------------------------------------------------------- AI 问答

with patch(
    "app.api.ai.call_model", side_effect=AIUnavailable("测试中禁用真实模型")
):
    r = client.post(
        "/api/ai/ask",
        json={"question": "麦克斯韦方程组怎么推导出波动方程？"},
    )
check("AI 未配置返回 503", r.status_code == 503, r.status_code)
check("AI 错误码", r.json()["detail"]["code"] == "ai_unavailable", r.json())

with patch("app.api.ai.call_model", return_value="对「麦克斯韦方程组」取旋度，可以得到「波动方程」。"):
    r = client.post(
        "/api/ai/ask",
        json={"question": "麦克斯韦方程组怎么推导出波动方程？"},
    )
check("AI 模拟调用成功", r.status_code == 200, r.status_code)
body = r.json()
check("回答实际引用的知识点", body["used_entity_ids"] == ["maxwell-equations", "wave-equation"], body)
check("检索命中与实际引用分开统计", set(body["used_entity_ids"]) <= set(body["retrieved_entity_ids"]), body)
check("引用了知识点则不标记依据不足", body["insufficient_knowledge"] is False, body)

with patch("app.api.ai.call_model", return_value="这是一段没有提到任何知识点名称的回答。"):
    r = client.post("/api/ai/ask", json={"question": "麦克斯韦方程组怎么推导出波动方程？"})
body = r.json()
check("回答没引用知识点时 used 为空", body["used_entity_ids"] == [], body)
check("回答没引用知识点时仍保留检索结果", bool(body["retrieved_entity_ids"]), body)
check("回答没引用知识点时标记依据不足", body["insufficient_knowledge"] is True, body)

history = [
    {
        "question": "介绍一下高斯定律。",
        "answer": "高斯定律描述闭合曲面的电通量。",
        "used_entity_ids": ["gauss-law"],
    }
]
with patch("app.api.ai.call_model", return_value="「高斯定律」的适用条件是静电场。"):
    r = client.post(
        "/api/ai/ask",
        json={"question": "它的适用条件是什么？", "history": history},
    )
check("历史实体可承接省略指代", "gauss-law" in r.json()["retrieved_entity_ids"], r.json())
check("追问回答引用了历史实体", "gauss-law" in r.json()["used_entity_ids"], r.json())

with patch("app.api.ai.ensure_configured"), patch(
    "app.api.ai.stream_model", return_value=iter(["高斯", "定律"])
):
    r = client.post(
        "/api/ai/ask/stream",
        json={"question": "它是什么？", "history": history},
    )
stream_text = r.text
check("流式接口返回 SSE", r.headers["content-type"].startswith("text/event-stream"), r.headers)
check(
    "流式事件顺序",
    stream_text.index("event: metadata")
    < stream_text.index("event: delta")
    < stream_text.index("event: done"),
    stream_text,
)
check("流式片段完整", "高斯" in stream_text and "定律" in stream_text, stream_text)
done_data = stream_text.split("event: done")[1].splitlines()[1]
check("流式 done 事件带实际引用", '"used_entity_ids": ["gauss-law"]' in done_data, done_data)
check("流式 metadata 只带检索命中", "retrieved_entity_ids" in stream_text.split("event: delta")[0], stream_text)

r = client.post(
    "/api/ai/ask",
    json={"question": "继续", "history": history * 11},
)
check("历史最多 10 轮", r.status_code == 422, r.status_code)

invalid_history = [
    {
        "question": "上一问",
        "answer": "上一答",
        "used_entity_ids": ["does-not-exist"],
    }
]
r = client.post(
    "/api/ai/ask",
    json={"question": "继续", "history": invalid_history},
)
check("历史实体必须存在", r.status_code == 422, r.status_code)
check("历史实体错误字段", r.json()["detail"]["field"] == "history.0.used_entity_ids", r.json())

with patch("app.api.ai.call_model") as model_mock:
    r = client.post("/api/ai/ask", json={"question": "完全无关的问题 zzzz"})
    model_mock.assert_not_called()
check("知识不足不调模型", r.status_code == 200, r.status_code)
check("知识不足标记", r.json()["insufficient_knowledge"] is True, r.json())
check("知识不足时不引用知识点", r.json()["used_entity_ids"] == [], r.json())

r = client.post("/api/ai/ask", json={"question": ""})
check("空问题 422", r.status_code == 422, r.status_code)

r = client.post("/api/ai/ask", json={"question": "x" * 501})
check("超长问题 422", r.status_code == 422, r.status_code)

print(
    f"接口自检通过：{health['counts']['chapters']} 章节 / "
    f"{health['counts']['entities']} 实体 / {health['counts']['relations']} 关系"
)
