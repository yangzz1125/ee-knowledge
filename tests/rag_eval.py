"""检索评测：每个问题标出应该命中的知识点，统计前 5 条里的命中情况。

运行：uv run python tests/rag_eval.py
只评测检索，不调用模型，不消耗 API。
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.dependencies import graph  # noqa: E402
from app.knowledge import build_retrieval_context  # noqa: E402

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


if __name__ == "__main__":
    evaluate()
