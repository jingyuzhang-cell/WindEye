# -*- coding: utf-8 -*-
"""Regenerate 4 Chinese technical figures for the research proposal."""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "generated"
OUT_DIR.mkdir(parents=True, exist_ok=True)

W, H = 1600, 930

# ---- Color palette ----
C_BG = "#FFFFFF"
C_TITLE = "#1E3A5F"
C_BLUE_BG = "#DBEAFE"
C_BLUE_BD = "#3B82F6"
C_PINK_BG = "#FCE7F3"
C_PINK_BD = "#EC4899"
C_GREEN_BG = "#D1FAE5"
C_GREEN_BD = "#10B981"
C_PURPLE_BG = "#EDE9FE"
C_PURPLE_BD = "#8B5CF6"
C_AMBER_BG = "#FEF3C7"
C_AMBER_BD = "#F59E0B"
C_GRAY_BG = "#F3F4F6"
C_GRAY_BD = "#6B7280"
C_DARK = "#111827"
C_MEDIUM = "#374151"
C_LIGHT = "#6B7280"
C_WHITE = "#FFFFFF"
C_RED = "#EF4444"
C_ORANGE = "#F97316"


def fnt(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/msyhbd.ttc") if bold else Path("C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/simhei.ttf"),
        Path("C:/Windows/Fonts/simsun.ttc"),
    ]
    for p in candidates:
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def round_box(draw, xy, fill, outline=C_GRAY_BD, radius=14, width=2):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def center_text(draw, xy, text, font, fill=C_DARK, line_gap=4):
    x1, y1, x2, y2 = xy
    lines = text.split("\n")
    heights, widths = [], []
    for line in lines:
        bb = draw.textbbox((0, 0), line, font=font)
        widths.append(bb[2] - bb[0])
        heights.append(bb[3] - bb[1])
    total_h = sum(heights) + line_gap * (len(lines) - 1)
    y = y1 + (y2 - y1 - total_h) / 2
    for line, w, h in zip(lines, widths, heights):
        draw.text((x1 + (x2 - x1 - w) / 2, y), line, font=font, fill=fill)
        y += h + line_gap


def draw_arrow(draw, start, end, color=C_MEDIUM, width=3):
    draw.line([start, end], fill=color, width=width)
    x1, y1 = start
    x2, y2 = end
    if abs(x2 - x1) >= abs(y2 - y1):
        sign = 1 if x2 >= x1 else -1
        pts = [(x2, y2), (x2 - sign * 14, y2 - 8), (x2 - sign * 14, y2 + 8)]
    else:
        sign = 1 if y2 >= y1 else -1
        pts = [(x2, y2), (x2 - 8, y2 - sign * 14), (x2 + 8, y2 - sign * 14)]
    draw.polygon(pts, fill=color)


def draw_dashed_arrow(draw, start, end, color=C_LIGHT, width=2):
    """Draw a dashed return/feedback arrow."""
    x1, y1 = start
    x2, y2 = end
    # Draw dashed line manually
    dx, dy = x2 - x1, y2 - y1
    steps = 20
    for i in range(0, steps, 2):
        t0 = i / steps
        t1 = (i + 1) / steps
        draw.line(
            [(x1 + dx * t0, y1 + dy * t0), (x1 + dx * t1, y1 + dy * t1)],
            fill=color, width=width
        )
    # Arrowhead
    if abs(dx) >= abs(dy):
        sign = 1 if dx >= 0 else -1
        pts = [(x2, y2), (x2 - sign * 12, y2 - 6), (x2 - sign * 12, y2 + 6)]
    else:
        sign = 1 if dy >= 0 else -1
        pts = [(x2, y2), (x2 - 6, y2 - sign * 12), (x2 + 6, y2 - sign * 12)]
    draw.polygon(pts, fill=color)


