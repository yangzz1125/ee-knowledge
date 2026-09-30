"""RAG 评测：检索、引用统计两个环节，可选真实模型端到端。

    uv run python tests/rag_eval.py          # 检索评测 + 引用统计评测，离线，不调用模型
    uv run python tests/rag_eval.py --live   # 再用真实模型回答每个问题，统计检索命中与实际引用的差异

1. 检索评测：每个问题标出应该命中的知识点，统计前 5 条里的命中情况（召回率），以及课程外问题是否正确拒答。
2. 引用统计评测：给定检索上下文和一段回答，检查「实际引用了哪些知识点」的识别是否正确。
3. --live：真实调用模型，输出每个问题「检索命中 / 实际引用 / 检索了但没用」，用于发现检索浪费和模型不按材料回答的情况。

任何一项低于门槛，进程以非零状态码退出，可直接接进提交前检查。
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.dependencies import graph  # noqa: E402
from app.knowledge import build_retrieval_context, citation_stats, cited_entity_ids  # noqa: E402

# (问题, 应该命中的知识点 ID；空列表表示这是课程之外的问题，不应命中任何知识点)
CASES: list[tuple[str, list[str]]] = [
    ("高斯定律为什么需要闭合曲面？", ["gauss-law"]),
    ("高斯定理是什么", ["gauss-law"]),
    ("静电场为什么可以引入电位", ["electric-potential"]),
    ("电场强度和电位是什么关系", ["potential-gradient-relation"]),
    ("E = -∇φ 是什么意思", ["potential-gradient-relation"]),
    ("怎么求接地导体球外的电场", ["method-of-images"]),
    ("导体边界的静电问题怎么解", ["method-of-images"]),
    ("位移电流是怎么提出来的", ["displacement-current"]),
    ("为什么要引入位移电流", ["displacement-current"]),
    ("电磁波在导体中传播会怎样", ["skin-effect"]),
    ("为什么高频导线电阻变大", ["skin-effect"]),
    ("电磁波遇到两种介质的分界面会发生什么", ["reflection-transmission"]),
    ("电磁波的电场方向怎么变化", ["wave-polarization"]),
    ("平面波的波阻抗怎么算", ["wave-impedance-formula"]),
    ("学麦克斯韦方程组之前要先学什么", ["maxwell-equations"]),
    ("旋度和斯托克斯定理有什么联系", ["curl", "stokes-theorem"]),
    ("散度定理有什么用", ["divergence-theorem"]),
    ("电荷守恒怎么用公式表示", ["current-continuity-equation"]),
    ("导体里的电流和电场是什么关系", ["ohm-law-differential-form"]),
    ("电流元产生的磁场怎么算", ["biot-savart-law"]),
    ("磁场为什么没有散度", ["magnetic-gauss-law"]),
    ("变化的磁场为什么能产生电场", ["faraday-law"]),
    ("电磁场的能量怎么流动", ["poynting-vector", "poynting-theorem"]),
    ("平行板电容器的电容和什么有关", ["parallel-plate-capacitor"]),
    ("今天天气怎么样", []),
    ("怎么做红烧肉", []),
]

TOP_K = 5
RECALL_THRESHOLD = 0.9
REFUSAL_THRESHOLD = 1.0

# (问题, 一段样例回答, 回答应当被判定为引用了哪些知识点)
CITATION_CASES: list[tuple[str, str, list[str]]] = [
    ("高斯定律为什么需要闭合曲面？", "「高斯定律」的通量必须穿过闭合曲面，这样才能和曲面内的电荷对应。", ["gauss-law", "electric-flux"]),  # 别名「通量」也算
    ("高斯定理是什么", "高斯定理说明电通量只由曲面内的电荷决定。", ["gauss-law", "electric-flux"]),  # 高斯定理是别名
    ("为什么高频导线电阻变大", "这是趋肤效应造成的，电流集中在导线表面。", ["skin-effect"]),
    ("旋度和斯托克斯定理有什么联系", "「斯托克斯定理」把「旋度」的面积分转成边界环量。", ["stokes-theorem", "curl"]),
    ("为什么高频导线电阻变大", "因为电流只走导线表层，有效截面变小。", []),  # 没提名称，不算引用
]


def evaluate(verbose: bool = True) -> tuple[float, float]:
    """返回 (召回率, 拒答正确率)。召回率：应命中的知识点中，实际出现在前 5 条的比例。"""
    found = total = 0
    refused_ok = refused_total = 0
    for question, expected in CASES:
        context, insufficient = build_retrieval_context(graph, question, None, [])
        got = context.matched_entity_ids[:TOP_K]
        if expected:
            hit = [i for i in expected if i in got]
            found += len(hit)
            total += len(expected)
            if verbose:
                mark = "✓" if len(hit) == len(expected) else ("△" if hit else "✗")
                names = [graph.by_id[i].name for i in got] or ["无"]
                print(f"{mark} {question}\n    期望 {expected}\n    实际 {names}")
        else:
            refused_total += 1
            refused_ok += int(insufficient)
            if verbose:
                mark = "✓" if insufficient else "✗"
                got_names = [graph.by_id[i].name for i in got] or ["无"]
                print(f"{mark} {question}（课程外，应拒答）\n    实际 {got_names}")
    recall = found / total if total else 1.0
    refusal = refused_ok / refused_total if refused_total else 1.0
    if verbose:
        print(f"\n召回率 {found}/{total} = {recall:.0%}；课程外问题正确拒答 {refused_ok}/{refused_total}")
    return recall, refusal


def evaluate_citations(verbose: bool = True) -> float:
    """检查「回答里引用了哪些知识点」的识别准确率（离线，用固定样例回答）。"""
    correct = 0
    for question, answer, expected in CITATION_CASES:
        context, _ = build_retrieval_context(graph, question, None, [])
        cited = cited_entity_ids(answer, context)
        ok = set(cited) == set(expected)
        correct += int(ok)
        if verbose:
            print(f"{'✓' if ok else '✗'} 引用识别：{question}\n    期望 {expected}\n    实际 {cited}")
    accuracy = correct / len(CITATION_CASES)
    if verbose:
        print(f"\n引用识别准确率 {correct}/{len(CITATION_CASES)} = {accuracy:.0%}")
    return accuracy


def _names(ids: list[str]) -> list[str]:
    return [graph.by_id[i].name for i in ids] or ["无"]


def evaluate_live() -> None:
    """真实调用模型：对比检索命中、回答实际引用、检索了但没被用到的知识点。"""
    from app.ai import AIUnavailable, call_model, ensure_configured

    try:
        ensure_configured()
    except AIUnavailable as exc:
        print(f"跳过 --live：{exc}")
        return

    answered = []
    for question, expected in CASES:
        if not expected:
            continue
        context, insufficient = build_retrieval_context(graph, question, None, [])
        if insufficient:
            print(f"✗ {question}\n    检索没有命中，未调用模型")
            continue
        try:
            answer = call_model(question, context)
        except Exception as exc:  # 网络抖动不应中断整轮评测
            print(f"✗ {question}\n    模型调用失败：{exc}")
            continue
        stats = citation_stats(answer, context)
        answered.append(stats)
        print(
            f"{'✓' if stats['cited'] else '✗'} {question}\n"
            f"    检索命中 {_names(context.matched_entity_ids)}\n"
            f"    实际引用 {_names(stats['cited_ids'])}\n"
            f"    命中但没用到 {_names(stats['unused_matched_ids'])}"
        )
    if answered:
        cited_any = sum(1 for stats in answered if stats["cited"])
        matched_total = sum(stats["matched"] for stats in answered)
        unused_total = sum(len(stats["unused_matched_ids"]) for stats in answered)
        print(
            f"\n共 {len(answered)} 个问题得到回答，其中 {cited_any} 个回答引用了知识点；"
            f"检索命中的知识点里有 {matched_total - unused_total}/{matched_total} 被回答实际用到"
        )


if __name__ == "__main__":
    recall, refusal = evaluate()
    print()
    accuracy = evaluate_citations()
    if "--live" in sys.argv:
        print("\n===== 真实模型 =====")
        evaluate_live()
    failed = recall < RECALL_THRESHOLD or refusal < REFUSAL_THRESHOLD or accuracy < 1.0
    verdict = "未达标" if failed else "全部达标"
    print(f"\n{verdict}（召回率 ≥ {RECALL_THRESHOLD:.0%}，课程外全部拒答，引用识别全对）")
    sys.exit(1 if failed else 0)
