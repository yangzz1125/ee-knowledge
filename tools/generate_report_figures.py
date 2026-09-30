"""Generate deterministic PNG figures for the first research report."""

from __future__ import annotations

from pathlib import Path
from textwrap import wrap

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "report"
OUT.mkdir(parents=True, exist_ok=True)

FONT_REGULAR = r"C:\Windows\Fonts\msyh.ttc"
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
if not Path(FONT_BOLD).exists():
    FONT_BOLD = r"C:\Windows\Fonts\simhei.ttf"

NAVY = "#102A43"
BLUE = "#1677FF"
CYAN = "#14B8A6"
AMBER = "#F59E0B"
RED = "#EF5B5B"
PURPLE = "#7C5CFC"
INK = "#26384A"
MUTED = "#64748B"
LINE = "#D9E4F0"
PALE = "#F4F8FC"
WHITE = "#FFFFFF"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size)


def canvas(width: int = 1800, height: int = 1000) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGB", (width, height), WHITE)
    return im, ImageDraw.Draw(im)


def shadow_box(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], radius: int = 28) -> None:
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle((x1 + 8, y1 + 10, x2 + 8, y2 + 10), radius, fill="#E5EDF6")
    draw.rounded_rectangle(xy, radius, fill=WHITE, outline=LINE, width=2)


def center_text(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    text: str,
    fnt: ImageFont.FreeTypeFont,
    fill: str = INK,
) -> None:
    x1, y1, x2, y2 = box
    bbox = draw.multiline_textbbox((0, 0), text, font=fnt, align="center", spacing=8)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.multiline_text(((x1 + x2 - w) / 2, (y1 + y2 - h) / 2), text, font=fnt, fill=fill, align="center", spacing=8)


def arrow(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], color: str = BLUE, width: int = 7) -> None:
    draw.line((start, end), fill=color, width=width)
    ex, ey = end
    sx, sy = start
    if abs(ex - sx) >= abs(ey - sy):
        sign = 1 if ex > sx else -1
        points = [(ex, ey), (ex - sign * 22, ey - 14), (ex - sign * 22, ey + 14)]
    else:
        sign = 1 if ey > sy else -1
        points = [(ex, ey), (ex - 14, ey - sign * 22), (ex + 14, ey - sign * 22)]
    draw.polygon(points, fill=color)


def title(draw: ImageDraw.ImageDraw, heading: str, subtitle: str) -> None:
    draw.text((90, 62), heading, font=font(54, True), fill=NAVY)
    draw.text((92, 132), subtitle, font=font(26), fill=MUTED)
    draw.rounded_rectangle((90, 180, 250, 189), 4, fill=CYAN)


def save(im: Image.Image, name: str) -> None:
    im.save(OUT / name, format="PNG", dpi=(180, 180), optimize=True)


def related_work() -> None:
    im, draw = canvas(1800, 1120)
    title(draw, "教育知识图谱的四类典型建设路线", "从大规模知识组织逐步发展到课程智能问答与学习路径")
    cards = [
        (90, 235, 870, 615, BLUE, "01", "EduKG：大规模教育知识图谱", "主要做法", "连接教材、知识点、教学资源与教学设计", "本课题启示", "覆盖面之外，还要针对具体课程\n细化公式、条件和关系"),
        (930, 235, 1710, 615, CYAN, "02", "SophX：课程知识地图", "主要做法", "围绕课程绘制知识地图，强调师生参与和“建用一体”", "本课题启示", "图谱不能只展示节点，\n还应进入实际学习与维护过程"),
        (90, 670, 870, 1050, PURPLE, "03", "知识图谱 + 大模型", "主要做法", "先检索课程知识，再进行问答、推荐和路径规划", "本课题启示", "让 AI 依据课程知识回答，\n并提供可核对的知识来源"),
        (930, 670, 1710, 1050, AMBER, "04", "知识图谱 + 学习路径", "主要做法", "依据前置关系、学习目标和学习记录生成学习顺序", "本课题启示", "初期先保证知识依赖准确，\n再逐步引入个性化算法"),
    ]
    for x1, y1, x2, y2, color, number, name, label1, desc1, label2, desc2 in cards:
        shadow_box(draw, (x1, y1, x2, y2), 28)
        draw.rounded_rectangle((x1, y1, x1 + 16, y2), 8, fill=color)
        draw.ellipse((x1 + 42, y1 + 34, x1 + 118, y1 + 110), fill=color)
        center_text(draw, (x1 + 42, y1 + 34, x1 + 118, y1 + 110), number, font(27, True), WHITE)
        draw.text((x1 + 145, y1 + 48), name, font=font(34, True), fill=NAVY)
        draw.text((x1 + 48, y1 + 148), label1, font=font(24, True), fill=color)
        draw.multiline_text((x1 + 48, y1 + 190), desc1, font=font(25), fill=INK, spacing=9)
        draw.line((x1 + 48, y1 + 245, x2 - 48, y1 + 245), fill=LINE, width=2)
        draw.text((x1 + 48, y1 + 264), label2, font=font(24, True), fill=color)
        draw.multiline_text((x1 + 48, y1 + 302), desc2, font=font(23), fill=INK, spacing=7)
    save(im, "figure-01-related-work.png")


