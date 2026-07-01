"""
研究项目申报书深度润色脚本
对 paper_draft.md 进行全文去AI化、公式LaTeX化、内容深度增强
"""
import re
from pathlib import Path

DOCS_DIR = Path(r"D:\Code\WindEye\docs")
INPUT_FILE = DOCS_DIR / "paper_draft.md"
OUTPUT_FILE = DOCS_DIR / "paper_draft.md"  # 原地覆盖

def read_file():
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        return f.read()

def write_file(content):
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Written: {OUTPUT_FILE} ({len(content)} chars)")

# ========== 1. 全文去AI化：删除段首短句总结模式 ==========
def de_ai_short_summaries(text):
    """删除AI生成的段首短句总结，如'场景牵引。''图谱表达。''智能体协同。''证据闭环。'"""
    replacements = [
        # 第三大点 (一) 研究思路 中的四个短句
        ("场景牵引。项目从资本市场人工智能应用治理需求出发，聚焦智能投顾、算法交易、智能研报、合规审查、信息披露辅助和风险预警等场景，梳理其中涉及的市场主体、AI系统、数据来源、算法行为、风险事件、法规条款和治理动作，明确研究对象与应用边界。",
         "项目从资本市场人工智能应用治理需求出发，聚焦智能投顾、算法交易、智能研报、合规审查、信息披露辅助和风险预警等典型场景，系统梳理其中涉及的市场主体、AI系统、数据来源、算法行为、风险事件、法规条款和治理动作，明确研究对象与应用边界。"),

        ("图谱表达。项目将分散的文本、事件、关系和法规信息组织为",
         "在此基础上，项目将分散的文本、事件、关系和法规信息组织为"),

        ("智能体协同。项目采用M1-M4的工程化协同架构，由M1感知检索、M2图谱推理、M3合规校验和M4共识治理依次完成证据召回、路径解释、规则匹配和治理输出，避免抽象化地停留在"多个智能体共同分析"的概念层面。",
         "在协同推理层面，项目采用M1-M4的工程化协同架构，由M1感知检索、M2图谱推理、M3合规校验和M4共识治理依次完成证据召回、路径解释、规则匹配和治理输出，避免将多智能体系统抽象化为"多个智能体共同分析"的松散概念。"),

        ("证据闭环。系统以图谱路径、法规条款、来源记录和置信度计算为核心约束，将风险判断、合规评分和治理建议统一到可审计的EvidenceChain中，并通过案例实验、基线对比和专家评价验证方法有效性。",
         "系统以图谱路径、法规条款、来源记录和置信度计算为核心约束，将风险判断、合规评分和治理建议统一纳入可审计的证据链（EvidenceChain），通过案例实验、基线对比和专家评价验证方法有效性，形成从证据输入到治理输出的完整闭环。"),

        # 去AI化：过于工整的排比式短句
        ("理论价值在于构建连续化风险表达框架，传统知识图谱侧重实体与关系表达，",
         "从理论层面看，传统知识图谱侧重实体与关系的静态表达，"),

        ("方法价值在于强化大模型合规结论的证据约束，单一大模型在高风险合规场景中容易出现依据不清、证据不足和责任归属模糊等问题。",
         "从方法层面看，单一大模型在高风险合规场景中容易出现依据不清、证据不足和责任归属模糊等问题，亟需通过外部结构化知识对模型输出施加证据约束。"),

        ("应用价值在于服务资本市场智能监管与合规实践，项目拟将公开法规政策、监管案例、上市公司公告、舆情文本和模拟业务场景转化为可计算、可检索、可验证的治理证据，",
         "从应用层面看，项目拟将公开法规政策、监管案例、上市公司公告、舆情文本和模拟业务场景转化为可计算、可检索、可验证的治理证据，"),
    ]

    for old, new in replacements:
        if old in text:
            text = text.replace(old, new)
            print(f"  [去AI化] 替换成功: {old[:30]}...")
        else:
            print(f"  [去AI化] 未找到: {old[:30]}...")

    return text

