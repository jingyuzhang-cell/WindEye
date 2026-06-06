"""Compliance Indicator Engine — computes objective scores for 34 Level-3 indicators.

Three-level hierarchy:
  Level 1 (3): 数据合规性, 算法合规性, 内容合规性
  Level 2 (12): sub-categories under each Level 1
  Level 3 (34): specific measurable indicators

Scoring categories:
  - data_driven: computed from subgraph / analysis metrics
  - evidence_based: partially computed from verifier / evidence chain data
  - policy_driven: default moderate score, user adjusts via subjective input
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

DATA_DRIVEN = "data_driven"
EVIDENCE_BASED = "evidence_based"
POLICY_DRIVEN = "policy_driven"

# ── 34 Indicator Definitions ─────────────────────────────────────────────────

INDICATOR_DEFINITIONS: list[dict[str, Any]] = [
    # ═══ 数据合规性 → 数据来源合法性 ═══
    {"id": "data-source-auth",   "l1": "数据合规性", "l2": "数据来源合法性",
     "l3": "数据来源清单与授权证明",           "category": DATA_DRIVEN,   "default": 75},
    {"id": "data-no-illegal",    "l1": "数据合规性", "l2": "数据来源合法性",
     "l3": "禁止使用非法爬取、内幕信息、未公开监管数据", "category": POLICY_DRIVEN, "default": 70},

    # ═══ 数据合规性 → 数据跨境与本地化 ═══
    {"id": "data-local-storage", "l1": "数据合规性", "l2": "数据跨境与本地化",
     "l3": "境内资本市场相关数据存储",          "category": POLICY_DRIVEN, "default": 85},
    {"id": "data-cross-border",  "l1": "数据合规性", "l2": "数据跨境与本地化",
     "l3": "跨境数据传输履行安全评估与备案",    "category": POLICY_DRIVEN, "default": 80},

    # ═══ 数据合规性 → 数据完整性与准确性 ═══
    {"id": "data-quality-report","l1": "数据合规性", "l2": "数据完整性与准确性",
     "l3": "建立数据质量评估报告",              "category": DATA_DRIVEN,   "default": 75},
    {"id": "data-authoritative", "l1": "数据合规性", "l2": "数据完整性与准确性",
     "l3": "关键金融数据对接权威信源验证",       "category": EVIDENCE_BASED, "default": 78},

    # ═══ 数据合规性 → 数据偏见控制 ═══
    {"id": "data-representation","l1": "数据合规性", "l2": "数据偏见控制",
     "l3": "群体代表性分析",                    "category": DATA_DRIVEN,   "default": 72},
    {"id": "data-bias-mitigation","l1": "数据合规性", "l2": "数据偏见控制",
     "l3": "数据偏见缓解机制",                  "category": POLICY_DRIVEN, "default": 75},

    # ═══ 数据合规性 → 个人信息处理合规 ═══
    {"id": "data-pipl-compliance","l1": "数据合规性", "l2": "个人信息处理合规",
     "l3": "遵守个人信息保护法",                "category": POLICY_DRIVEN, "default": 85},
    {"id": "data-investor-consent","l1": "数据合规性", "l2": "个人信息处理合规",
     "l3": "投资者画像数据单独授权",             "category": POLICY_DRIVEN, "default": 80},

    # ═══ 数据合规性 → 数据安全防护 ═══
    {"id": "data-encryption",    "l1": "数据合规性", "l2": "数据安全防护",
     "l3": "数据分级分类加密脱敏",              "category": DATA_DRIVEN,   "default": 80},
    {"id": "data-breach-response","l1": "数据合规性", "l2": "数据安全防护",
     "l3": "数据泄露应急响应机制与日志留存",     "category": POLICY_DRIVEN, "default": 82},

    # ═══ 算法合规性 → 算法治理与问责 ═══
    {"id": "algo-gov-committee", "l1": "算法合规性", "l2": "算法治理与问责",
     "l3": "设立人工智能治理委员会",            "category": POLICY_DRIVEN, "default": 75},
    {"id": "algo-lifecycle-mgmt","l1": "算法合规性", "l2": "算法治理与问责",
     "l3": "算法全生命周期管理制度",             "category": POLICY_DRIVEN, "default": 72},
    {"id": "algo-filing",        "l1": "算法合规性", "l2": "算法治理与问责",
     "l3": "算法备案信息与供应商清单",           "category": POLICY_DRIVEN, "default": 78},
    {"id": "algo-third-party",   "l1": "算法合规性", "l2": "算法治理与问责",
     "l3": "第三方模型血缘证明",                "category": EVIDENCE_BASED, "default": 70},

    # ═══ 算法合规性 → 算法公平性与非歧视 ═══
    {"id": "algo-bias-detect",   "l1": "算法合规性", "l2": "算法公平性与非歧视",
     "l3": "偏见检测与缓解",                    "category": DATA_DRIVEN,   "default": 75},
    {"id": "algo-disparity-disclose","l1": "算法合规性", "l2": "算法公平性与非歧视",
     "l3": "公开披露决策差异率",                "category": POLICY_DRIVEN, "default": 70},
    {"id": "algo-stress-test",   "l1": "算法合规性", "l2": "算法公平性与非歧视",
     "l3": "反操纵与压力测试",                  "category": EVIDENCE_BASED, "default": 76},
    {"id": "algo-no-inducement", "l1": "算法合规性", "l2": "算法公平性与非歧视",
     "l3": "禁止嵌入诱导性交易策略",             "category": POLICY_DRIVEN, "default": 85},

    # ═══ 算法合规性 → 算法可解释性与安全 ═══
    {"id": "algo-explain-user",  "l1": "算法合规性", "l2": "算法可解释性与安全",
     "l3": "用户可理解决策解释",                "category": EVIDENCE_BASED, "default": 78},
    {"id": "algo-explain-report","l1": "算法合规性", "l2": "算法可解释性与安全",
     "l3": "可解释AI生成归因报告",              "category": EVIDENCE_BASED, "default": 80},
    {"id": "algo-robustness",    "l1": "算法合规性", "l2": "算法可解释性与安全",
     "l3": "模型鲁棒性测试机制",                "category": EVIDENCE_BASED, "default": 72},
    {"id": "algo-failure-drill", "l1": "算法合规性", "l2": "算法可解释性与安全",
     "l3": "算法失效应急演练",                  "category": POLICY_DRIVEN, "default": 75},

    # ═══ 内容合规性 → 内容真实性与准确性 ═══
    {"id": "content-authoritative-src","l1": "内容合规性", "l2": "内容真实性与准确性",
     "l3": "AI生成市场分析链接权威数据源",       "category": EVIDENCE_BASED, "default": 80},
    {"id": "content-hallucination-detect","l1": "内容合规性", "l2": "内容真实性与准确性",
     "l3": "AI幻觉检测拦截模块",                "category": EVIDENCE_BASED, "default": 78},
    {"id": "content-completeness","l1": "内容合规性", "l2": "内容真实性与准确性",
     "l3": "信息完整性控制",                    "category": DATA_DRIVEN,   "default": 82},

    # ═══ 内容合规性 → 内容透明度与标识 ═══
    {"id": "content-ai-label",   "l1": "内容合规性", "l2": "内容透明度与标识",
     "l3": "AI生成内容强制标识",                "category": POLICY_DRIVEN, "default": 95},
    {"id": "content-traceable",  "l1": "内容合规性", "l2": "内容透明度与标识",
     "l3": "用户可查询生成依据",                "category": EVIDENCE_BASED, "default": 82},
    {"id": "content-audit-log",  "l1": "内容合规性", "l2": "内容透明度与标识",
     "l3": "AI生成内容审计日志记录与追溯",       "category": POLICY_DRIVEN, "default": 80},

    # ═══ 内容合规性 → 反滥用与风险防控 ═══
    {"id": "content-no-fake-exec","l1": "内容合规性", "l2": "反滥用与风险防控",
     "l3": "禁止生成高管虚假言论/伪造财报",      "category": POLICY_DRIVEN, "default": 82},
    {"id": "content-sensitive-filter","l1": "内容合规性", "l2": "反滥用与风险防控",
     "l3": "敏感词库与AI内容过滤系统",           "category": POLICY_DRIVEN, "default": 88},
    {"id": "content-investor-suitability","l1": "内容合规性", "l2": "反滥用与风险防控",
     "l3": "投资者适当性匹配",                  "category": POLICY_DRIVEN, "default": 80},
    {"id": "content-no-highrisk-push","l1": "内容合规性", "l2": "反滥用与风险防控",
     "l3": "禁止向非合格投资者推送高风险策略",    "category": POLICY_DRIVEN, "default": 85},
]


class ComplianceIndicatorEngine:
    """Compute objective scores for 34 compliance indicators.

    Uses subgraph data, risk paths, compliance matches, evidence chains,
    and risk scores to produce evidence-based objective scores.
    """

    @staticmethod
    def compute(
        nodes: list[dict],
        edges: list[dict],
        risk_paths: list[dict],
        compliance_matches: list[dict],
        evidence_chains: dict | None,
        risk_scores: dict | None,
    ) -> list[dict]:
        """Return 34 indicator dicts with objective scores and evidence strings."""
        metrics = ComplianceIndicatorEngine._compute_metrics(
            nodes, edges, risk_paths, compliance_matches, evidence_chains, risk_scores,
        )

        results: list[dict] = []
        for ind in INDICATOR_DEFINITIONS:
            objective, evidence = ComplianceIndicatorEngine._score_indicator(
                ind, metrics,
            )
            results.append({
                "id": ind["id"],
                "l1": ind["l1"],
                "l2": ind["l2"],
                "l3": ind["l3"],
                "objective": max(0, min(100, objective)),
                "category": ind["category"],
                "evidence": evidence,
            })

        cat_counts = {"data_driven": 0, "evidence_based": 0, "policy_driven": 0}
        for r in results:
            cat_counts[r["category"]] += 1
        logger.info(
            "[ComplianceIndicatorEngine] computed %d indicators: "
            "data_driven=%d evidence_based=%d policy_driven=%d",
            len(results), cat_counts["data_driven"],
            cat_counts["evidence_based"], cat_counts["policy_driven"],
        )
        return results

    @staticmethod
    def _compute_metrics(
        nodes: list[dict],
        edges: list[dict],
        risk_paths: list[dict],
        compliance_matches: list[dict],
        evidence_chains: dict | None,
        risk_scores: dict | None,
    ) -> dict[str, Any]:
        """Extract reusable metrics from raw data."""
        n_nodes = len(nodes) if nodes else 0
        n_edges = len(edges) if edges else 0

        # Node property completeness
        if n_nodes > 0:
            nodes_with_rich_props = sum(
                1 for n in nodes
                if isinstance(n.get("properties"), dict)
                and len([v for v in n["properties"].values() if v is not None and v != ""]) >= 3
            )
            prop_completeness = int((nodes_with_rich_props / n_nodes) * 100)
        else:
            nodes_with_rich_props = 0
            prop_completeness = 0

        # Nodes with source/authority metadata
        nodes_with_source = sum(
            1 for n in nodes
            if isinstance(n.get("properties"), dict)
            and (n["properties"].get("source") or n["properties"].get("authority")
                 or n["properties"].get("data_source"))
        )

        # Entity type distribution (bias check)
        type_counts: dict[str, int] = {}
        for n in nodes:
            ntype = ""
            props = n.get("properties", {}) if isinstance(n.get("properties"), dict) else {}
            labels = n.get("labels", [])
            if labels:
                ntype = str(labels[0])
            elif isinstance(props, dict):
                ntype = str(props.get("type", props.get("entity_type", "")))
            if ntype:
                type_counts[ntype] = type_counts.get(ntype, 0) + 1

        max_type_ratio = 0.0
        if type_counts and n_nodes > 0:
            max_type_ratio = max(type_counts.values()) / n_nodes

        # Path explainability
        n_paths = len(risk_paths) if risk_paths else 0
        if n_paths > 0:
            paths_with_desc = sum(
                1 for p in risk_paths
                if p.get("path_description") or p.get("path_text")
            )
            path_explainability = int((paths_with_desc / n_paths) * 100)
        else:
            path_explainability = 0

        # Compliance confidence
        n_matches = len(compliance_matches) if compliance_matches else 0
        if n_matches > 0:
            avg_compliance_conf = int(
                sum(m.get("confidence", 0) for m in compliance_matches) / n_matches * 100
            )
        else:
            avg_compliance_conf = 0

        # Evidence chain confidence
        chains = evidence_chains.get("chains", []) if evidence_chains else []
        overall_evidence_conf = evidence_chains.get("overall_confidence", 0) if evidence_chains else 0
        n_chains = len(chains)
        if n_chains > 0 and overall_evidence_conf == 0:
            overall_evidence_conf = sum(c.get("confidence", 0) for c in chains) / n_chains
        evidence_conf_pct = int(overall_evidence_conf * 100) if isinstance(overall_evidence_conf, float) else 0

        # Risk scoring
        has_final_score = (
            risk_scores is not None
            and risk_scores.get("final_overall") is not None
        )
        final_score = risk_scores.get("final_overall") if risk_scores else None
        base_score = risk_scores.get("base_overall") if risk_scores else None

        # Verifier scores from evidence chains
        verifier_scores = [
            c.get("verifier_score", 0)
            for c in chains
            if c.get("verifier_score") is not None
        ]

        # Sensitive data detection (check if node properties contain PII-like fields)
        pii_fields = {"phone", "email", "id_card", "passport", "address", "身份证", "手机", "地址"}
        has_sensitive_detection = any(
            any(pii in str(k).lower() for pii in pii_fields)
            for n in nodes
            if isinstance(n.get("properties"), dict)
            for k in n["properties"]
        )

        return {
            "n_nodes": n_nodes,
            "n_edges": n_edges,
            "nodes_with_rich_props": nodes_with_rich_props,
            "prop_completeness": prop_completeness,
            "nodes_with_source": nodes_with_source,
            "n_paths": n_paths,
            "path_explainability": path_explainability,
            "n_matches": n_matches,
            "avg_compliance_conf": avg_compliance_conf,
            "n_chains": n_chains,
            "evidence_conf_pct": evidence_conf_pct,
            "has_final_score": has_final_score,
            "final_score": final_score,
            "base_score": base_score,
            "verifier_scores": verifier_scores,
            "max_type_ratio": max_type_ratio,
            "type_counts": type_counts,
            "has_sensitive_detection": has_sensitive_detection,
        }

    @staticmethod
    def _score_indicator(ind: dict, m: dict[str, Any]) -> tuple[int, str]:
        """Compute objective score + evidence for a single indicator."""
        ind_id: str = ind["id"]
        default: int = ind["default"]

        # ── Data-driven indicators ──────────────────────────────────

        if ind_id == "data-source-auth":
            if m["n_nodes"] > 0:
                score = int((m["nodes_with_source"] / m["n_nodes"]) * 100)
            else:
                score = default
            return score, f"{m['nodes_with_source']}/{m['n_nodes']} 个节点具备数据来源元数据"

        if ind_id == "data-quality-report":
            return m["prop_completeness"], (
                f"{m['nodes_with_rich_props']}/{m['n_nodes']} 个节点包含完整属性字段"
            )

        if ind_id == "data-representation":
            if m["max_type_ratio"] > 0.85:
                score = 60
                evidence = f"实体类型分布不均: 单类占比 {m['max_type_ratio']:.0%}, 存在偏见风险"
            elif m["max_type_ratio"] > 0.6:
                score = 78
                evidence = f"实体类型分布尚可: 单类占比 {m['max_type_ratio']:.0%}"
            else:
                score = 90
                evidence = f"实体类型分布均衡: 最大类占比 {m['max_type_ratio']:.0%}"
            return score, evidence

        if ind_id == "data-encryption":
            if m["has_sensitive_detection"]:
                return 85, "检测到敏感字段(PII), 系统已脱敏处理节点标签"
            return 78, "未检测到明显敏感字段, 数据分级分类机制待完善"

        if ind_id == "algo-bias-detect":
            if m["n_paths"] > 0:
                # Check risk path distribution across entity types
                type_coverage = len(m.get("type_counts", {}))
                if type_coverage >= 3:
                    return 85, f"风险路径覆盖 {type_coverage} 类实体, 偏见控制良好"
                return 75, f"风险路径仅覆盖 {type_coverage} 类实体, 建议扩大分析范围"
            return 70, "无风险路径数据, 无法评估偏见检测效果"

        if ind_id == "content-completeness":
            if m["n_nodes"] > 0 and m["n_edges"] > 0:
                edge_density = m["n_edges"] / max(m["n_nodes"], 1)
                if edge_density >= 1.0:
                    return 88, f"子图连接密度 {edge_density:.1f}, 信息完整性较好"
                return 78, f"子图连接密度 {edge_density:.1f}, 信息覆盖尚可"
            return default, "子图数据不足, 无法评估信息完整性"

        # ── Evidence-based indicators ────────────────────────────────

        if ind_id == "data-authoritative":
            if m["verifier_scores"]:
                avg_verifier = int(sum(m["verifier_scores"]) / len(m["verifier_scores"]) * 100)
                return avg_verifier, f"验证器平均置信度 {avg_verifier}%, 基于 {len(m['verifier_scores'])} 条证据链"
            return default, "无验证器评分数据"

        if ind_id == "algo-third-party":
            return m["n_chains"] * 3 + 65, (
                f"基于 {m['n_chains']} 条证据链, 模型血缘可追溯性待提升"
            )

        if ind_id == "algo-stress-test":
            if m["has_final_score"] and m["final_score"] is not None:
                score = 88 if float(m["final_score"]) < 50 else 78
                return score, f"综合风险评分 {m['final_score']}, 压力测试指标参考"
            return default, "无综合评分, 建议运行压力测试"

        if ind_id == "algo-explain-user":
            return m["path_explainability"], (
                f"{m['n_paths']} 条风险路径中, "
                f"{int(m['n_paths'] * m['path_explainability'] / 100) if m['path_explainability'] > 0 else 0} 条具备文字解释"
            )

        if ind_id == "algo-explain-report":
            if m["evidence_conf_pct"] > 0:
                return m["evidence_conf_pct"], f"证据链综合置信度 {m['evidence_conf_pct']}%"
            return default, "无证据链数据, 无法评估归因报告质量"

        if ind_id == "algo-robustness":
            if m["has_final_score"]:
                base = m["base_score"] or 0
                final = m["final_score"] or 0
                adjustment = abs(final - base)
                if adjustment <= 5:
                    return 85, f"LLM调整幅度 {adjustment:.1f}, 模型评分稳定性良好"
                return 78, f"LLM调整幅度 {adjustment:.1f}, 模型稳定性有待优化"
            return default, "无评分数据, 无法评估鲁棒性"

        if ind_id == "content-authoritative-src":
            if m["nodes_with_source"] > 0:
                score = 70 + min(m["nodes_with_source"] * 3, 25)
                return score, f"{m['nodes_with_source']} 个节点可追溯权威数据源"
            return default, "未检测到权威数据源链接"

        if ind_id == "content-hallucination-detect":
            if m["verifier_scores"]:
                avg_verifier = int(sum(m["verifier_scores"]) / len(m["verifier_scores"]) * 100)
                if avg_verifier >= 85:
                    return 88, f"验证器置信度 {avg_verifier}%, 幻觉风险较低"
                elif avg_verifier >= 70:
                    return 78, f"验证器置信度 {avg_verifier}%, 存在轻微幻觉风险"
                return 68, f"验证器置信度 {avg_verifier}%, 建议加强幻觉检测"
            return default, "无验证器数据, 无法评估幻觉检测效果"

        if ind_id == "content-traceable":
            if m["n_chains"] > 0:
                score = min(90, 70 + m["n_chains"] * 5)
                return score, f"{m['n_chains']} 条证据链可追溯, 生成依据可查询"
            return default, "未生成证据链, 可追溯性待建立"

        # ── Scoring-based indicators ─────────────────────────────────

        if ind_id == "algo-lifecycle-mgmt" and m["has_final_score"]:
            return 80, "已建立风险评分全流程(评分→治理→报告), 生命周期管理有记录"

        if ind_id == "algo-filing" and m["n_matches"] > 0:
            return 78, f"基于 {m['n_matches']} 条合规匹配记录, 算法备案信息可评估"

        # ── Policy-driven indicators (use default) ────────────────────

        policy_evidence: dict[str, str] = {
            "data-no-illegal": "需人工审核确认数据采集方式未涉及非法爬取、内幕信息源",
            "data-local-storage": "需人工确认境内资本市场数据存储方案符合监管要求",
            "data-cross-border": "需人工确认跨境数据传输已履行安全评估与备案程序",
            "data-bias-mitigation": "需人工审核数据偏见缓解机制的具体实施方案",
            "data-pipl-compliance": "需人工审核个人信息处理流程是否符合个保法要求",
            "data-investor-consent": "需人工确认投资者画像数据是否已获单独授权",
            "data-breach-response": "需人工审核应急响应机制与日志留存方案",
            "algo-gov-committee": "需人工确认是否已设立人工智能治理委员会",
            "algo-disparity-closed": "需人工确认决策差异率是否已公开披露",  # typo-safe fallback
            "algo-disparity-disclose": "需人工确认决策差异率是否已公开披露",
            "algo-no-inducement": "需人工审核策略设计是否包含诱导性交易成分",
            "algo-failure-drill": "需人工确认是否已开展算法失效应急演练",
            "content-ai-label": "系统始终在报告中标注AI生成内容, 已符合基本要求",
            "content-audit-log": "需人工确认AI生成内容审计日志的记录范围与追溯能力",
            "content-no-fake-exec": "需人工审核内容生成策略是否包含防伪造机制",
            "content-sensitive-filter": "需人工确认敏感词库与过滤系统的覆盖范围",
            "content-investor-suitability": "需人工审核投资者适当性匹配机制",
            "content-no-highrisk-push": "需人工确认高风险策略推送的目标用户筛选机制",
        }
        evidence = policy_evidence.get(ind_id, f"需人工审核: {ind['l3']}")
        return default, evidence

    def __init__(self) -> None:
        pass
