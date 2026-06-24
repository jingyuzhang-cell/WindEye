"""User management service — CRUD operations for sys_user."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import SysRole, SysUser, SysUserRole
from services.auth_service import hash_password

logger = logging.getLogger(__name__)


async def list_users(
    session: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    *,
    keyword: str | None = None,
    status: int | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Paginated user list with optional search/filter."""
    query = select(SysUser).where(SysUser.deleted == 0)

    if keyword:
        like = f"%{keyword}%"
        query = query.where(
            (SysUser.username.contains(keyword))
            | (SysUser.real_name.contains(keyword))
            | (SysUser.email.contains(keyword))
        )
    if status is not None:
        query = query.where(SysUser.status == status)

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0

    # Fetch page
    offset = (page - 1) * page_size
    query = query.order_by(SysUser.id.desc()).offset(offset).limit(page_size)
    result = await session.execute(query)
    users = result.scalars().all()

    # Enrich with roles
    user_list = []
    for user in users:
        roles_result = await session.execute(
            select(SysRole)
            .join(SysUserRole, SysUserRole.role_id == SysRole.id)
            .where(SysUserRole.user_id == user.id)
        )
        roles = roles_result.scalars().all()

        user_list.append({
            "id": user.id,
            "username": user.username,
            "realName": user.real_name,
            "email": user.email,
            "phone": user.phone,
            "department": user.department,
            "status": user.status,
            "lastLoginAt": user.last_login_at.isoformat() if user.last_login_at else None,
            "createdAt": user.created_at.isoformat() if user.created_at else None,
            "roles": [{"id": r.id, "roleCode": r.role_code, "roleName": r.role_name} for r in roles],
        })

    return user_list, total


async def get_user(session: AsyncSession, user_id: int) -> dict[str, Any] | None:
    """Get a single user by ID with roles."""
    result = await session.execute(
        select(SysUser).where(SysUser.id == user_id, SysUser.deleted == 0)
    )
    user = result.scalar_one_or_none()
    if user is None:
        return None

    roles_result = await session.execute(
        select(SysRole)
        .join(SysUserRole, SysUserRole.role_id == SysRole.id)
        .where(SysUserRole.user_id == user.id)
    )
    roles = roles_result.scalars().all()

    return {
        "id": user.id,
        "username": user.username,
        "realName": user.real_name,
        "email": user.email,
        "phone": user.phone,
        "avatar": user.avatar,
        "department": user.department,
        "status": user.status,
        "failedLoginCount": user.failed_login_count,
        "lockedUntil": user.locked_until.isoformat() if user.locked_until else None,
        "lastLoginAt": user.last_login_at.isoformat() if user.last_login_at else None,
        "lastLoginIp": user.last_login_ip,
        "passwordUpdatedAt": user.password_updated_at.isoformat() if user.password_updated_at else None,
        "createdAt": user.created_at.isoformat() if user.created_at else None,
        "updatedAt": user.updated_at.isoformat() if user.updated_at else None,
        "roles": [{"id": r.id, "roleCode": r.role_code, "roleName": r.role_name} for r in roles],
    }


async def create_user(
    session: AsyncSession,
    *,
    username: str,
    password: str,
    real_name: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    department: str | None = None,
    role_ids: list[int] | None = None,
    operator_id: int | None = None,
    commit: bool = True,
) -> SysUser:
    """Create a new user."""
    # Check username uniqueness
    existing = await session.execute(
        select(SysUser).where(SysUser.username == username, SysUser.deleted == 0)
    )
    if existing.scalar_one_or_none():
        raise ValueError(f"用户名 '{username}' 已存在")

    user = SysUser(
        username=username,
        password_hash=hash_password(password),
        real_name=real_name,
        email=email,
        phone=phone,
        department=department,
        status=1,
        password_updated_at=datetime.utcnow(),
        created_by=operator_id,
    )
    session.add(user)
    await session.flush()
    await session.refresh(user)

    # Assign roles
    if role_ids:
        for rid in role_ids:
            session.add(SysUserRole(user_id=user.id, role_id=rid))

    if commit:
        await session.commit()
    else:
        await session.flush()
    logger.info(f"User created: id={user.id} username={username}")
    return user


async def update_user(
    session: AsyncSession,
    user_id: int,
    *,
    real_name: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    department: str | None = None,
    role_ids: list[int] | None = None,
    operator_id: int | None = None,
    commit: bool = True,
) -> SysUser | None:
    """Update user fields."""
    result = await session.execute(
        select(SysUser).where(SysUser.id == user_id, SysUser.deleted == 0)
    )
    user = result.scalar_one_or_none()
    if user is None:
        return None

    if real_name is not None:
        user.real_name = real_name
    if email is not None:
        user.email = email
    if phone is not None:
        user.phone = phone
    if department is not None:
        user.department = department
    if operator_id is not None:
        user.updated_by = operator_id

    # Update roles — delete existing, insert new
    if role_ids is not None:
        await session.execute(
            __import__("sqlalchemy").delete(SysUserRole).where(SysUserRole.user_id == user_id)
        )
        for rid in role_ids:
            session.add(SysUserRole(user_id=user_id, role_id=rid))

    if commit:
        await session.commit()
    else:
        await session.flush()
    await session.refresh(user)
    logger.info(f"User updated: id={user_id}")
    return user


async def patch_user_status(
    session: AsyncSession,
    user_id: int,
    status: int,
    operator_id: int | None = None,
    commit: bool = True,
) -> SysUser | None:
    """Enable (1), disable (0), or unlock (1 from 2) a user."""
    result = await session.execute(
        select(SysUser).where(SysUser.id == user_id, SysUser.deleted == 0)
    )
    user = result.scalar_one_or_none()
    if user is None:
        return None

    user.status = status
    if status == 1:  # Unlock / re-enable
        user.failed_login_count = 0
        user.locked_until = None
    if operator_id is not None:
        user.updated_by = operator_id
    if commit:
        await session.commit()
    else:
        await session.flush()
    logger.info(f"User status changed: id={user_id} status={status}")
    return user


async def reset_password(
    session: AsyncSession,
    user_id: int,
    new_password: str,
    operator_id: int | None = None,
    commit: bool = True,
) -> SysUser | None:
    """Admin reset a user's password."""
    result = await session.execute(
        select(SysUser).where(SysUser.id == user_id, SysUser.deleted == 0)
    )
    user = result.scalar_one_or_none()
    if user is None:
        return None

    user.password_hash = hash_password(new_password)
    user.password_updated_at = datetime.utcnow()
    # Force password change on next login by setting to null
    # user.password_updated_at = None  # uncomment to enforce
    if operator_id is not None:
        user.updated_by = operator_id
    if commit:
        await session.commit()
    else:
        await session.flush()
    logger.info(f"Password reset for user: id={user_id}")
    return user


async def soft_delete_user(
    session: AsyncSession,
    user_id: int,
    operator_id: int | None = None,
    commit: bool = True,
) -> bool:
    """Soft-delete a user (set deleted=1)."""
    result = await session.execute(
        select(SysUser).where(SysUser.id == user_id, SysUser.deleted == 0)
    )
    user = result.scalar_one_or_none()
    if user is None:
        return False

    user.deleted = 1
    user.status = 0
    if operator_id is not None:
        user.updated_by = operator_id
    if commit:
        await session.commit()
    else:
        await session.flush()
    logger.info(f"User soft-deleted: id={user_id}")
    return True