# ========== 2. 调整DRA-MA课程论文引用 ==========
def adjust_dra_ma_citation(text):
    """将DRA-MA课程论文从权威引用改为设计思路来源"""
    old = ("前期DRA-MA课程论文指出，检索与生成解耦会导致错误级联，事后校验难以从源头阻断结构性幻觉。"
           "本项目通过GovernanceContext和EvidenceChain将图谱路径、法规条款、数据来源和执行结果纳入统一约束，使合规结论必须由可执行证据支撑，而不是由模型自由生成。")
    new = ("前期课程研究中对DRA-MA动态路由、执行反馈与自愈校验机制的实验探索表明，"
           "检索与生成环节的解耦容易导致错误级联——上游实体识别偏差会在下游推理中被逐级放大，而单纯依赖事后校验难以从源头阻断此类结构性幻觉。"
           "基于这一观察，本项目将GovernanceContext和EvidenceChain作为贯穿M1-M4管线的统一约束层，"
           "要求每一项合规结论必须绑定图谱路径、法规条款、数据来源和执行结果，使模型输出受到可执行证据的刚性约束，而非仅依赖语言模型的自由生成。")

    if old in text:
        text = text.replace(old, new)
        print("  [DRA-MA] 引用调整成功")
    else:
        print("  [DRA-MA] WARNING: 未找到需要替换的原文")
    return text

# ========== 3. 所有公式转换为LaTeX格式 ==========
def latex_formulas(text):
    """将纯文本公式转换为LaTeX格式"""
    formula_replacements = [
        # 四层事理图谱模型
        ("G = (V_S, V_E, V_F, V_R, E)",
         "$G = (V_S, V_E, V_F, V_R, E)$"),

        # 证据约束结论生成
        ("C* = argmax_C Score(C | G_q, P, R, E_c)",
         "$C^* = \\arg\\max_C \\; \\text{Score}(C \\mid G_q, P, R, E_c)$"),

        # 风险传导路径评分
        ("Risk(p) = αRel(p) + βNode(p) + γCom(p) + δLaw(p) + ηLen(p)",
         "$\\text{Risk}(p) = \\alpha\\,\\text{Rel}(p) + \\beta\\,\\text{Node}(p) + \\gamma\\,\\text{Com}(p) + \\delta\\,\\text{Law}(p) + \\eta\\,\\text{Len}(p)$"),

        # 多智能体共识评分
        ("Conf(y) = λ1Cov(E_c) + λ2Cons(A) + λ3Exec(G) + λ4Rule(R) − λ5Hall(y)",
         "$\\text{Conf}(y) = \\lambda_1\\,\\text{Cov}(E_c) + \\lambda_2\\,\\text{Cons}(A) + \\lambda_3\\,\\text{Exec}(G) + \\lambda_4\\,\\text{Rule}(R) - \\lambda_5\\,\\text{Hall}(y)$"),

        # 动态路由
        ("Route(q) = SimplePath, if h_est = 1; ComplexPath, if h_est ≥ 2",
         "$\\text{Route}(q) = \\text{SimplePath},\\; \\text{if } h_{\\text{est}} = 1;\\; \\text{ComplexPath},\\; \\text{if } h_{\\text{est}} \\geq 2$"),

        # 门控权重
        ("g(q) = σ(W_g · h_q + b_g), y = g(q) f_LLM(q) + (1 − g(q)) f_KG(q)",
         "$g(q) = \\sigma(W_g \\cdot h_q + b_g),\\quad y = g(q)\\,f_{\\text{LLM}}(q) + (1 - g(q))\\,f_{\\text{KG}}(q)$"),
    ]

    for old, new in formula_replacements:
        if old in text:
            text = text.replace(old, new)
            print(f"  [LaTeX] 公式转换: {old[:40]}...")
        else:
            print(f"  [LaTeX] WARNING: 未找到: {old[:40]}...")

    return text

# ========== 4. 引入EvidenceChain形式化定义 ==========
def insert_evidence_chain_definition(text):
    """在M3合规校验层段落中插入EvidenceChain的形式化定义"""
    # 找到M3描述段落中"并通过EvidenceChain检查证据完整性"之后插入
    anchor = "并通过EvidenceChain检查证据完整性"
    definition = (
        "。系统形式化定义证据链向量为 "
        "$$\\text{EvidenceChain} = \\langle C, P_{1\\to 5}, R_{\\text{clause}}, S_{\\text{data}}, T, \\text{Conf}, \\text{Sub}_{\\text{resp}} \\rangle$$ "
        "其中 $C$ 为合规结论，$P_{1\\to 5}$ 为经过一至五跳穿透查询的图谱路径集合，"
        "$R_{\\text{clause}}$ 为映射的法规条款，$S_{\\text{data}}$ 为数据来源标识及时间戳 $T$，"
        "$\\text{Conf}$ 为置信度评分，$\\text{Sub}_{\\text{resp}}$ 为责任主体。"
        "每一项合规结论均需在上述六个维度上具备完整的证据支撑"
    )

    if anchor in text:
        # 将锚点替换为锚点+定义
        text = text.replace(anchor, anchor + definition)
        print("  [EvidenceChain] 形式化定义插入成功")
    else:
        print("  [EvidenceChain] WARNING: 未找到锚点")

    return text