def architecture() -> None:
    im, draw = canvas(1800, 1050)
    title(draw, "总体构建路线", "以可信课程知识为基础，逐层形成检索、探索、路径与问答能力")
    layers = [
        (100, 250, 410, 570, "01", "课程资料层", ["教材", "课程大纲", "教师认可资料"], BLUE),
        (520, 250, 830, 570, "02", "知识加工层", ["人工梳理", "AI 辅助提取", "教师审核校正"], CYAN),
        (940, 250, 1250, 570, "03", "知识图谱层", ["实体与属性", "语义关系", "校验与版本管理"], PURPLE),
        (1360, 250, 1670, 570, "04", "学习应用层", ["搜索与详情", "关系与路径", "AI 课程问答"], AMBER),
    ]
    for x1, y1, x2, y2, num, name, items, color in layers:
        shadow_box(draw, (x1, y1, x2, y2), 30)
        draw.ellipse((x1 + 30, y1 + 30, x1 + 96, y1 + 96), fill=color)
        center_text(draw, (x1 + 30, y1 + 30, x1 + 96, y1 + 96), num, font(24, True), WHITE)
        draw.text((x1 + 30, y1 + 124), name, font=font(34, True), fill=NAVY)
        for i, item in enumerate(items):
            yy = y1 + 180 + i * 52
            draw.ellipse((x1 + 34, yy + 9, x1 + 46, yy + 21), fill=color)
            draw.text((x1 + 62, yy), item, font=font(25), fill=INK)
    arrow(draw, (425, 410), (500, 410), BLUE)
    arrow(draw, (845, 410), (920, 410), CYAN)
    arrow(draw, (1265, 410), (1340, 410), PURPLE)

    draw.rounded_rectangle((150, 650, 1650, 925), 34, fill=PALE, outline=LINE, width=2)
    draw.text((190, 690), "检索增强 AI 问答流程", font=font(33, True), fill=NAVY)
    steps = [
        (200, 780, 410, 860, "学生问题", BLUE),
        (500, 780, 710, 860, "图谱检索", CYAN),
        (800, 780, 1010, 860, "组织上下文", PURPLE),
        (1100, 780, 1310, 860, "模型生成", AMBER),
        (1400, 780, 1600, 860, "回答 + 依据", RED),
    ]
    for x1, y1, x2, y2, label, color in steps:
        draw.rounded_rectangle((x1, y1, x2, y2), 22, fill=WHITE, outline=color, width=4)
        center_text(draw, (x1, y1, x2, y2), label, font(25, True), color)
    for i in range(len(steps) - 1):
        arrow(draw, (steps[i][2] + 10, 820), (steps[i + 1][0] - 10, 820), MUTED, 5)
    save(im, "figure-02-architecture.png")


