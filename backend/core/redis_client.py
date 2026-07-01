"""
Unified Redis client for WindEye.

Provides sync + async access with graceful degradation when REDIS_ENABLED=false.
All operations return None / False on failure rather than raising exceptions.

Environment:
    REDIS_ENABLED  — "true" to enable (default: false)
    REDIS_HOST     — host (default: localhost)
    REDIS_PORT     — port (default: 6379)
    REDIS_DB       — db index (default: 0)
    REDIS_PASSWORD — optional password
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger("core.redis")

REDIS_ENABLED = os.getenv("REDIS_ENABLED", "false").lower() == "true"
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")

# ── Sync client (lazy-init) ──────────────────────────────────────────
_sync_client: Any = None


def _build_sync_client():
    """Create a new sync Redis connection."""
    import redis
    return redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        password=REDIS_PASSWORD or None,
        decode_responses=True,
        socket_connect_timeout=1.0,
        socket_timeout=2.0,
    )


def get_redis() -> Any:
    """Return sync Redis client, or ``False`` / ``None`` when disabled / unhealthy."""
    global _sync_client
    if not REDIS_ENABLED:
        return False
    if _sync_client is not None:
        return _sync_client
    try:
        client = _build_sync_client()
        client.ping()
        _sync_client = client
        logger.info("Redis connected %s:%d db=%d", REDIS_HOST, REDIS_PORT, REDIS_DB)
        return _sync_client
    except Exception as exc:
        logger.warning("Redis unavailable: %s", exc)
        _sync_client = False
        return False


def redis_healthy() -> bool:
    """Check whether Redis is connected and responsive."""
    r = get_redis()
    if not r:
        return False
    try:
        return r.ping()
    except Exception:
        return False


# ── Async client (lazy-init) ─────────────────────────────────────────
_async_client: Any = None


async def get_async_redis() -> Any:
    """Return async Redis client (``redis.asyncio.Redis``), or ``False``."""
    global _async_client
    if not REDIS_ENABLED:
        return False
    if _async_client is not None:
        return _async_client
    try:
        from redis.asyncio import Redis
        client = Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            db=REDIS_DB,
            password=REDIS_PASSWORD or None,
            decode_responses=True,
            socket_connect_timeout=1.0,
            socket_timeout=2.0,
        )
        await client.ping()
        _async_client = client
        return _async_client
    except Exception as exc:
        logger.warning("Async Redis unavailable: %s", exc)
        _async_client = False
        return False


def redis_status() -> dict:
    """Return health-check dict for admin endpoint."""
    if not REDIS_ENABLED:
        return {"status": "disabled", "latencyMs": None}
    import time
    r = get_redis()
    if not r:
        return {"status": "unhealthy", "latencyMs": None}
    try:
        t0 = time.monotonic()
        r.ping()
        latency = round((time.monotonic() - t0) * 1000, 1)
        return {"status": "up", "latencyMs": latency}
    except Exception as exc:
        return {"status": "unhealthy", "latencyMs": None, "error": str(exc)}


# ── Cache helpers ────────────────────────────────────────────────────

def cache_get(key: str) -> str | None:
    """Get a string value from Redis. Returns None on miss or error."""
    r = get_redis()
    if not r:
        return None
    try:
        return r.get(key)
    except Exception as exc:
        logger.debug("Redis GET %s failed: %s", key, exc)
        return None


def cache_set(key: str, value: str, ttl: int = 300) -> bool:
    """Set a string key with TTL (seconds). Returns True on success."""
    r = get_redis()
    if not r:
        return False
    try:
        r.setex(key, ttl, value)
        return True
    except Exception as exc:
        logger.debug("Redis SET %s failed: %s", key, exc)
        return False


def cache_get_json(key: str) -> dict | list | None:
    """Get + JSON-decode. Returns None on miss / error."""
    raw = cache_get(key)
    if raw is None:
        return None
    try:
        import json
        return json.loads(raw)
    except Exception:
        return None


def cache_set_json(key: str, value: dict | list, ttl: int = 300) -> bool:
    """JSON-encode + SETEX. Returns True on success."""
    try:
        import json
        return cache_set(key, json.dumps(value, ensure_ascii=False, default=str), ttl)
    except Exception:
        return False


def cache_delete(key: str) -> bool:
    """Delete a key. Returns True on success."""
    r = get_redis()
    if not r:
        return False
    try:
        r.delete(key)
        return True
    except Exception:
        return False


# ── Hash helpers ─────────────────────────────────────────────────────

def hash_get(key: str, field: str) -> str | None:
    """HGET a single field."""
    r = get_redis()
    if not r:
        return None
    try:
        return r.hget(key, field)
    except Exception:
        return None


def hash_set(key: str, field: str, value: str) -> bool:
    """HSET a single field."""
    r = get_redis()
    if not r:
        return False
    try:
        r.hset(key, field, value)
        return True
    except Exception:
        return False


def hash_incr(key: str, field: str, amount: int = 1) -> int | None:
    """HINCRBY. Returns new value or None on error."""
    r = get_redis()
    if not r:
        return None
    try:
        return int(r.hincrby(key, field, amount))
    except Exception:
        return None


def hash_get_all(key: str) -> dict[str, str] | None:
    """HGETALL. Returns dict or None."""
    r = get_redis()
    if not r:
        return None
    try:
        return r.hgetall(key)
    except Exception:
        return None


# ── Lifecycle ────────────────────────────────────────────────────────

def close_redis() -> None:
    """Close sync Redis connection (call on shutdown)."""
    global _sync_client
    if _sync_client and _sync_client is not False:
        try:
            _sync_client.close()
        except Exception:
            pass
    _sync_client = None


async def close_async_redis() -> None:
    """Close async Redis connection."""
    global _async_client
    if _async_client and _async_client is not False:
        try:
            await _async_client.close()
        except Exception:
            pass
    _async_client = None
