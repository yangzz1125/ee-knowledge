"""生成第二次汇报（对象与数据结构设计）的 PPT，基于 hust-academic-ppt skill 的华科模板和绘图库。

用法：
    uv run --no-project --with python-pptx --with lxml python -X utf8 build_deck.py <输出.pptx>

页面标题写结论句，细节放在每页的口播稿备注里。颜色按含义使用：华科蓝为主体，橙色标本次重点和产出，
六类知识点各有固定的类型色（全篇一致），红色只表示错误。

嵌入的图片（都在本目录）：
- formula.png：formula.tex 编译后 pdftoppm -r 600 -png -singlefile 导出。
- artifacts/faraday_excerpt.png：data/knowledge_base.json 中 faraday-law-differential-form 的 variables 节选
  （只保留符号、单位和 quantity_id，为了放大字号调整了键的顺序和换行），原文在 faraday_excerpt.json。
- artifacts/validation_error.png：把该公式变量 B 的单位改成 Wb 后，用 app.knowledge.loader.load_knowledge_base
  加载副本得到的报错原文（第二条按页面宽度折成两行），原文在 validation_error.txt。
  两张图都用 skill 的 scripts/snippet.py 渲染：
      snippet.py faraday_excerpt.json faraday_excerpt.png --kind json --title "data/knowledge_base.json（节选）" --pt 14
      snippet.py validation_error.txt validation_error.png --kind terminal --title "加载知识库" --pt 13
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path.home() / ".claude" / "skills" / "hust-academic-ppt" / "scripts"))
from hust_deck import *  # noqa: E402

HERE = Path(__file__).resolve().parent
OUTPUT = Path(sys.argv[1])
SECTIONS = ["本次工作内容", "知识对象设计", "知识点内容设计", "知识关系设计", "数据校验", "后续计划"]

STAGES = [  # (名称, 工作, 产出, 色调)
    ("需求与调研", ["明确研究问题", "调研相关案例", "确定课程范围"], "需求说明", "primary"),
    ("系统架构设计", ["划分系统层次", "明确模块职责", "梳理数据流向"], "架构方案", "primary"),
    ("对象与数据结构", ["设计知识对象", "定义字段与关系", "编写校验程序"], "格式说明、校验程序", "primary"),
    ("样例与原型实现", ["确定技术选型", "整理样例数据", "实现查询接口", "实现知识检索", "接入课程问答", "开发前端页面"],
     "可运行的原型系统", "accent"),
    ("测试与评价", ["扩充教材知识", "检索与问答评测", "开展师生试用"], "评测结果与改进方案", "neutral"),
]
STATUS = ["已完成", "已完成（上次汇报）", "本次进度", "下一阶段", None]
CURRENT = 2


def roadmap(c):
    y0, pitch, w = 13.25, 6.03, 5.68
    c.line((1.2, y0), (29.8, y0), LINE, 5, cap=True)
    for i, ((title, items, out, tone), status) in enumerate(zip(STAGES, STATUS)):
        box = Box(0.6 + i * pitch, 12.2, w, 11.6)
        x = box.l + 0.85
        current = i == CURRENT
        body = c.card(box, header=title, tone=tone, solid=current, highlight=current)
        c.line((x, y0), (x, box.t), TONES[tone].base, 1.4)
        c.num(x, y0, str(i + 1), tone, d=1.0)
        if current:
            c.chip("w", x + 0.75, y0, status, "accent", solid=True)
        elif status:
            c.chip("w", x + 0.75, y0, status, "accent" if status == "下一阶段" else "neutral")
        c.at("nw", body.l + 0.45, body.t - 0.4, f"阶段{i + 1}", size=S_SMALL, color=TONES[tone].ink, bold=True)
        c.bullets(Box(body.l + 0.45, body.t - 1.1, w - 0.7, 5.6), items, tone, line=23)
        c.output(box, out)


def objects(c):
    kb = Box(0.6, 13.8, 11.4, 11.2)
    body = c.card(kb, header="知识库（人工依据教材整理）")
    c.node(kb.cx, body.t - 1.0, "章节", "neutral", w=9.4)
    c.node(kb.cx, body.t - 2.7, "知识实体", w=9.4)
    labels = [("concept", "概念"), ("law", "定律"), ("quantity", "物理量"), ("formula", "公式"),
              ("application", "应用"), ("method", "方法")]
    widths = [tw(s, S_SMALL) + 0.5 for _, s in labels]
    x = kb.cx - (sum(widths) + 0.15 * (len(labels) - 1)) / 2
    for (tone, s), wd in zip(labels, widths):
        c.chip("w", x, body.t - 3.75, s, tone)
        x += wd + 0.15
    c.node(kb.cx, body.t - 5.2, [P("公式变量"), P(R("随公式保存，关联物理量", size=S_SMALL, color=GRAY))], "formula",
           w=9.4, h=1.5)
    c.node(kb.cx, body.t - 6.95, "知识关系", w=9.4)
    c.at("c", kb.cx, kb.b + 0.7, "需要长期保存的课程知识", size=S_SMALL, color=GRAY)

    for top, title, desc, arrow in [
        (13.8, "查询结果", "搜索结果、相邻知识、学习路径、局部图谱", "运行时查询"),
        (8.0, "问答结果", "检索到的知识点和关系、模型回答及引用", "检索后生成"),
    ]:
        box = Box(17.2, top, 13.2, 4.2)
        body = c.card(box, header=title, solid=False)
        c.text(Box(body.l + 0.6, body.t - 0.6, 12.0, 2.0), desc, line=24)
        y = box.cy
        c.line((kb.r, y), (box.l, y), PRIMARY, 1.4, arrow=True)
        c.label((kb.r + box.l) / 2, y + 0.42, arrow)
    c.chip("c", 17.2 + 6.6, 2.75, "由后端即时生成，不写回知识库", "accent")


def positioning(c):
    k1, k2 = Box(0.6, 13.8, 14.6, 11.3), Box(15.8, 13.8, 14.6, 11.3)
    b1 = c.card(k1, header="章节不作为知识点")
    b2 = c.card(k2, header="公式单独作为知识点")
    c.text(Box(b1.l + 0.6, b1.t - 0.5, 13.4, 1.6), "章节只负责导航和排序，不进入图谱；跨章节的联系用关系表达。", line=24)
    ents = []
    for box, chapter, name in [(Box(k1.l + 0.6, b1.t - 2.6, 6.0, 4.8), "章节：静电场", "高斯定律"),
                               (Box(k1.r - 0.6 - 6.0, b1.t - 2.6, 6.0, 4.8), "章节：时变电磁场", "麦克斯韦方程组")]:
        c.tint(box, "neutral")
        c.at("c", box.cx, box.t - 0.5, chapter, size=S_SMALL, color=GRAY, bold=True)
        ents.append(c.node(box.cx, box.cy - 0.35, name, "law"))
    c.link(ents[0], ents[1])
    c.label((ents[0].r + ents[1].l) / 2, ents[0].cy + 0.45, "前置")

    c.text(Box(b2.l + 0.6, b2.t - 0.5, 13.4, 1.6), "公式可以被搜索、点击，单独展示变量和成立条件。", line=24)
    g2 = c.node(k2.cx, b2.t - 3.2, "高斯定律", "law")
    for dx, name in [(-3.5, "高斯定律积分形式"), (3.5, "高斯定律微分形式")]:
        c.link(g2, c.node(k2.cx + dx, b2.t - 6.2, name, "formula"), "表达为")
    c.legend(k2.l + 4.0, k2.b + 0.8, ["law", "formula"], undirected=False)
    c.bottombar("对象编号", "每个对象有固定英文编号（如 maxwell-equations），改名不影响引用")


def contents(c):
    cm = Box(0.6, 13.8, 9.6, 11.3)
    body = c.card(cm, header="共有内容")
    c.bullets(Box(body.l + 0.6, body.t - 0.6, 8.4, 5.6),
              ["名称、类型、一句话说明", "所属章节（只有一个）", "别名、标签",
               P(R("适用条件", color=TONES["accent"].ink, bold=True))], line=27)
    cond = place("s", cm.cx, cm.b + 0.5, 8.4, 2.4)
    c.tint(cond, "accent")
    c.text(place("c", cond.cx, cond.cy, 7.6, 1.9), "公式的成立条件、方法的适用范围都统一记在这里", line=23, anchor="m")

    own = Box(10.8, 13.8, 19.6, 11.3)
    body = c.card(own, header="各类专有内容")
    rows = [("concept", "定义、核心要点、常见误解"), ("law", "文字表述、物理意义、常见误解"),
            ("quantity", "符号、单位、标量或矢量"), ("formula", "数学表达式、变量及含义"),
            ("application", "应用场景、关键参数"), ("method", "用途、主要步骤")]
    c.table(body.l + 0.6, body.t - 0.4, [5.0, 13.4],
            [("类型", "专有内容")] + [(P(R("● ", color=TONES[t].base), R(TYPE_NAMES[t] if t != "law" else "定律或定理",
                                                                       color=INK, bold=True)), d)
                                    for t, d in rows], row_h=1.3)
    c.bottombar("两处调整", "定律沿用概念的结构；「常见误解」单独记录，查询和回答都能用到")


def formula(c):
    head = Box(0.6, 13.8, 29.8, 2.5)
    body = c.card(head, header="公式 · 法拉第定律微分形式", tone="formula", header_h=1.0)
    c.figure(HERE / "formula.png", Box(body.l + 0.6, body.t - 0.1, 6.0, body.h - 0.2), align="w")
    c.text(Box(body.l + 7.4, body.t - 0.1, 21.0, body.h - 0.2),
           P(R("适用条件：", color=TONES["accent"].ink, bold=True), "适用于时变电磁场；介质连续"), anchor="m")

    snip = c.snippet(HERE / "artifacts" / "faraday_excerpt.png", "nw", 0.6, 9.85)
    # snippet.py 在 14pt 下的行位置（300dpi）：标题区 111px、内边距 52px、行高 88px，字形中心约在行顶下 41px
    line_y = lambda k: snip.t - (111 + 52 + 88 * k + 41) / 300 * 2.54  # noqa: E731

    c.text(Box(16.4, 9.85, 14.0, 1.6), "每个变量记录符号、单位，用 quantity_id 关联物理量", line=24)
    for k, name, sym, unit in [(2, "电场强度", "E", "V/m"), (4, "磁感应强度", "B", "T")]:
        q = place("w", 16.4, line_y(k), 14.0, 1.35)
        c.card(q)
        c.chip("w", q.l + 0.4, q.cy, "物理量", "quantity")
        c.title("w", q.l + 2.3, q.cy, name)
        c.at("w", q.l + 7.0, q.cy, f"符号 {sym} · 单位 {unit} · 矢量", size=S_SMALL, color=GRAY)
        c.line((snip.r, line_y(k)), (q.l, q.cy), TONES["quantity"].base, 1.3, arrow=True)
    u = Box(16.4, 4.25, 14.0, 2.35)
    c.card(u, highlight=True, tone="accent")
    c.title("w", u.l + 0.6, u.t - 0.7, "带来的两个用途")
    c.at("w", u.l + 0.6, u.t - 1.6, "点击变量跳到物理量定义；单位写错时启动报错")
    c.bottombar("记录原则", "公式里有哪些物理量只记在变量里，不另建关系，同一件事只记一处")


def relations(c):
    directed = Box(0.6, 13.8, 19.6, 11.3)
    body = c.card(directed, header="有方向的关系（7 种）")
    c.table(body.l + 0.6, body.t - 0.4, [5.0, 13.4], [
        ("类型", "方向"),
        ("前置知识", "先学 → 后学"),
        ("定义", "定义者 → 被定义者"),
        ("表达为", "定律 → 公式"),
        ("推导出", "已知 → 推导结果"),
        ("使用", "使用者 → 被使用者"),
        ("描述", "定律或公式 → 现象"),
        ("应用于", "知识 → 应用"),
    ], row_h=1.15, first_col_bold=True)

    undirected = Box(20.8, 13.8, 9.6, 11.3)
    body = c.card(undirected, header="无方向的关系（2 种）", tone="neutral")
    c.table(body.l + 0.6, body.t - 0.4, [2.6, 5.8], [
        ("类型", "用法"),
        ("等价于", "完全等价，如积分形式与微分形式"),
        ("相关", "兜底，排除其他类型后才用"),
    ], row_h=1.9, first_col_bold=True)
    c.bottombar("每条关系", "起点 + 终点 + 关系类型 + 一句说明（必填）；有向关系的方向由类型决定")


def graph(c):
    c.card(Box(0.6, 13.8, 29.8, 11.6))

    def pos(gx, gy):
        return 4.0 + 2.0 * gx, 7.4 + 1.45 * gy

    def chap(name, chapter):
        return [P(name), P(R(chapter, size=S_SMALL, color=GRAY))]

    nodes = {
        "div": ((0, 3), chap("散度", "矢量分析"), "concept"),
        "gl": ((3.7, 3), chap("高斯定律", "静电场"), "law"),
        "mx": ((7.4, 3), chap("麦克斯韦方程组", "时变电磁场"), "law"),
        "we": ((11.1, 3), chap("波动方程", "电磁波"), "formula"),
        "glf": ((3.7, 0.8), "高斯定律积分形式", "formula"),
        "fd": ((7.4, 0.8), "法拉第定律微分形式", "formula"),
        "upw": ((11.1, 0.8), "均匀平面波", "application"),
        "fi": ((5.2, -1.4), "法拉第定律积分形式", "formula"),
        "emi": ((9.7, -1.4), "电磁感应", "concept"),
        "cce": ((0, 0.8), "电流连续性方程", "formula"),
        "dc": ((0, -1.4), "位移电流", "concept"),
    }
    boxes = {}
    for k, ((gx, gy), paras, _) in nodes.items():
        x, y = pos(gx, gy)
        name = paras if isinstance(paras, str) else paras[0].runs[0].text
        boxes[k] = place("c", x, y, max(3.4, tw(name, S_BODY) + 0.6), 1.5 if isinstance(paras, list) else 1.15)
    for a, b, t in [("div", "gl", "前置"), ("gl", "mx", "前置"), ("mx", "we", "推导出"), ("gl", "glf", "表达为"),
                    ("mx", "fd", "表达为"), ("we", "upw", "应用于"), ("fd", "emi", "描述"), ("div", "cce", "前置")]:
        c.link(boxes[a], boxes[b], t)
    c.link(boxes["fi"], boxes["fd"], "等价于", arrow=False, dash=True)
    c.link(boxes["cce"], boxes["dc"], "相关", arrow=False, dash=True)
    for k, (_, paras, tone) in nodes.items():
        b = boxes[k]
        c.node(b.cx, b.cy, paras, tone, w=b.w, h=b.h)
    c.legend(6.5, 3.0, ["concept", "law", "formula", "application"])
    c.bottombar("数据示例", "节点下方为所属章节，节点与关系均取自当前整理的知识库")


def conventions(c):
    rows = [
        ("前置与推导分开记录", "「A 推导出 B」不自动补出「A 是 B 的前置」，需要时两条都写"),
        ("无方向的关系要少用", "「等价于」只用于完全等价；「相关」只在排除其他类型后才用"),
        ("同一事实不重复记录", "所属章节、公式变量已经说明的事，不再另建关系"),
    ]
    for i, (title, text) in enumerate(rows):
        r = Box(0.6, 13.8 - i * 3.75, 29.8, 3.3)
        c.card(r)
        side = Box(r.l, r.t, 9.0, r.h)
        c.tint(side)
        c.num(side.l + 0.9, side.cy, f"0{i + 1}")
        c.at("w", side.l + 1.6, side.cy, title, size=S_TITLE, color=PRIMARY, bold=True)
        c.text(place("w", r.l + 9.8, r.cy, 19.4, 2.6), text, line=25, anchor="m")
    c.bottombar("设计调整", "去掉了最初的「包含」关系：它的用法已被所属章节、「表达为」和「相关」覆盖")


def validation(c):
    c.card(Box(0.6, 13.8, 29.8, 5.0))
    e1 = c.node(4.0, 11.6, ["人工整理", "课程知识"], w=4.6, h=1.5)
    e2 = c.node(10.0, 11.6, ["系统启动", "读取知识库"], w=4.6, h=1.5)
    e3 = place("c", 15.8, 11.6, 4.4, 2.3)
    shp = c.shape("判断", MSO_SHAPE.DIAMOND, e3, TONES["accent"].tint, ACCENT, 1.25)
    fill_text(shp.text_frame, "20 条检查", color=TONES["accent"].ink, bold=True, align="c", anchor="m", wrap=False)
    e4 = c.node(24.3, 12.55, "正常提供查询和问答", w=5.8, h=1.4)
    e5 = c.node(24.3, 10.55, "报错并指出具体位置", "error", w=5.8, h=1.4)
    c.line(e1.east, e2.west, arrow=True)
    c.line(e2.east, (e3.l, e3.cy), arrow=True)
    bx = 19.1
    c.line((e3.r, e3.cy), (bx, e3.cy), GRAY, 1.1)
    c.poly([(bx, e3.cy), (bx, e4.cy), e4.west], PRIMARY)
    c.poly([(bx, e3.cy), (bx, e5.cy), e5.west], ERROR)
    c.label((bx + e4.l) / 2, e4.cy + 0.42, "通过")
    c.label((bx + e5.l) / 2, e5.cy + 0.42, "不通过")
    yb = 9.3
    c.poly([e5.south, (e5.cx, yb), (e1.cx, yb), e1.south], ERROR, dash=True)
    c.label(14.0, yb, "修改后重新启动")

    rules = Box(0.6, 8.3, 15.2, 6.4)
    body = c.card(rules, header="四类检查规则")
    c.table(body.l + 0.5, body.t - 0.3, [4.0, 10.2], [
        ("编号是否唯一", "编号不重复；不重复建同类关系"),
        ("引用是否存在", "所属章节、关系两端必须存在"),
        ("内容是否匹配", "专有内容与类型对应"),
        ("取值是否一致", "变量名称、单位与物理量一致"),
    ], row_h=1.2, header=False, first_col_bold=True)
    c.at("nw", 16.4, 8.3, "实际报错：B 的单位写错时", size=S_SMALL, color=GRAY, bold=True)
    c.snippet(HERE / "artifacts" / "validation_error.png", "nw", 16.4, 7.6)
    c.bottombar("人工审核", "内容是否符合教材、关系方向是否写反，仍需对照教材逐条确认")


def next_steps(c):
    c.card(Box(0.6, 13.8, 29.8, 2.4))
    for i, ((title, _, _, tone), status) in enumerate(zip(STAGES, STATUS)):
        x = 1.6 + i * 6.0
        nxt = status == "下一阶段"
        c.num(x, 12.95, str(i + 1), "accent" if nxt else "neutral")
        c.at("w", x + 0.6, 12.95, title, color=INK, bold=True)
        if nxt:
            c.chip("c", x + 2.1, 12.0, status, "accent", solid=True)
    # 前三个阶段共用一个「已完成」标注，不逐个重复标签
    c.line((1.2, 12.0), (15.6, 12.0), LINE, 1.0)
    c.label(8.4, 12.0, "已完成（阶段 1–3）")

    tech = Box(0.6, 11.1, 29.8, 1.1)
    c.card(tech)
    c.num(tech.l + 0.85, tech.cy, "01")
    c.title("w", tech.l + 1.55, tech.cy, "确定技术选型")
    c.at("w", tech.l + 5.9, tech.cy, "后端、存储、检索、大模型和前端各用什么，说明理由")
    c.chip("e", tech.r - 0.4, tech.cy, "产出：选型说明", "accent")

    works = [
        ("整理样例数据", "选一个代表性章节，按本次结构整理并检验", "样例章节数据"),
        ("实现查询接口", "搜索、知识详情、学习路径查询", "查询接口"),
        ("实现知识检索", "按问题找出相关知识点和关系", "检索模块"),
        ("接入课程问答", "大模型组织回答，返回引用的知识点", "问答接口"),
        ("开发前端页面", "搜索与详情、局部图谱、问答对话", "前端页面"),
    ]
    for i, (title, desc, out) in enumerate(works):
        s = Box(0.6 + i * 6.03, 9.75, 5.68, 9.15)
        body = c.card(s, header=title, solid=False)
        c.at("nw", body.l + 0.45, body.t - 0.4, f"第 {i + 2} 步", size=S_SMALL, color=PRIMARY, bold=True)
        c.text(Box(body.l + 0.45, body.t - 1.1, s.w - 0.8, 4.0), desc, line=24)
        c.output(s, out)


# (章节序号, 结论句标题, 正文, 口播稿)
PAGES = [
    (0, "本次处于第三阶段：设计知识对象并写成校验程序", roadmap,
     "整个项目分五个阶段推进，每个阶段都有明确的产出。前两个阶段上次已经汇报过。"
     "本次是第三阶段，设计知识对象、字段和关系，并把校验规则写成了程序。"
     "下一阶段先确定技术选型，再完成样例数据、查询、检索、问答和前端五项工作。"),
    (1, "课程知识只存一份，查询和问答结果都由它即时生成", objects,
     "设计时先区分两类东西：一类是需要长期保存的课程知识，由人工依据教材整理，包括章节、六类知识点、公式变量和关系；"
     "另一类是运行时根据请求临时算出的结果，比如搜索结果、学习路径和问答回答。"
     "后者不写回知识库，所以课程知识只有一份，各个功能读到的内容始终一致。"),
    (1, "章节只做导航，公式单独作为知识点", positioning,
     "章节只负责导航和排序，不进入图谱，每个知识点只属于一个章节，跨章节的联系用关系表达。"
     "公式单独作为知识点，这样可以被搜索、点击，单独展示变量和成立条件。"
     "每个对象都有固定的英文编号，名称修改不影响引用。"),
    (2, "六类知识点共用一套基本字段，各自再加专有内容", contents,
     "六类知识点共有名称、类型、说明、所属章节、别名、标签和适用条件。"
     "适用条件单独列出，公式的成立条件、方法的适用范围都记在同一个位置。"
     "各类再有专有内容，例如概念记定义和常见误解，物理量记符号和单位。"
     "颜色对应知识点类型，后面几页沿用同一套颜色。定律和概念记录的内容相同，直接沿用概念的结构。"),
    (2, "公式变量直接关联物理量，写法不一致时自动报错", formula,
     "以法拉第定律微分形式为例，左边是知识库里这一条的原文节选。每个变量记录符号、单位，并通过编号关联到对应的物理量。"
     "这样学生点击变量就能跳到物理量的定义；同一物理量在不同公式里名称或单位写得不一致时，启动时会报错。"
     "时间 t 不单独建模，所以关联为空。"),
    (3, "九种关系中七种有方向，方向由关系类型决定", relations,
     "关系一共九种。前置、定义、表达为、推导出、使用、描述、应用于这七种有方向，方向由类型决定，"
     "例如高斯定律表达为高斯定律积分形式，麦克斯韦方程组推导出波动方程。"
     "等价于和相关没有方向，相关是兜底类型。每条关系都要写一句说明。"),
    (3, "关系把四个章节的知识点连成一张图", graph,
     "这张图的节点和关系都取自当前整理的数据。从矢量分析的散度出发，经过静电场的高斯定律，"
     "到时变电磁场的麦克斯韦方程组，再推导出电磁波的波动方程。颜色表示知识点类型，虚线是无方向的关系。"),
    (3, "关系整理遵循三条约定，避免重复和含义模糊", conventions,
     "第一，前置和推导分开记录，系统不自动补，学生问学某个知识点之前要会什么时能得到明确答案。"
     "第二，无方向的关系要少用，避免含义模糊的连线。"
     "第三，同一事实只记一处，才不会前后矛盾。最初设计的包含关系也因此去掉了。"),
    (4, "启动时逐项检查 20 条规则，出错直接报出位置", validation,
     "课程知识由人工整理，难免出错。系统启动时先检查整个知识库，通过才提供查询和问答，"
     "不通过就报错并指出具体位置，修改后重新启动。规则分四类。"
     "右下是一次实际的报错：把 B 的单位故意改成 Wb，程序指出了是哪一条知识点的哪个变量、应该是什么单位。"
     "检查只能保证格式和引用正确，关系方向写反这类问题仍要人工对照教材确认。"),
    (5, "下一阶段先定技术选型，再完成五项原型工作", next_steps,
     "下一阶段进入样例与原型实现。开始之前先确定技术选型并说明理由。"
     "然后整理一个代表性章节的样例数据，在其上实现查询接口、知识检索、课程问答和前端页面，每项都有对应的产出。"
     "数据先用一个结构化文件保存，以后数据变大再迁移到图数据库。"),
]

deck = Deck()
deck.cover("电磁场与波AI知识图谱对象与数据结构设计", "杨国炜", "2026年10月7日")
deck.toc(SECTIONS)
done = set()
for sec, title, draw, notes in PAGES:
    if sec not in done:
        deck.divider(SECTIONS[sec])
        done.add(sec)
    draw(deck.content(SECTIONS[sec], title, notes=notes))
deck.save(OUTPUT)
print("written", OUTPUT)