# ========== 5. 增强"图谱即执行环境"概念 ==========
def enhance_graph_environment_concept(text):
    """在创新性和研究思路中强化'图谱即环境'概念"""

    # 5.1 在创新性"事理图谱驱动的穿透式合规建模"部分强化
    old_innovation1 = (
        "事理图谱驱动的穿透式合规建模，将资本市场AI应用治理对象抽象为主体层、事件层、特征层、法规层四层事理结构，"
        "使企业主体、风险事件、算法风险、法规条款和治理动作能够在同一图谱中表达。"
        "与传统企业关系图谱相比，该模型不仅描述"谁与谁有关联"，还进一步刻画"风险因何发生、如何传导、依据何种规则判断、由谁采取治理动作"。"
    )
    new_innovation1 = (
        "事理图谱驱动的穿透式合规建模。"
        "项目将资本市场AI应用治理对象抽象为主体层、事件层、特征层、法规层四层事理结构，"
        "使企业主体、风险事件、算法风险、法规条款和治理动作能够在同一图谱中表达。"
        "在本框架中，事理图谱并非仅作为静态知识库供检索，而是承担事实检索、路径约束、法规映射和责任追溯四项功能的"
        ""可计算证据执行环境"：智能体在图谱之上执行多跳推理，图谱中的节点、关系和属性构成推理过程的刚性边界。"
        "与传统企业关系图谱相比，该模型不仅描述"谁与谁有关联"，还进一步刻画了"
        ""风险因何发生、如何沿关系链传导、依据何种法规条款判断、由哪个主体承担治理责任"的完整证据链条。"
        "这一设计使得合规结论可以被逐项回溯至具体的图谱路径、数据来源和法规依据，为高风险AI系统的可审计性提供结构化支撑。"
    )

    if old_innovation1 in text:
        text = text.replace(old_innovation1, new_innovation1)
        print("  [图谱环境] 创新性部分增强成功")
    else:
        print("  [图谱环境] WARNING: 创新性锚点未找到")

    # 5.2 在技术路线中强化"图谱不是背景材料库"
    old_tech = (
        "知识图谱在该流程中不是背景材料库，而是承担事实检索、路径约束、法规映射和责任追溯四项功能的证据执行环境。"
    )
    new_tech = (
        "在整个技术流程中，知识图谱的角色从传统的"背景知识库"转变为智能体逻辑推理的底层执行环境："
        "（i）事实检索——所有实体和关系的存在性由图谱确认，不存在于图谱中的事实不能作为推理前提；"
        "（ii）路径约束——推理路径必须遵循图谱中实际存在的关系连接，杜绝"凭空联想"式推断；"
        "（iii）法规映射——每一项合规判断必须通过图谱中的法规节点得到具体条款支撑；"
        "（iv）责任追溯——图谱中记录的主体、事件、时间和数据来源构成完整的审计轨迹。"
        "大语言模型在此框架中负责语义理解、意图解析和自然语言生成，但其判定结论必须接受图谱证据的刚性约束，"
        "从而赋予系统在高风险合规场景中所必需的可解释性与可审计性。"
    )

    if old_tech in text:
        text = text.replace(old_tech, new_tech)
        print("  [图谱环境] 技术路线部分增强成功")
    else:
        print("  [图谱环境] WARNING: 技术路线锚点未找到")

    return text