def knowledge_model() -> None:
    im, draw = canvas(1800, 1120)
    title(draw, "课程知识模型初步设计", "六类知识实体构成课程骨架，九类语义关系负责连接知识")
    cx, cy = 900, 560
    nodes = [
        (900, 285, "概念", "现象、对象与理论定义", BLUE),
        (1250, 420, "物理量", "符号、单位与性质", CYAN),
        (1250, 715, "定律或定理", "规律、条件与结论", PURPLE),
        (900, 850, "公式或方程", "表达式、变量与条件", AMBER),
        (550, 715, "分析方法", "问题求解与分析步骤", RED),
        (550, 420, "工程应用", "理论对应的实际场景", "#2B8A6E"),
    ]
    for nx, ny, _, _, color in nodes:
        draw.line((cx, cy, nx, ny), fill=LINE, width=8)
        mx, my = (cx + nx) // 2, (cy + ny) // 2
        draw.ellipse((mx - 7, my - 7, mx + 7, my + 7), fill=color)
    draw.ellipse((cx - 175, cy - 175, cx + 175, cy + 175), fill=NAVY)
    center_text(draw, (cx - 150, cy - 135, cx + 150, cy + 135), "电磁场与波\n课程知识图谱", font(38, True), WHITE)
    for nx, ny, name, desc, color in nodes:
        box = (nx - 185, ny - 78, nx + 185, ny + 78)
        draw.rounded_rectangle(box, 28, fill=WHITE, outline=color, width=5)
        draw.text((box[0] + 28, box[1] + 21), name, font=font(30, True), fill=color)
        draw.text((box[0] + 28, box[1] + 79), desc, font=font(22), fill=INK)

    draw.rounded_rectangle((180, 980, 1620, 1070), 24, fill=PALE, outline=LINE, width=2)
    relations = ["前置知识", "定义", "表达", "推导", "使用", "描述", "应用于", "等价", "相关"]
    x = 235
    for i, item in enumerate(relations):
        color = [BLUE, CYAN, PURPLE, AMBER, RED][i % 5]
        draw.ellipse((x, 1015, x + 18, 1033), fill=color)
        draw.text((x + 28, 1004), item, font=font(22, i < 4), fill=INK)
        x += 145 if len(item) <= 2 else 175
    save(im, "figure-03-knowledge-model.png")


def roadmap() -> None:
    im, draw = canvas(1800, 980)
    title(draw, "分阶段建设路线", "先验证知识模型，再逐步增加图谱能力、AI 问答和应用评估")
    draw.line((175, 455, 1625, 455), fill=LINE, width=14)
    stages = [
        (190, BLUE, "阶段一", "需求与资料", ["明确课程范围", "确定主要教材", "整理实体与关系"]),
        (545, CYAN, "阶段二", "样例验证", ["选择代表章节", "建立小规模样例", "修正知识模型"]),
        (900, PURPLE, "阶段三", "图谱能力", ["搜索与详情", "关系探索", "路径查询"]),
        (1255, AMBER, "阶段四", "AI 问答", ["图谱检索", "受控生成", "答案依据"]),
        (1610, RED, "阶段五", "扩展评估", ["扩充知识内容", "师生试用", "评价与优化"]),
    ]
    for index, (x, color, stage, name, items) in enumerate(stages):
        draw.ellipse((x - 41, 414, x + 41, 496), fill=color, outline=WHITE, width=8)
        center_text(draw, (x - 35, 420, x + 35, 490), str(index + 1), font(29, True), WHITE)
        card_x1 = max(70, x - 155)
        card_x2 = min(1730, x + 155)
        card_y1 = 545 if index % 2 == 0 else 225
        card_y2 = card_y1 + 270
        stem_y = card_y1 if card_y1 > 455 else card_y2
        draw.line((x, 496 if card_y1 > 455 else 414, x, stem_y), fill=color, width=4)
        shadow_box(draw, (card_x1, card_y1, card_x2, card_y2), 25)
        draw.rounded_rectangle((card_x1, card_y1, card_x2, card_y1 + 16), 8, fill=color)
        draw.text((card_x1 + 26, card_y1 + 39), stage, font=font(22, True), fill=color)
        draw.text((card_x1 + 26, card_y1 + 80), name, font=font(31, True), fill=NAVY)
        for j, item in enumerate(items):
            yy = card_y1 + 138 + j * 42
            draw.ellipse((card_x1 + 29, yy + 8, card_x1 + 39, yy + 18), fill=color)
            draw.text((card_x1 + 54, yy), item, font=font(21), fill=INK)
    save(im, "figure-04-roadmap.png")


if __name__ == "__main__":
    related_work()
    architecture()
    knowledge_model()
    roadmap()
    print(f"Generated report figures in {OUT}")