def fig1_framework(path: Path):
    """Figure 1: Overall logical framework for multi-agent compliance governance."""
    img = Image.new("RGB", (W, H), C_BG)
    d = ImageDraw.Draw(img)
    title_font = fnt(26, bold=True)
    label_font = fnt(15, bold=True)
    small_font = fnt(12)
    tiny_font = fnt(10)

    # Title
    d.text((W // 2 - 280, 18), "图1  资本市场多智能体合规协同治理总体逻辑框架图", font=title_font, fill=C_TITLE)

    # ---- LAYER 0: Data Sources (bottom) ----
    data_y = 680
    round_box(d, (40, data_y, 1560, data_y + 90), C_GRAY_BG, C_GRAY_BD)
    center_text(d, (40, data_y, 1560, data_y + 32), "真实监管数据接入层", label_font, C_DARK)
    data_items = [
        ("深交所\n纪律处分", C_BLUE_BG, C_BLUE_BD),
        ("北交所\n自律监管措施", C_PINK_BG, C_PINK_BD),
        ("上交所\n监管问询", C_GREEN_BG, C_GREEN_BD),
        ("证监会\n行政处罚", C_PURPLE_BG, C_PURPLE_BD),
        ("上市公司\n公告全文", C_AMBER_BG, C_AMBER_BD),
        ("法规条款\n政策文件", C_GRAY_BG, C_GRAY_BD),
    ]
    box_w = 230
    start_x = 50
    for i, (label, bg, bd) in enumerate(data_items):
        x = start_x + i * (box_w + 10)
        round_box(d, (x, data_y + 38, x + box_w, data_y + 82), bg, bd, radius=8)
        center_text(d, (x, data_y + 38, x + box_w, data_y + 82), label, small_font, C_DARK)

    # Arrow from data to KG
    draw_arrow(d, (W // 2, data_y), (W // 2, data_y - 50), C_BLUE_BD, 3)

    # ---- LAYER 1: Four-Layer KG (middle-low) ----
    kg_y = 450
    round_box(d, (40, kg_y, 1560, kg_y + 115), C_BLUE_BG, C_BLUE_BD, radius=12, width=3)
    center_text(d, (40, kg_y, 1560, kg_y + 30), "四层事理知识图谱 (Neo4j)", label_font, C_TITLE)
    kg_layers = [
        ("主体层\n企业 | 人员 | 基金 | 证券", C_BLUE_BG),
        ("事件层\n投资 | 担保 | 涉诉 | 处罚", C_PINK_BG),
        ("特征层\n数据来源不明 | 算法偏见\n模型幻觉 | 适当性不匹配", C_GREEN_BG),
        ("法规层\n法律法规 | 监管规则\n行业规范 | 治理动作", C_PURPLE_BG),
    ]
    kg_w = 360
    kg_start = 50
    for i, (label, bg) in enumerate(kg_layers):
        x = kg_start + i * (kg_w + 15)
        round_box(d, (x, kg_y + 35, x + kg_w, kg_y + 108), bg, C_GRAY_BD, radius=8)
        center_text(d, (x, kg_y + 35, x + kg_w, kg_y + 108), label, small_font, C_DARK)

    # Arrow from KG to M1-M4
    draw_arrow(d, (W // 2, kg_y), (W // 2, kg_y - 50), C_PURPLE_BD, 3)

    # ---- LAYER 2: M1-M4 Agents (middle-high) ----
    agent_y = 230
    round_box(d, (40, agent_y, 1560, agent_y + 105), C_PURPLE_BG, C_PURPLE_BD, radius=12, width=3)
    center_text(d, (40, agent_y, 1560, agent_y + 28), "M1–M4 多智能体协同治理管线", label_font, C_TITLE)
    agents = [
        ("M1 感知与检索\n意图识别 | 实体对齐\n多源并行证据召回", C_BLUE_BG, C_BLUE_BD),
        ("M2 图谱推理\n1–5跳穿透查询\n社区发现 | 路径枚举", C_PINK_BG, C_PINK_BD),
        ("M3 合规校验\n法规条款匹配\n三级指标评分 | 证据完整性", C_GREEN_BG, C_GREEN_BD),
        ("M4 共识治理\n冲突消解 | 置信度聚合\n分级处置 | 报告生成", C_AMBER_BG, C_AMBER_BD),
    ]
    ag_w = 360
    ag_start = 50
    for i, (label, bg, bd) in enumerate(agents):
        x = ag_start + i * (ag_w + 15)
        round_box(d, (x, agent_y + 33, x + ag_w, agent_y + 98), bg, bd, radius=8)
        center_text(d, (x, agent_y + 33, x + ag_w, agent_y + 98), label, small_font, C_DARK)

    # Horizontal arrows between agents
    for i in range(3):
        x1 = ag_start + i * (ag_w + 15) + ag_w
        x2 = ag_start + (i + 1) * (ag_w + 15)
        my = agent_y + 65
        draw_arrow(d, (x1, my), (x2, my), C_MEDIUM, 2)

    # Arrow from M1-M4 to Output
    draw_arrow(d, (W // 2, agent_y), (W // 2, agent_y - 50), C_GREEN_BD, 3)

    # ---- LAYER 3: Output (top) ----
    output_y = 55
    round_box(d, (40, output_y, 1560, output_y + 105), C_GREEN_BG, C_GREEN_BD, radius=12, width=3)
    center_text(d, (40, output_y, 1560, output_y + 28), "治理输出层", label_font, C_TITLE)
    outputs = [
        ("风险传导路径", C_WHITE),
        ("合规评分\n(三级指标体系)", C_WHITE),
        ("协同治理报告\n(Markdown/DOCX/PDF)", C_WHITE),
        ("责任主体清单\n与处置建议", C_WHITE),
    ]
    out_w = 360
    out_start = 50
    for i, (label, bg) in enumerate(outputs):
        x = out_start + i * (out_w + 15)
        round_box(d, (x, output_y + 33, x + out_w, output_y + 98), bg, C_GRAY_BD, radius=8)
        center_text(d, (x, output_y + 33, x + out_w, output_y + 98), label, small_font, C_DARK)

    # ---- FEEDBACK LOOP (left side) ----
    draw_dashed_arrow(d, (30, output_y + 50), (30, data_y + 40), C_RED, 2)
    d.text((8, 400), "人\n工\n复\n核\n反\n馈", font=tiny_font, fill=C_RED)

    # ---- GovernanceContext center label ----
    round_box(d, (620, 340, 980, 370), C_WHITE, C_ORANGE, radius=6, width=1)
    center_text(d, (620, 340, 980, 370), "GovernanceContext — 全局状态结构体", tiny_font, C_ORANGE)

    img.save(path, "PNG")
    print(f"  fig1_framework -> {path}")


def fig2_agents(path: Path):
    """Figure 2: M1-M4 closed-loop reasoning mechanism."""
    img = Image.new("RGB", (W, H), C_BG)
    d = ImageDraw.Draw(img)
    title_font = fnt(24, bold=True)
    box_title = fnt(14, bold=True)
    body_font = fnt(11)
    tiny_font = fnt(10)

    d.text((W // 2 - 260, 15), "图2  M1–M4多智能体合规治理闭环推理机制图", font=title_font, fill=C_TITLE)

    # ---- Input box (left) ----
    round_box(d, (30, 70, 200, 160), C_GRAY_BG, C_GRAY_BD, radius=10)
    center_text(d, (30, 70, 200, 160), "输入\n自然语言问题\n上传文件\n监管材料", body_font, C_DARK)

    # ---- M1 Box ----
    m1_x, m1_y, m1_w, m1_h = 270, 60, 280, 100
    round_box(d, (m1_x, m1_y, m1_x + m1_w, m1_y + m1_h), C_BLUE_BG, C_BLUE_BD, radius=10, width=2)
    center_text(d, (m1_x, m1_y, m1_x + m1_w, m1_y + 22), "M1 感知与检索层", box_title, C_DARK)
    center_text(d, (m1_x, m1_y + 22, m1_x + m1_w, m1_y + m1_h),
                "意图识别 | 实体抽取\n多源并行证据召回 | 实体对齐", body_font, C_MEDIUM)

    # ---- M2 Box ----
    m2_x, m2_y, m2_w, m2_h = 580, 60, 280, 100
    round_box(d, (m2_x, m2_y, m2_x + m2_w, m2_y + m2_h), C_PINK_BG, C_PINK_BD, radius=10, width=2)
    center_text(d, (m2_x, m2_y, m2_x + m2_w, m2_y + 22), "M2 图谱推理层", box_title, C_DARK)
    center_text(d, (m2_x, m2_y + 22, m2_x + m2_w, m2_y + m2_h),
                "1–5跳穿透查询 | 社区发现\n风险路径枚举与评分\nWCC / Louvain / HGT-GKMeans", body_font, C_MEDIUM)

    # ---- M3 Box ----
    m3_x, m3_y, m3_w, m3_h = 890, 60, 280, 100
    round_box(d, (m3_x, m3_y, m3_x + m3_w, m3_y + m3_h), C_GREEN_BG, C_GREEN_BD, radius=10, width=2)
    center_text(d, (m3_x, m3_y, m3_x + m3_w, m3_y + 22), "M3 合规校验层", box_title, C_DARK)
    center_text(d, (m3_x, m3_y + 22, m3_x + m3_w, m3_y + m3_h),
                "路径—法规匹配\n三级合规指标评分\nEvidenceChain完整性检查", body_font, C_MEDIUM)

    # ---- M4 Box ----
    m4_x, m4_y, m4_w, m4_h = 1200, 60, 280, 100
    round_box(d, (m4_x, m4_y, m4_x + m4_w, m4_y + m4_h), C_AMBER_BG, C_AMBER_BD, radius=10, width=2)
    center_text(d, (m4_x, m4_y, m4_x + m4_w, m4_y + 22), "M4 共识治理层", box_title, C_DARK)
    center_text(d, (m4_x, m4_y + 22, m4_x + m4_w, m4_y + m4_h),
                "冲突消解 | 置信度聚合\n分级处置（高/中/低）\n人工复核触发", body_font, C_MEDIUM)

    # ---- Arrows between M1-M4 ----
    for (x1, x2) in [(550, 580), (860, 890), (1170, 1200)]:
        draw_arrow(d, (x1, 110), (x2, 110), C_MEDIUM, 2)

    # ---- Arrow from Input to M1 ----
    draw_arrow(d, (230, 115), (270, 115), C_MEDIUM, 2)

    # ---- GovernanceContext (bottom center) ----
    gc_x, gc_y, gc_w, gc_h = 200, 220, 1200, 170
    round_box(d, (gc_x, gc_y, gc_x + gc_w, gc_y + gc_h), C_WHITE, C_ORANGE, radius=12, width=3)
    center_text(d, (gc_x, gc_y, gc_x + gc_w, gc_y + 30),
                "GovernanceContext — 全局状态结构体（贯穿 M1–M4 全管线）", box_title, C_ORANGE)
    gc_items = [
        ("实体集合", "证据子图"),
        ("候选风险路径", "法规条款映射"),
        ("三级指标评分", "共识评分 Conf(y)"),
    ]
    for i, (item1, item2) in enumerate(gc_items):
        x = gc_x + 80 + i * 380
        round_box(d, (x, gc_y + 38, x + 160, gc_y + 75), C_GRAY_BG, C_GRAY_BD, radius=6)
        center_text(d, (x, gc_y + 38, x + 160, gc_y + 75), item1, tiny_font, C_DARK)
        round_box(d, (x + 180, gc_y + 38, x + 340, gc_y + 75), C_GRAY_BG, C_GRAY_BD, radius=6)
        center_text(d, (x + 180, gc_y + 38, x + 340, gc_y + 75), item2, tiny_font, C_DARK)

    # ---- EvidenceChain bar (below GC) ----
    ec_y = gc_y + gc_h + 15
    round_box(d, (200, ec_y, 1400, ec_y + 50), C_GREEN_BG, C_GREEN_BD, radius=8, width=2)
    center_text(d, (200, ec_y, 1400, ec_y + 50),
                "EvidenceChain = 〈 C,  P₁₋₅,  R_clause,  S_data,  T,  Conf,  Sub_resp 〉",
                fnt(13, bold=True), C_DARK)

    # ---- Output (right) ----
    round_box(d, (1510, 60, 1585, 140), C_GREEN_BG, C_GREEN_BD, radius=8)
    center_text(d, (1510, 60, 1585, 140), "治\n理\n报\n告", body_font, C_DARK)

    # ---- Feedback arrows (red dashed) ----
    draw_dashed_arrow(d, (m3_x + m3_w // 2, m3_y - 5), (m1_x + m1_w // 2, m1_y - 5), C_RED, 2)
    d.text((600, 38), "低置信拦截 / 重检索", font=tiny_font, fill=C_RED)

    draw_dashed_arrow(d, (gc_x - 10, gc_y + gc_h // 2), (gc_x - 10, m1_y), C_RED, 2)
    d.text((75, 155), "人工复核\nHuman-in-the-loop", font=tiny_font, fill=C_RED)

    # ---- Down arrows from agents to GC ----
    for mx in [410, 720, 1030, 1340]:
        draw_arrow(d, (mx, m1_y + m1_h), (mx, gc_y), C_LIGHT, 2)

    img.save(path, "PNG")
    print(f"  fig2_agents -> {path}")


def fig3_paths(path: Path):
    """Figure 3: Five-level penetration risk path analysis based on event KG."""
    img = Image.new("RGB", (W, H), C_BG)
    d = ImageDraw.Draw(img)
    title_font = fnt(24, bold=True)
    box_title = fnt(14, bold=True)
    body_font = fnt(12)
    tiny_font = fnt(10)

    d.text((W // 2 - 280, 15), "图3  基于事理图谱的五级穿透风险路径分析图", font=title_font, fill=C_TITLE)

    # ---- Start: Enterprise Subject ----
    start_x, start_y = 80, 500
    round_box(d, (start_x, start_y, start_x + 180, start_y + 80), C_BLUE_BG, C_BLUE_BD, radius=14, width=3)
    center_text(d, (start_x, start_y, start_x + 180, start_y + 80), "企业主体\nA公司", box_title, C_DARK)

    # ---- Hop levels ----
    hops = [
        ("第1跳\n关联企业/人员", C_PINK_BG, C_PINK_BD, "INVEST\nCONTROLLER\nGUARANTEE"),
        ("第2跳\n风险事件", C_GREEN_BG, C_GREEN_BD, "违规披露\n涉诉\n异常交易"),
        ("第3跳\n风险特征", C_PURPLE_BG, C_PURPLE_BD, "算法偏见\n模型幻觉\n数据来源不明"),
        ("第4跳\n法规条款", C_AMBER_BG, C_AMBER_BD, "《人工智能法》\n安全治理框架\n合规指标"),
        ("第5跳\n治理动作", C_BLUE_BG, C_BLUE_BD, "责任主体分配\n处置建议\n监管报告"),
    ]

    hop_x = 300
    hop_w = 220
    for i, (title, bg, bd, detail) in enumerate(hops):
        x = hop_x + i * (hop_w + 25)
        y = 420 - (i % 2) * 60  # wave pattern
        round_box(d, (x, y, x + hop_w, y + 130), bg, bd, radius=10, width=2)
        center_text(d, (x, y, x + hop_w, y + 28), title, box_title, C_DARK)
        center_text(d, (x, y + 28, x + hop_w, y + 130), detail, tiny_font, C_MEDIUM)

    # ---- Arrows connecting hops ----
    for i in range(4):
        x1 = 300 + i * (hop_w + 25) + hop_w
        y1 = 485 - (i % 2) * 60
        x2 = 300 + (i + 1) * (hop_w + 25)
        y2 = 485 - ((i + 1) % 2) * 60
        draw_arrow(d, (x1, y1), (x2, y2), C_MEDIUM, 2)

    # Arrow from start to hop 1
    draw_arrow(d, (260, 540), (300, 485), C_MEDIUM, 2)

    # ---- Bottom: Scoring formula ----
    formula_y = 630
    round_box(d, (80, formula_y, 1520, formula_y + 65), C_GRAY_BG, C_GRAY_BD, radius=10)
    center_text(d, (80, formula_y, 1520, formula_y + 28),
                "风险路径评分模型", box_title, C_DARK)
    center_text(d, (80, formula_y + 28, 1520, formula_y + 65),
                "Risk(p) = α·Rel(p) + β·Node(p) + γ·Com(p) + δ·Law(p) + η·Len(p)",
                fnt(14, bold=True), C_TITLE)

    # ---- Neo4j label ----
    round_box(d, (1300, 360, 1500, 440), C_GREEN_BG, C_GREEN_BD, radius=8, width=2)
    center_text(d, (1300, 360, 1500, 440), "Neo4j\nCypher\n多跳查询", tiny_font, C_DARK)

    # ---- Key annotation ----
    d.text((80, 710), "P₁₋₅: 五级穿透路径  |  输出: 风险路径评分、法规匹配、责任主体", font=tiny_font, fill=C_LIGHT)

    # ---- Risk relation whitelist ----
    round_box(d, (80, 730, 700, 790), C_AMBER_BG, C_AMBER_BD, radius=6)
    center_text(d, (80, 730, 700, 790),
                "风险关系白名单: INVEST(1.00) | GUARANTEE(0.98) | CONTROLLER(0.95)\nCAUSE(0.75) | TRIGGERS(0.70) | REFLECTS(0.65) | COMPLIES_WITH(0.55)",
                tiny_font, C_DARK)

    img.save(path, "PNG")
    print(f"  fig3_paths -> {path}")


def fig4_eval(path: Path):
    """Figure 4: Experimental plan and evaluation metrics."""
    img = Image.new("RGB", (W, H), C_BG)
    d = ImageDraw.Draw(img)
    title_font = fnt(24, bold=True)
    col_title = fnt(15, bold=True)
    body_font = fnt(12)
    tiny_font = fnt(10)

    d.text((W // 2 - 260, 15), "图4  试验方案：五类基线、七组指标、三类案例", font=title_font, fill=C_TITLE)

    # ---- Column 1: Baselines ----
    col1_x, col_y, col_w, col_h = 40, 55, 480, 330
    round_box(d, (col1_x, col_y, col1_x + col_w, col_y + col_h), C_BLUE_BG, C_BLUE_BD, radius=12, width=2)
    center_text(d, (col1_x, col_y, col1_x + col_w, col_y + 32), "对比基线（五类）", col_title, C_TITLE)

    baselines = [
        "B1: 单一 LLM 直接研判",
        "B2: 普通文档 RAG 增强生成",
        "B3: GraphRAG 图谱增强生成",
        "B4: 无证据校验多智能体",
        "B5: 本项目完整方法（Ours）",
        "",
        "消融实验：",
        "• 去除事理图谱层",
        "• 去除合规智能体（M3）",
        "• 去除证据校验（EvidenceChain）",
        "• 去除共识聚合（M4）",
    ]
    for i, line in enumerate(baselines):
        clr = C_RED if "Ours" in line else C_DARK
        d.text((col1_x + 18, col_y + 42 + i * 24), line, font=body_font, fill=clr)

    # ---- Column 2: Metrics ----
    col2_x = 550
    round_box(d, (col2_x, col_y, col2_x + col_w, col_y + col_h), C_GREEN_BG, C_GREEN_BD, radius=12, width=2)
    center_text(d, (col2_x, col_y, col2_x + col_w, col_y + 32), "评价指标（七组）", col_title, C_TITLE)

    metrics = [
        "1. 实体 / 关系抽取 F1 分数",
        "2. 法规匹配准确率 (Regulation Acc.)",
        "3. 风险结论准确率 (Risk Acc.)",
        "4. 证据覆盖率 (Evidence Coverage)",
        "5. 幻觉率 (Hallucination Rate)",
        "   — 事实幻觉 (Factual Hall.)",
        "   — 结构幻觉 (Structural Hall.)",
        "6. 治理建议可执行性 (Executability)",
        "7. 响应时延 (Latency)",
        "",
        "专家评价：",
        "• 准确性  • 可解释性",
        "• 可操作性  • 监管适配性",
    ]
    for i, line in enumerate(metrics):
        d.text((col2_x + 18, col_y + 42 + i * 24), line, font=body_font, fill=C_DARK)

    # ---- Column 3: Cases ----
    col3_x = 1060
    round_box(d, (col3_x, col_y, col3_x + col_w, col_y + col_h), C_PURPLE_BG, C_PURPLE_BD, radius=12, width=2)
    center_text(d, (col3_x, col_y, col3_x + col_w, col_y + 32), "案例场景（三类）", col_title, C_TITLE)

    cases = [
        "场景1: AI投顾适当性风险",
        "  — 风险等级不匹配",
        "  — 投资者适当性评估",
        "  — 误导性推荐识别",
        "",
        "场景2: 算法交易异常风险",
        "  — 异常波动检测",
        "  — 市场操纵风险",
        "  — 跨市场传导分析",
        "",
        "场景3: AI研报/披露合规风险",
        "  — 生成内容真实性核验",
        "  — 信息披露完整性检查",
        "  — 法规条款引用准确性",
    ]
    for i, line in enumerate(cases):
        d.text((col3_x + 18, col_y + 42 + i * 20), line, font=tiny_font, fill=C_DARK)

    # ---- Bottom: Data scale ----
    bottom_y = 420
    round_box(d, (40, bottom_y, 1520, bottom_y + 55), C_AMBER_BG, C_AMBER_BD, radius=10, width=2)
    center_text(d, (40, bottom_y, 1520, bottom_y + 55),
                "数据集: ≥100个案例片段  |  人工标注: 实体/关系/风险等级/法规依据/标准结论  |  数据来源: 深交所/北交所/上交所/证监会/公开公告",
                body_font, C_DARK)

    # ---- Core hypothesis ----
    hyp_y = 500
    round_box(d, (200, hyp_y, 1400, hyp_y + 80), C_GREEN_BG, C_GREEN_BD, radius=10, width=2)
    center_text(d, (200, hyp_y, 1400, hyp_y + 30), "核心验证假设", col_title, C_TITLE)
    center_text(d, (200, hyp_y + 30, 1400, hyp_y + 80),
                "事理图谱 + EvidenceChain约束 + M1–M4协同 = 显著降低幻觉率、提升证据覆盖率与治理建议可执行性",
                fnt(13, bold=True), C_TITLE)

    img.save(path, "PNG")
    print(f"  fig4_eval -> {path}")


def main():
    print("Regenerating 4 Chinese technical figures...")
    fig1_framework(OUT_DIR / "fig1_framework.png")
    fig2_agents(OUT_DIR / "fig2_agents.png")
    fig3_paths(OUT_DIR / "fig3_route.png")
    fig4_eval(OUT_DIR / "fig4_eval.png")
    print("\nAll figures regenerated successfully!")


if __name__ == "__main__":
    main()