# ========== 6. 增强M1-M4技术深度 ==========
def enhance_m1_m4_depth(text):
    """在第三大点中增加M1-M4的技术细节"""

    # 6.1 增强M1描述（在研究思路或研究方法中）
    old_m1 = (
        "用户输入治理问题后，M1感知与检索层完成实体识别、RAG证据召回和上下文初始化；"
    )
    new_m1 = (
        "用户输入治理问题后，M1感知与检索层并行执行三项任务："
        "（i）基于LLM与规则引擎混合策略的意图识别与实体抽取，从自然语言问题、上传文件和监管材料中锚定目标主体与风险事件类型；"
        "（ii）多源并行证据召回，同时检索深交所、北交所、上交所纪律处分与自律监管措施数据库、上市公司公告全文索引和法规条款库；"
        "（iii）实体对齐与消歧，通过精确匹配、别名匹配和模糊匹配的级联策略将抽取实体规范化为图谱中的标准标识符，"
        "并将全部召回材料写入统一的GovernanceContext以供后续层级消费。"
    )

    if old_m1 in text:
        text = text.replace(old_m1, new_m1)
        print("  [M1-M4] M1增强成功")
    else:
        print("  [M1-M4] WARNING: M1锚点未找到")

    # 6.2 增强M2描述
    old_m2 = (
        "M2图谱推理层基于Neo4j执行多跳Cypher查询、社区发现和风险路径枚举；"
    )
    new_m2 = (
        "M2图谱推理层作为"图上执行引擎"，不是简单地查询数据库返回关系列表，"
        "而是在Neo4j事理知识图谱上执行五项核心操作："
        "（i）一至五跳自适应穿透查询，根据风险关系白名单和路径长度约束动态扩展证据子图；"
        "（ii）风险社区发现，采用WCC连通分量、Louvain模块度优化和HGT-GKMeans图聚类算法自适应降级策略，"
        "识别风险主体所在的紧密群体、核心节点和桥接节点；"
        "（iii）风险传导路径枚举与评分，对每条候选路径计算多维度风险得分；"
        "（iv）路径解释生成，为高风险路径提供"主体→事件→特征→法规"的文本化解释链；"
        "（v）低置信路径标记，对于路径断裂、关系稀疏或证据不足的查询结果显式标记不确定性。"
    )

    if old_m2 in text:
        text = text.replace(old_m2, new_m2)
        print("  [M1-M4] M2增强成功")
    else:
        print("  [M1-M4] WARNING: M2锚点未找到")

    # 6.3 增强M3描述
    old_m3 = (
        "M3合规校验层将风险路径映射到法规条款和三级合规指标，形成客观评分与证据完整性判断；"
    )
    new_m3 = (
        "M3合规校验层负责将M2输出的发散式风险路径收敛为结构化的合规判断："
        "（i）路径—法规匹配，将每条风险路径中的事件类型和风险特征映射到对应的法规条款和监管规则，"
        "形成"路径→条款"的对应关系表；"
        "（ii）三级合规指标评分，分别从数据合规性（数据来源合法性、授权链条完整性）、"
        "算法合规性（模型行为可解释性、决策偏差控制）和内容合规性（生成内容真实性、适当性匹配）"
        "三个维度进行量化打分；"
        "（iii）证据完整性校验，通过EvidenceChain检查上述六个维度的证据覆盖情况，"
        "对证据不足或法规匹配强度低于阈值的结论显式标记为低置信度，触发后续的重检索或人工复核流程。"
    )

    if old_m3 in text:
        text = text.replace(old_m3, new_m3)
        print("  [M1-M4] M3增强成功")
    else:
        print("  [M1-M4] WARNING: M3锚点未找到")

    # 6.4 增强M4描述
    old_m4 = (
        "M4共识治理层对多智能体结论进行冲突检测、置信度聚合和分级处置，输出治理建议、责任主体清单和协同治理报告。"
    )
    new_m4 = (
        "M4共识治理层作为整个管线的"裁决与输出"环节，执行三项关键操作："
        "（i）多智能体结论冲突检测，识别不同分析路径产生的矛盾判断（如同一主体在不同路径中被赋予不同风险等级），"
        "并通过证据覆盖率加权投票进行消解；"
        "（ii）置信度聚合与分级处置，依据 $\\text{Conf}(y)$ 评分将结论分为高置信直接输出、中置信补充证据后输出、"
        "低置信触发人工复核（Human-in-the-loop）三个等级，实现从自动研判到人工干预的平滑过渡；"
        "（iii）治理报告生成，将图谱路径、法规依据、合规评分、责任主体分配和处理建议整合为结构化报告，"
        "支持Markdown、DOCX和PDF多格式导出，并通过SSE流式推送实时反馈给前端。"
    )

    if old_m4 in text:
        text = text.replace(old_m4, new_m4)
        print("  [M1-M4] M4增强成功")
    else:
        print("  [M1-M4] WARNING: M4锚点未找到")

    return text

