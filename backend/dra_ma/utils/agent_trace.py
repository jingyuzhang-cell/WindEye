"""统一 Agent 决策日志 — 可审计的结构化 trace，支持脱敏和长度控制。"""

import json
import logging
import os
from typing import Any

logger = logging.getLogger("dra_ma.agent_trace")

TRACE_AGENTS = os.getenv("WINDEYE_TRACE_AGENTS", "true").lower() == "true"

SENSITIVE_KEYS = {
    "api_key", "authorization", "password", "token", "secret",
    "file_content", "prompt", "system_prompt", "user_prompt",
}

MAX_LIST_ITEMS = 20
MAX_STR_LEN = 1000
MAX_PAYLOAD_LEN = 4000


def _sanitize(obj: Any) -> Any:
    """脱敏敏感字段 + 截断长字符串。"""
    if isinstance(obj, dict):
        return {
            k: ("<redacted>" if k.lower() in SENSITIVE_KEYS else _sanitize(v))
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_sanitize(x) for x in obj[:MAX_LIST_ITEMS]]
    if isinstance(obj, str):
        return obj[:MAX_STR_LEN]
    return obj


def agent_trace(agent: str, step: str, **payload: Any) -> None:
    """打印结构化 Agent 决策日志。

    Args:
        agent: Agent 名称，如 "IntentAgent"、"RiskScoringPlugin"
        step: 步骤标签，如 "START"、"DECISION"、"RESULT"、"ERROR"
        **payload: 决策上下文（自动脱敏 + 截断）
    """
    if not TRACE_AGENTS:
        return

    sanitized = _sanitize(payload)
    try:
        data = json.dumps(sanitized, ensure_ascii=False, default=str)[:MAX_PAYLOAD_LEN]
    except Exception:
        data = str(sanitized)[:MAX_PAYLOAD_LEN]

    logger.warning("[AgentTrace][%s][%s] %s", agent, step, data)
