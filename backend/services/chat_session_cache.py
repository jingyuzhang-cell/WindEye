"""
Chat session cache backed by Redis.

Stores lightweight session data (messages without graphData / workspaceState).
Falls back gracefully when Redis is disabled.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from core.redis_client import cache_get, cache_set, cache_delete, cache_set_json, cache_get_json

logger = logging.getLogger("services.chat_session_cache")

SESSION_PREFIX = "windeye:chat:session:"
SESSION_TTL = 7 * 86400  # 7 days


def _session_key(session_id: str) -> str:
    return f"{SESSION_PREFIX}{session_id}"


def get_session(session_id: str) -> dict | None:
    """Retrieve a chat session from Redis. Returns None on miss."""
    return cache_get_json(_session_key(session_id))


def set_session(session_id: str, data: dict) -> bool:
    """Store a chat session in Redis with TTL."""
    data["_updatedAt"] = int(time.time())
    return cache_set_json(_session_key(session_id), data, SESSION_TTL)


def delete_session(session_id: str) -> bool:
    """Remove a chat session from Redis."""
    return cache_delete(_session_key(session_id))


def append_message(session_id: str, message: dict) -> dict | None:
    """Append a light message to an existing session. Returns updated session or None."""
    session = get_session(session_id)
    if session is None:
        session = {"id": session_id, "messages": [], "title": "新会话"}
    messages: list = session.get("messages", [])
    messages.append(message)
    # Trim old messages
    if len(messages) > 50:
        session["messages"] = messages[-50:]
    set_session(session_id, session)
    return session
