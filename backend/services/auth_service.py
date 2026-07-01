"""Authentication service — JWT token management and password hashing."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import ExpiredSignatureError, JWTError, jwt
import bcrypt
from sqlalchemy import select

from config.settings import settings
from db.models import SysUser

logger = logging.getLogger(__name__)


# ── Password hashing ─────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    """Hash a plaintext password with bcrypt (cost=12)."""
    hashed = bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12))
    return hashed.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (TypeError, ValueError):
        return False


# ── JWT token management ─────────────────────────────────────────────

def _get_secret() -> str:
    secret = settings.JWT_SECRET
    if settings.AUTH_MODE == "enforce" and len(secret.encode("utf-8")) < 32:
        raise RuntimeError("JWT_SECRET must contain at least 32 bytes in enforce mode")
    if not secret:
        secret = "windeye-development-only-secret"
    return secret


def create_access_token(user_id: int, username: str) -> str:
    """Create a JWT access token (short-lived)."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "username": username,
        "iat": datetime.now(timezone.utc),
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, _get_secret(), algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: int, username: str) -> str:
    """Create a JWT refresh token (long-lived)."""
    expire = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "username": username,
        "iat": datetime.now(timezone.utc),
        "exp": expire,
        "type": "refresh",
    }
    return jwt.encode(payload, _get_secret(), algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT token. Raises JWTError on failure."""
    return jwt.decode(token, _get_secret(), algorithms=[settings.JWT_ALGORITHM])


def get_token_expiry(token: str) -> int | None:
    """Get remaining TTL in seconds for a token, or None if invalid."""
    try:
        payload = decode_token(token)
        exp = payload.get("exp", 0)
        now = datetime.now(timezone.utc).timestamp()
        return max(0, int(exp - now))
    except JWTError:
        return None


# ── Token blacklist (Redis-backed, optional) ──────────────────────────

from core.redis_client import get_redis as _get_redis  # unified client


def _blacklist_token(token: str, ttl: int) -> None:
    """Add a token to the Redis blacklist with given TTL in seconds."""
    r = _get_redis()
    if not r:
        return
    try:
        r.setex(f"blacklist:{token}", ttl, "1")
    except Exception:
        pass


def _is_blacklisted(token: str) -> bool:
    """Check if a token has been revoked via blacklist."""
    r = _get_redis()
    if not r:
        return False
    try:
        return r.exists(f"blacklist:{token}") > 0
    except Exception:
        return False


# ── Authentication ───────────────────────────────────────────────────

async def authenticate(
    session,
    username: str,
    password: str,
) -> SysUser | None:
    """Authenticate a user by username and password.

    Returns SysUser on success, None on failure.
    Updates failed_login_count and locked_until on repeated failures.
    """
    result = await session.execute(
        select(SysUser).where(
            SysUser.username == username,
            SysUser.deleted == 0,
        )
    )
    user: SysUser | None = result.scalar_one_or_none()

    if user is None:
        return None

    # Check if locked
    if user.status == 2 and user.locked_until:
        if user.locked_until > datetime.utcnow():
            logger.info(f"User '{username}' is locked until {user.locked_until}")
            return None
        # Auto-unlock
        user.status = 1
        user.failed_login_count = 0
        user.locked_until = None

    # Check if disabled
    if user.status == 0:
        logger.info(f"User '{username}' is disabled")
        return None

    # Verify password
    if not verify_password(password, user.password_hash):
        user.failed_login_count += 1
        max_fails = 5  # could read from sys_config
        if user.failed_login_count >= max_fails:
            user.status = 2
            user.locked_until = datetime.utcnow() + timedelta(minutes=30)
            logger.warning(f"User '{username}' locked after {max_fails} failed attempts")
        await session.commit()
        return None

    # Success — reset fail count
    user.failed_login_count = 0
    user.last_login_at = datetime.utcnow()
    await session.commit()

    return user
