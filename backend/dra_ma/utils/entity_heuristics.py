"""Entity type inference from node names — shared by normalization and analytics."""

import re


def infer_entity_type_from_name(name: str) -> str:
    """Infer entity type from node name heuristics when no explicit type exists.

    Returns canonical type string matching frontend VALID_NODE_TYPES, or "" if uncertain.
    """
    if not name or not isinstance(name, str):
        return ""

    # COMPANY: Chinese company suffix patterns
    if re.search(
        r"公司|集团|有限|股份|实业|科技|投资|控股|银行|基金|证券|保险|信托|租赁|保理|资本|产业",
        name,
    ):
        return "COMPANY"
    # COMPANY: English legal suffix
    if re.search(r"\b(CO|LTD|INC|CORP|LLC)\b", name, re.IGNORECASE):
        return "COMPANY"

    # PERSON: title suffix
    if re.search(
        r"律师|法官|董事长|总经理|法定代表人|股东|监事|董事|经理|主任|行长|总裁",
        name,
    ):
        return "PERSON"
    # PERSON: 2-4 char pure Chinese name (weak signal but necessary)
    if re.match(r"^[一-鿿]{2,4}$", name):
        if not re.search(r"公司|事件|风险|法|条例|规定|集团|有限|银行|基金", name):
            return "PERSON"

    # EVENT
    if re.search(
        r"事件|事故|案件|诉讼|处罚|仲裁|纠纷|争议|违约|违规|违法|资金占用|冻结|判决|裁定",
        name,
    ):
        return "EVENT"

    # RiskFactor / RiskFeature
    if re.search(r"风险|因子|指标|预警|异常|波动|信号|征兆", name):
        return "RiskFactor"

    # Regulation
    if re.search(
        r"法$|条例$|办法$|规定$|通知$|意见$|细则$|规则$|指引$|制度$",
        name,
    ):
        return "Regulation"

    return ""