# ========== 7. 第二大部分：强化GovernanceContext与四大模型 ==========
def enhance_governance_context(text):
    """在研究内容中增加GovernanceContext全局状态机描述"""

    # 在M1-M4总述后插入GovernanceContext描述
    anchor = "四个模块共享统一的GovernanceContext，围绕实体、子图、风险路径、法规条款、证据链、评分结果和治理建议持续流转，形成从证据输入到治理输出的闭环。"

    enhanced = (
        "四个模块共享统一的GovernanceContext——一个贯穿M1-M4全管线的全局状态结构体，"
        "承载实体集合、证据子图、候选风险路径、法规条款映射、证据链完整性检查结果、"
        "三级合规指标评分、多智能体共识评分 $\\text{Conf}(y)$ 以及最终治理建议。"
        "GovernanceContext不仅是数据传递的载体，更承担流程控制功能："
        "当某一层级输出的置信度低于预设阈值时，系统不直接向下传递不确定信息，"
        "而是触发回溯——M3发现证据不足时可请求M2补充检索，M4检测到多智能体结论冲突超过容忍度时可触发重新研判。"
        "这种基于置信度拦截的闭环机制使系统输出从"模型生成内容"转变为"受约束的证据驱动结论"，"
        "围绕实体、子图、风险路径、法规条款、证据链、评分结果和治理建议持续流转，形成从证据输入到治理输出的完整闭环。"
    )

    if anchor in text:
        text = text.replace(anchor, enhanced)
        print("  [GovernanceContext] 增强成功")
    else:
        print("  [GovernanceContext] WARNING: 锚点未找到")

    return text

# ========== 8. 增强"量化预期效果" ==========
def quantify_expected_effects(text):
    """在研究目标中增加量化预期效果的描述"""

    old = (
        "预期提升风险路径识别、法规匹配、证据覆盖和治理建议生成的可靠性，"
        "降低大模型在高风险合规场景中的事实幻觉、结构幻觉和错误级联风险。"
    )
    new = (
        "预期在以下维度产生可测量的改进：风险路径识别方面，通过1-5跳自适应穿透查询与关系白名单约束，"
        "将路径完整性（Path Recall）提升至可比基线以上；法规匹配方面，"
        "通过路径—法规显式映射将条款引用准确率提升至可比基线以上；"
        "证据覆盖方面，通过EvidenceChain六维约束使每条合规结论具备可回溯的完整证据链条；"
        "幻觉控制方面，通过图谱刚性约束与置信度拦截机制，"
        "系统性降低大模型在高风险合规场景中的事实幻觉（Factual Hallucination）、"
        "结构幻觉（Structural Hallucination）和错误级联（Error Cascade）风险。"
    )

    if old in text:
        text = text.replace(old, new)
        print("  [量化效果] 增强成功")
    else:
        print("  [量化效果] WARNING: 锚点未找到")

    return text

# ========== 主流程 ==========
def main():
    print("=" * 60)
    print("研究项目申报书深度润色")
    print("=" * 60)

    text = read_file()
    original_len = len(text)

    print("\n1. 全文去AI化...")
    text = de_ai_short_summaries(text)

    print("\n2. 调整DRA-MA课程论文引用...")
    text = adjust_dra_ma_citation(text)

    print("\n3. 公式转换为LaTeX格式...")
    text = latex_formulas(text)

    print("\n4. 引入EvidenceChain形式化定义...")
    text = insert_evidence_chain_definition(text)

    print("\n5. 增强'图谱即执行环境'概念...")
    text = enhance_graph_environment_concept(text)

    print("\n6. 增强M1-M4技术深度...")
    text = enhance_m1_m4_depth(text)

    print("\n7. 强化GovernanceContext与四大模型...")
    text = enhance_governance_context(text)

    print("\n8. 量化预期效果...")
    text = quantify_expected_effects(text)

    write_file(text)

    delta = len(text) - original_len
    print(f"\n{'=' * 60}")
    print(f"润色完成。文件大小变化: {original_len} → {len(text)} 字符 ({delta:+d})")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    main()
