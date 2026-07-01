# -*- coding: utf-8 -*-
"""
Steps 6-8: Graph environment, GovernanceContext, quantified effects
"""
from pathlib import Path

with open(r'D:\Code\WindEye\docs\paper_draft.md', 'r', encoding='utf-8') as f:
    text = f.read()

# Step 6a: Enhance innovation section
# Find the innovation paragraph about event graph modeling
old_innov_start = "事理图谱驱动的穿透式合规建模"  # 事理图谱驱动的穿透式合规建模
idx = text.find(old_innov_start)
if idx >= 0:
    # Find the end of this paragraph - it spans until the next innovation point
    end_marker = "M1-M4多智能体协同治理机制"  # M1-M4多智能体协同治理机制
    end_idx = text.find(end_marker, idx)
    if end_idx > idx:
        old_para = text[idx:end_idx]
        new_para = (
            "事理图谱驱动的穿透式合规建模。"  # 事理图谱驱动的穿透式合规建模。
            "项目将资本市场AI应用治理对象抽象为主体层、事件层、特征层、法规层四层事理结构，"
            "使企业主体、风险事件、算法风险、法规条款和治理动作能够在同一图谱中表达。"
            "在本框架中，事理图谱并非仅作为静态知识库供检索，而是承担事实检索、路径约束、法规映射和责任追溯四项功能的"
            "可计算证据执行环境：智能体在图谱之上执行多跳推理，图谱中的节点、关系和属性构成推理过程的刚性边界。"
            "与传统企业关系图谱相比，该模型不仅描述谁与谁有关联，还进一步刻画了"
            "风险因何发生、如何沿关系链传导、依据何种法规条款判断、由哪个主体承担治理责任的完整证据链条。"
            "这一设计使得合规结论可以被逐项回溯至具体的图谱路径、数据来源和法规依据，为高风险AI系统的可审计性提供结构化支撑。"
        )
        text = text.replace(old_para, new_para)
        print(f'Step 6a [OK] Innovation enhanced ({len(old_para)} -> {len(new_para)} chars)')
    else:
        print('Step 6a [MISS] End marker not found')
else:
    print('Step 6a [MISS] Innovation start not found')

# Step 7: Enhance GovernanceContext
anchor_gc = (
    "四个模块共享统一的GovernanceContext，"
    "围绕实体、子图、风险路径、法规条款、证据链、评分结果和治理建议持续流转，"
    "形成从证据输入到治理输出的闭环。"
)

new_gc = (
    "四个模块共享统一的GovernanceContext——一个贯穿M1-M4全管线的全局状态结构体，"
    "承载实体集合、证据子图、候选风险路径、法规条款映射、证据链完整性检查结果、"
    "三级合规指标评分、多智能体共识评分以及最终治理建议。"
    "GovernanceContext不仅是数据传递的载体，更承担流程控制功能："
    "当某一层级输出的置信度低于预设阈值时，系统不直接向下传递不确定信息，"
    "而是触发回溯——M3发现证据不足时可请求M2补充检索，M4检测到多智能体结论冲突超过容忍度时可触发重新研判。"
    "这种基于置信度拦截的闭环机制使系统输出从模型生成内容转变为受约束的证据驱动结论，"
    "围绕实体、子图、风险路径、法规条款、证据链、评分结果和治理建议持续流转，"
    "形成从证据输入到治理输出的完整闭环。"
)

if anchor_gc in text:
    text = text.replace(anchor_gc, new_gc)
    print('Step 7 [OK] GovernanceContext enhanced')
else:
    print('Step 7 [MISS] GovernanceContext anchor')
    # Debug: find similar text
    search = "四个模块共享统一的GovernanceContext"
    idx = text.find(search)
    if idx >= 0:
        print(f'  Found at {idx}: {text[idx:idx+60]}')
    else:
        print('  Completely not found')

# Step 8: Quantify expected effects
old_effects = (
    "预期提升风险路径识别、法规匹配、证据覆盖和治理建议生成的可靠性，"
    "降低大模型在高风险合规场景中的事实幻觉、结构幻觉和错误级联风险。"
)

new_effects = (
    "预期在以下维度产生可测量的改进：风险路径识别方面，通过一至五跳自适应穿透查询与关系白名单约束，"
    "将路径完整性（Path Recall）提升至可比基线以上；法规匹配方面，"
    "通过路径与法规的显式映射将条款引用准确率提升至可比基线以上；"
    "证据覆盖方面，通过EvidenceChain六维约束使每条合规结论具备可回溯的完整证据链条；"
    "幻觉控制方面，通过图谱刚性约束与置信度拦截机制，"
    "系统性降低大模型在高风险合规场景中的事实幻觉（Factual Hallucination）、"
    "结构幻觉（Structural Hallucination）和错误级联（Error Cascade）风险。"
)

if old_effects in text:
    text = text.replace(old_effects, new_effects)
    print('Step 8 [OK] Effects quantified')
else:
    print('Step 8 [MISS] Effects anchor')

# Step 6b: Technical route enhancement
old_tech = (
    "知识图谱在该流程中不是背景材料库，"
    "而是承担事实检索、路径约束、法规映射和责任追溯四项功能的证据执行环境。"
)

new_tech = (
    "在整个技术流程中，知识图谱的角色从传统的背景知识库转变为智能体逻辑推理的底层执行环境："
    "（i）事实检索——所有实体和关系的存在性由图谱确认，不存在于图谱中的事实不能作为推理前提；"
    "（ii）路径约束——推理路径必须遵循图谱中实际存在的关系连接，杜绝凭空联想式推断；"
    "（iii）法规映射——每一项合规判断必须通过图谱中的法规节点得到具体条款支撑；"
    "（iv）责任追溯——图谱中记录的主体、事件、时间和数据来源构成完整的审计轨迹。"
    "大语言模型在此框架中负责语义理解、意图解析和自然语言生成，但其判定结论必须接受图谱证据的刚性约束，"
    "从而赋予系统在高风险合规场景中所必需的可解释性与可审计性。"
)

if old_tech in text:
    text = text.replace(old_tech, new_tech)
    print('Step 6b [OK] Technical route enhanced')
else:
    print('Step 6b [MISS] Technical route anchor')

with open(r'D:\Code\WindEye\docs\paper_draft.md', 'w', encoding='utf-8') as f:
    f.write(text)
print(f'File saved: {len(text)} chars')
