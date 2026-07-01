"""Admin management API — user CRUD, role management, audit logs."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import case, delete, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies.permissions import require_permissions
from api.admin_schemas import (
    ConfigUpdate,
    PasswordReset,
    RoleCreate,
    RoleUpdate,
    UserCreate,
    UserListResponse,
    UserResponse,
    UserStatusPatch,
    UserUpdate,
)
from config.settings import settings
from db import get_db, is_mysql_configured
from db.models import (
    SysApiLog,
    SysConfig,
    SysOperationLog,
    SysPermission,
    SysRole,
    SysRolePermission,
    SysUser,
    SysUserRole,
)
from services.audit_service import write_operation_log
from services.user_service import (
    create_user,
    get_user,
    list_users,
    patch_user_status,
    reset_password,
    soft_delete_user,
    update_user,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])
BUILTIN_ROLE_CODES = {"admin", "analyst", "auditor", "readonly"}
DEFAULT_SYSTEM_CONFIGS = [
    {
        "configKey": "jwt.access_token_expire_minutes",
        "configValue": "480",
        "description": "访问令牌有效期，单位分钟",
    },
    {
        "configKey": "jwt.refresh_token_expire_days",
        "configValue": "7",
        "description": "刷新令牌有效期，单位天",
    },
    {
        "configKey": "login.max_failed_attempts",
        "configValue": "5",
        "description": "登录失败锁定前允许的最大失败次数",
    },
    {
        "configKey": "login.lock_minutes",
        "configValue": "30",
        "description": "登录锁定时长，单位分钟",
    },
    {
        "configKey": "audit.log_retention_days",
        "configValue": "180",
        "description": "操作日志与 API 日志保留天数",
    },
    {
        "configKey": "audit.slow_request_threshold_ms",
        "configValue": "3000",
        "description": "慢请求判定阈值，单位毫秒",
    },
    {
        "configKey": "audit.api_log_enabled",
        "configValue": "true",
        "description": "是否启用 API 调用日志",
    },
    {
        "configKey": "audit.operation_log_enabled",
        "configValue": "true",
        "description": "是否启用操作审计日志",
    },
]
OPEN_API_ENDPOINTS = [
    {
        "key": "graph_search_all",
        "name": "跨层关键词搜索",
        "method": "POST",
        "path": "/api/v1/graph/search-all",
        "match": "exact",
    },
    {
        "key": "graph_expand",
        "name": "N跳展开子图",
        "method": "POST",
        "path": "/api/v1/graph/expand/{node_id}",
        "prefix": "/api/v1/graph/expand/",
        "match": "prefix",
    },
    {
        "key": "community_discovery",
        "name": "风险主体群体发现",
        "method": "POST",
        "path": "/api/v1/governance/community-discovery",
        "match": "exact",
    },
    {
        "key": "risk_paths",
        "name": "风险传导路径分析",
        "method": "POST",
        "path": "/api/v1/governance/risk-paths",
        "match": "exact",
    },
    {
        "key": "compliance_report",
        "name": "协同治理社区报告",
        "method": "POST",
        "path": "/api/v1/governance/compliance-report",
        "match": "exact",
    },
]


def _use_dev_store() -> bool:
    return settings.AUTH_MODE == "off" and not is_mysql_configured()


def _dev_store():
    from services import dev_admin_store
    return dev_admin_store


# ── Helper ────────────────────────────────────────────────────────────

def _get_user_id(request: Request) -> int | None:
    """Extract authenticated user_id from request state."""
    return getattr(request.state, "user_id", None)


async def _log_admin_action(
    session: AsyncSession,
    request: Request,
    operation_type: str,
    operation_name: str,
    resource_type: str,
    resource_id: str | None = None,
    before_data: dict | None = None,
    after_data: dict | None = None,
    result: str = "SUCCESS",
    error_message: str | None = None,
):
    """Helper to write admin audit logs."""
    operator_id = _get_user_id(request)
    await write_operation_log(
        session,
        operation_type=operation_type,
        user_id=operator_id,
        username=None,  # will be filled from user_id
        operation_name=operation_name,
        resource_type=resource_type,
        resource_id=resource_id,
        request_method=request.method,
        request_path=request.url.path,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", ""),
        before_data=before_data,
        after_data=after_data,
        result=result,
        error_message=error_message,
    )


# ── GET /users ───────────────────────────────────────────────────────

@router.get(
    "/users",
    dependencies=[Depends(require_permissions("admin:user:view"))],
)
async def list_users_handler(
    request: Request,
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    keyword: str | None = Query(default=None),
    status: int | None = Query(default=None, ge=0, le=2),
):
    """Paginated user list."""
    if _use_dev_store():
        return _dev_store().list_users(
            page=page,
            page_size=pageSize,
            keyword=keyword,
            status=status,
        )
    db = get_db()
    async with db._session_factory() as session:
        users, total = await list_users(
            session, page=page, page_size=pageSize,
            keyword=keyword, status=status,
        )
        return {
            "data": users,
            "total": total,
            "page": page,
            "pageSize": pageSize,
            "success": True,
        }


# ── POST /users ──────────────────────────────────────────────────────

@router.post(
    "/users",
    dependencies=[Depends(require_permissions("admin:user:create"))],
)
async def create_user_handler(req: UserCreate, request: Request):
    """Create a new user."""
    if _use_dev_store():
        try:
            user = _dev_store().create_user(req.model_dump(by_alias=True))
            return {"success": True, "data": user, "mode": "development"}
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    db = get_db()
    operator_id = _get_user_id(request)
    async with db._session_factory() as session:
        try:
            user = await create_user(
                session,
                username=req.username,
                password=req.password,
                real_name=req.realName,
                email=req.email,
                phone=req.phone,
                department=req.department,
                role_ids=req.roleIds,
                operator_id=operator_id,
                commit=False,
            )
            await _log_admin_action(
                session, request,
                operation_type="CREATE_USER",
                operation_name=f"创建用户: {req.username}",
                resource_type="user",
                resource_id=str(user.id),
                after_data={"username": req.username, "realName": req.realName},
            )
            user_data = await get_user(session, user.id)
            return {"success": True, "data": user_data}
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))


# ── GET /users/{user_id} ─────────────────────────────────────────────

@router.get(
    "/users/{user_id}",
    dependencies=[Depends(require_permissions("admin:user:view"))],
)
async def get_user_handler(user_id: int, request: Request):
    """Get a single user by ID."""
    if _use_dev_store():
        user = _dev_store().get_user(user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="用户不存在")
        return {"success": True, "data": user, "mode": "development"}
    db = get_db()
    async with db._session_factory() as session:
        user = await get_user(session, user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="用户不存在")
        return {"success": True, "data": user}


# ── PUT /users/{user_id} ─────────────────────────────────────────────

@router.put(
    "/users/{user_id}",
    dependencies=[Depends(require_permissions("admin:user:update"))],
)
async def update_user_handler(user_id: int, req: UserUpdate, request: Request):
    """Update user fields and roles."""
    if _use_dev_store():
        user = _dev_store().update_user(
            user_id,
            req.model_dump(by_alias=True, exclude_unset=True),
        )
        if user is None:
            raise HTTPException(status_code=404, detail="用户不存在")
        return {"success": True, "data": user, "mode": "development"}
    db = get_db()
    operator_id = _get_user_id(request)
    async with db._session_factory() as session:
        # Snapshot before
        before = await get_user(session, user_id)
        if before is None:
            raise HTTPException(status_code=404, detail="用户不存在")

        updated = await update_user(
            session,
            user_id,
            real_name=req.realName,
            email=req.email,
            phone=req.phone,
            department=req.department,
            role_ids=req.roleIds,
            operator_id=operator_id,
            commit=False,
        )
        if updated is None:
            raise HTTPException(status_code=404, detail="用户不存在")

        after = await get_user(session, user_id)

        await _log_admin_action(
            session, request,
            operation_type="UPDATE_USER",
            operation_name=f"修改用户: {before.get('username', '')}",
            resource_type="user",
            resource_id=str(user_id),
            before_data={"roles": [r["roleCode"] for r in before.get("roles", [])]},
            after_data={"roles": [r["roleCode"] for r in after.get("roles", [])]},
        )

        return {"success": True, "data": after}


# ── PATCH /users/{user_id}/status ───────────────────────────────────

@router.patch(
    "/users/{user_id}/status",
    dependencies=[Depends(require_permissions("admin:user:disable"))],
)
async def patch_user_status_handler(user_id: int, req: UserStatusPatch, request: Request):
    """Enable, disable, or unlock a user."""
    if _use_dev_store():
        if user_id == 1 and req.status != 1:
            raise HTTPException(status_code=400, detail="不能禁用开发管理员")
        user = _dev_store().set_user_status(user_id, req.status)
        if user is None:
            raise HTTPException(status_code=404, detail="用户不存在")
        return {"success": True, "data": user, "mode": "development"}
    db = get_db()
    operator_id = _get_user_id(request)
    if operator_id == user_id and req.status != 1:
        raise HTTPException(status_code=400, detail="不能禁用或锁定当前登录账号")
    async with db._session_factory() as session:
        before = await get_user(session, user_id)
        if before is None:
            raise HTTPException(status_code=404, detail="用户不存在")

        status_labels = {1: "启用", 0: "禁用", 2: "锁定"}
        result_user = await patch_user_status(
            session,
            user_id,
            req.status,
            operator_id,
            commit=False,
        )

        await _log_admin_action(
            session, request,
            operation_type="DISABLE_USER" if req.status == 0 else "UPDATE_USER",
            operation_name=f"{status_labels.get(req.status, '修改')}用户: {before.get('username', '')}",
            resource_type="user",
            resource_id=str(user_id),
            before_data={"status": before["status"]},
            after_data={"status": req.status},
        )

        user_data = await get_user(session, user_id)
        return {"success": True, "data": user_data}


# ── POST /users/{user_id}/reset-password ─────────────────────────────

@router.post(
    "/users/{user_id}/reset-password",
    dependencies=[Depends(require_permissions("admin:user:update"))],
)
async def reset_password_handler(user_id: int, req: PasswordReset, request: Request):
    """Admin reset a user's password."""
    if _use_dev_store():
        if _dev_store().get_user(user_id) is None:
            raise HTTPException(status_code=404, detail="用户不存在")
        return {
            "success": True,
            "message": "开发模式已模拟重置密码",
            "mode": "development",
        }
    db = get_db()
    operator_id = _get_user_id(request)
    async with db._session_factory() as session:
        before = await get_user(session, user_id)
        if before is None:
            raise HTTPException(status_code=404, detail="用户不存在")

        result = await reset_password(
            session,
            user_id,
            req.newPassword,
            operator_id,
            commit=False,
        )
        if result is None:
            raise HTTPException(status_code=404, detail="用户不存在")

        await _log_admin_action(
            session, request,
            operation_type="UPDATE_USER",
            operation_name=f"重置密码: {before.get('username', '')}",
            resource_type="user",
            resource_id=str(user_id),
        )

        return {"success": True, "message": "密码已重置"}


# ── DELETE /users/{user_id} ──────────────────────────────────────────

@router.delete(
    "/users/{user_id}",
    dependencies=[Depends(require_permissions("admin:user:delete"))],
)
async def delete_user_handler(user_id: int, request: Request):
    """Soft-delete a user."""
    if _use_dev_store():
        if user_id == 1:
            raise HTTPException(status_code=400, detail="不能删除开发管理员")
        if not _dev_store().delete_user(user_id):
            raise HTTPException(status_code=404, detail="用户不存在")
        return {
            "success": True,
            "message": "用户已删除",
            "mode": "development",
        }
    db = get_db()
    operator_id = _get_user_id(request)
    if operator_id == user_id:
        raise HTTPException(status_code=400, detail="不能删除当前登录账号")
    async with db._session_factory() as session:
        before = await get_user(session, user_id)
        if before is None:
            raise HTTPException(status_code=404, detail="用户不存在")

        success = await soft_delete_user(
            session,
            user_id,
            operator_id,
            commit=False,
        )

        await _log_admin_action(
            session, request,
            operation_type="DELETE_USER",
            operation_name=f"删除用户: {before.get('username', '')}",
            resource_type="user",
            resource_id=str(user_id),
            before_data={"username": before["username"]},
        )

        return {"success": True, "message": "用户已删除"}


# ── Roles and permissions ────────────────────────────────────────────

@router.get(
    "/roles",
    dependencies=[Depends(require_permissions("admin:role:view"))],
)
async def list_roles_handler():
    if _use_dev_store():
        return {
            "success": True,
            "data": _dev_store().list_roles(),
            "mode": "development",
        }
    db = get_db()
    async with db._session_factory() as session:
        result = await session.execute(
            select(SysRole).order_by(SysRole.sort_order, SysRole.id)
        )
        roles = result.scalars().all()
        data = []
        for role in roles:
            user_count = await session.scalar(
                select(func.count())
                .select_from(SysUserRole)
                .join(SysUser, SysUser.id == SysUserRole.user_id)
                .where(
                    SysUserRole.role_id == role.id,
                    SysUser.deleted == 0,
                )
            )
            permission_count = await session.scalar(
                select(func.count())
                .select_from(SysRolePermission)
                .where(SysRolePermission.role_id == role.id)
            )
            data.append({
                "id": role.id,
                "roleCode": role.role_code,
                "roleName": role.role_name,
                "description": role.description,
                "status": role.status,
                "sortOrder": role.sort_order,
                "userCount": user_count or 0,
                "permissionCount": permission_count or 0,
            })
        return {"success": True, "data": data}


@router.post(
    "/roles",
    dependencies=[Depends(require_permissions("admin:role:assign"))],
)
async def create_role_handler(req: RoleCreate, request: Request):
    if _use_dev_store():
        try:
            role = _dev_store().create_role(req.model_dump(by_alias=True))
            return {"success": True, "data": role, "mode": "development"}
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    db = get_db()
    async with db._session_factory() as session:
        existing = await session.scalar(
            select(SysRole).where(SysRole.role_code == req.roleCode)
        )
        if existing is not None:
            raise HTTPException(status_code=400, detail=f"角色编码 '{req.roleCode}' 已存在")

        role = SysRole(
            role_code=req.roleCode,
            role_name=req.roleName,
            description=req.description,
            status=req.status,
            sort_order=req.sortOrder,
        )
        session.add(role)
        await session.flush()
        await session.refresh(role)
        await _log_admin_action(
            session,
            request,
            operation_type="CREATE_ROLE",
            operation_name=f"创建角色: {req.roleName}",
            resource_type="role",
            resource_id=str(role.id),
            after_data=req.model_dump(by_alias=True),
        )
        return {
            "success": True,
            "data": {
                "id": role.id,
                "roleCode": role.role_code,
                "roleName": role.role_name,
                "description": role.description,
                "status": role.status,
                "sortOrder": role.sort_order,
                "userCount": 0,
                "permissionCount": 0,
            },
        }


@router.put(
    "/roles/{role_id}",
    dependencies=[Depends(require_permissions("admin:role:assign"))],
)
async def update_role_handler(role_id: int, req: RoleUpdate, request: Request):
    if _use_dev_store():
        role = _dev_store().update_role(
            role_id,
            req.model_dump(by_alias=True, exclude_unset=True),
        )
        if role is None:
            raise HTTPException(status_code=404, detail="角色不存在")
        return {"success": True, "data": role, "mode": "development"}

    db = get_db()
    async with db._session_factory() as session:
        role = await session.get(SysRole, role_id)
        if role is None:
            raise HTTPException(status_code=404, detail="角色不存在")

        before = {
            "roleCode": role.role_code,
            "roleName": role.role_name,
            "description": role.description,
            "status": role.status,
            "sortOrder": role.sort_order,
        }
        if req.roleName is not None:
            role.role_name = req.roleName
        if req.description is not None:
            role.description = req.description
        if req.status is not None:
            role.status = req.status
        if req.sortOrder is not None:
            role.sort_order = req.sortOrder
        await session.flush()
        await _log_admin_action(
            session,
            request,
            operation_type="UPDATE_ROLE",
            operation_name=f"修改角色: {role.role_name}",
            resource_type="role",
            resource_id=str(role.id),
            before_data=before,
            after_data={
                "roleCode": role.role_code,
                "roleName": role.role_name,
                "description": role.description,
                "status": role.status,
                "sortOrder": role.sort_order,
            },
        )
        user_count = await session.scalar(
            select(func.count())
            .select_from(SysUserRole)
            .join(SysUser, SysUser.id == SysUserRole.user_id)
            .where(
                SysUserRole.role_id == role.id,
                SysUser.deleted == 0,
            )
        )
        permission_count = await session.scalar(
            select(func.count())
            .select_from(SysRolePermission)
            .where(SysRolePermission.role_id == role.id)
        )
        return {
            "success": True,
            "data": {
                "id": role.id,
                "roleCode": role.role_code,
                "roleName": role.role_name,
                "description": role.description,
                "status": role.status,
                "sortOrder": role.sort_order,
                "userCount": user_count or 0,
                "permissionCount": permission_count or 0,
            },
        }


@router.delete(
    "/roles/{role_id}",
    dependencies=[Depends(require_permissions("admin:role:assign"))],
)
async def delete_role_handler(role_id: int, request: Request):
    if _use_dev_store():
        try:
            deleted = _dev_store().delete_role(role_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if not deleted:
            raise HTTPException(status_code=404, detail="角色不存在")
        return {"success": True, "message": "角色已删除", "mode": "development"}

    db = get_db()
    async with db._session_factory() as session:
        role = await session.get(SysRole, role_id)
        if role is None:
            raise HTTPException(status_code=404, detail="角色不存在")
        if role.role_code in BUILTIN_ROLE_CODES:
            raise HTTPException(status_code=400, detail="系统内置角色不能删除")

        user_count = await session.scalar(
            select(func.count())
            .select_from(SysUserRole)
            .join(SysUser, SysUser.id == SysUserRole.user_id)
            .where(
                SysUserRole.role_id == role_id,
                SysUser.deleted == 0,
            )
        )
        if user_count:
            raise HTTPException(status_code=400, detail="角色已分配给用户，不能删除")

        before = {
            "roleCode": role.role_code,
            "roleName": role.role_name,
            "description": role.description,
            "status": role.status,
            "sortOrder": role.sort_order,
        }
        await session.execute(
            delete(SysRolePermission).where(SysRolePermission.role_id == role_id)
        )
        await session.delete(role)
        await _log_admin_action(
            session,
            request,
            operation_type="DELETE_ROLE",
            operation_name=f"删除角色: {before['roleName']}",
            resource_type="role",
            resource_id=str(role_id),
            before_data=before,
        )
        return {"success": True, "message": "角色已删除"}


@router.put(
    "/roles/{role_id}/permissions",
    dependencies=[Depends(require_permissions("admin:role:assign"))],
)
async def set_role_permissions_handler(
    role_id: int,
    request: Request,
):
    body = await request.json()
    permission_ids = {
        int(value)
        for value in body.get("permissionIds", [])
        if str(value).isdigit()
    }
    if _use_dev_store():
        selected = _dev_store().set_role_permissions(
            role_id,
            sorted(permission_ids),
        )
        if selected is None:
            raise HTTPException(status_code=404, detail="角色不存在")
        return {
            "success": True,
            "data": {"permissionIds": selected},
            "mode": "development",
        }
    db = get_db()
    async with db._session_factory() as session:
        role = await session.get(SysRole, role_id)
        if role is None:
            raise HTTPException(status_code=404, detail="角色不存在")

        existing_result = await session.execute(
            select(SysRolePermission.permission_id)
            .where(SysRolePermission.role_id == role_id)
        )
        before_ids = sorted(row[0] for row in existing_result.all())

        valid_ids = set()
        if permission_ids:
            valid_result = await session.execute(
                select(SysPermission.id).where(
                    SysPermission.id.in_(permission_ids),
                    SysPermission.status == 1,
                )
            )
            valid_ids = {row[0] for row in valid_result.all()}
        if valid_ids != permission_ids:
            raise HTTPException(status_code=400, detail="包含无效或已禁用的权限")

        await session.execute(
            delete(SysRolePermission).where(SysRolePermission.role_id == role_id)
        )
        session.add_all([
            SysRolePermission(role_id=role_id, permission_id=permission_id)
            for permission_id in sorted(valid_ids)
        ])
        await write_operation_log(
            session,
            operation_type="PERMISSION_CHANGE",
            user_id=_get_user_id(request),
            username=getattr(request.state, "username", None),
            operation_name=f"修改角色权限: {role.role_name}",
            resource_type="role",
            resource_id=str(role_id),
            request_method=request.method,
            request_path=request.url.path,
            before_data={"permissionIds": before_ids},
            after_data={"permissionIds": sorted(valid_ids)},
            trace_id=getattr(request.state, "trace_id", None),
        )
        return {"success": True, "data": {"permissionIds": sorted(valid_ids)}}


@router.get(
    "/roles/{role_id}/permissions",
    dependencies=[Depends(require_permissions("admin:role:view"))],
)
async def get_role_permissions_handler(role_id: int):
    if _use_dev_store():
        permission_ids = _dev_store().get_role_permissions(role_id)
        if permission_ids is None:
            raise HTTPException(status_code=404, detail="角色不存在")
        return {
            "success": True,
            "data": {"permissionIds": permission_ids},
            "mode": "development",
        }
    db = get_db()
    async with db._session_factory() as session:
        role = await session.get(SysRole, role_id)
        if role is None:
            raise HTTPException(status_code=404, detail="角色不存在")
        result = await session.execute(
            select(SysRolePermission.permission_id)
            .where(SysRolePermission.role_id == role_id)
        )
        return {
            "success": True,
            "data": {"permissionIds": sorted(row[0] for row in result.all())},
        }


@router.get(
    "/permissions",
    dependencies=[Depends(require_permissions("admin:role:view"))],
)
async def list_permissions_handler():
    if _use_dev_store():
        return {
            "success": True,
            "data": _dev_store().list_permissions(),
            "mode": "development",
        }
    db = get_db()
    async with db._session_factory() as session:
        result = await session.execute(
            select(SysPermission).order_by(
                SysPermission.sort_order,
                SysPermission.id,
            )
        )
        permissions = result.scalars().all()
        return {
            "success": True,
            "data": [{
                "id": item.id,
                "permCode": item.perm_code,
                "permName": item.perm_name,
                "permType": item.perm_type,
                "parentId": item.parent_id,
                "resourcePath": item.resource_path,
                "httpMethod": item.http_method,
                "status": item.status,
            } for item in permissions],
        }


# ── Audit log queries ────────────────────────────────────────────────

@router.get(
    "/audit-logs",
    dependencies=[Depends(require_permissions("audit:operation-log:view"))],
)
async def list_audit_logs_handler(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    operationType: str | None = None,
    result: str | None = None,
    traceId: str | None = None,
):
    if _use_dev_store():
        return _dev_store().list_operation_logs(page, pageSize)
    db = get_db()
    async with db._session_factory() as session:
        query = select(SysOperationLog)
        if operationType:
            query = query.where(SysOperationLog.operation_type == operationType)
        if result:
            query = query.where(SysOperationLog.result == result)
        if traceId:
            query = query.where(SysOperationLog.trace_id == traceId)
        total = await session.scalar(
            select(func.count()).select_from(query.subquery())
        )
        rows = (
            await session.execute(
                query.order_by(SysOperationLog.created_at.desc())
                .offset((page - 1) * pageSize)
                .limit(pageSize)
            )
        ).scalars().all()
        return {
            "success": True,
            "data": [{
                "id": row.id,
                "traceId": row.trace_id,
                "userId": row.user_id,
                "username": row.username,
                "operationType": row.operation_type,
                "operationName": row.operation_name,
                "resourceType": row.resource_type,
                "resourceId": row.resource_id,
                "result": row.result,
                "beforeData": row.before_data,
                "afterData": row.after_data,
                "errorMessage": row.error_message,
                "createdAt": row.created_at.isoformat() if row.created_at else None,
            } for row in rows],
            "total": total or 0,
            "page": page,
            "pageSize": pageSize,
        }


# ── System overview ──────────────────────────────────────────────────

@router.get(
    "/health",
    dependencies=[Depends(require_permissions("system:monitor:view"))],
)
async def admin_health_handler():
    services = {
        "mysql": {"status": "down", "latencyMs": None},
        "neo4j": {"status": "down", "latencyMs": None},
        "redis": {"status": "disabled", "latencyMs": None},
    }

    if is_mysql_configured():
        try:
            import time
            db = get_db()
            started = time.perf_counter()
            async with db._session_factory() as session:
                await session.execute(text("SELECT 1"))
            services["mysql"] = {
                "status": "up",
                "latencyMs": int((time.perf_counter() - started) * 1000),
            }
        except Exception:
            pass
    else:
        services["mysql"] = {"status": "disabled", "latencyMs": None}

    try:
        import time
        from api.graph_routes import _client
        started = time.perf_counter()
        _client().verify_connectivity()
        services["neo4j"] = {
            "status": "up",
            "latencyMs": int((time.perf_counter() - started) * 1000),
        }
    except Exception:
        pass

    try:
        from core.redis_client import redis_status
        services["redis"] = redis_status()
    except Exception:
        pass

    return {"success": True, "data": {"services": services}}


@router.get(
    "/dashboard",
    dependencies=[Depends(require_permissions("system:monitor:view"))],
)
async def admin_dashboard_handler():
    if _use_dev_store():
        return {
            "success": True,
            "data": _dev_store().dashboard(),
            "mode": "development",
        }
    db = get_db()
    async with db._session_factory() as session:
        user_total = await session.scalar(
            select(func.count()).select_from(SysUser).where(SysUser.deleted == 0)
        )
        role_total = await session.scalar(
            select(func.count()).select_from(SysRole)
        )
        permission_total = await session.scalar(
            select(func.count()).select_from(SysPermission)
        )
        api_today = await session.scalar(
            select(func.count()).select_from(SysApiLog)
        )
        api_errors = await session.scalar(
            select(func.count()).select_from(SysApiLog).where(SysApiLog.success == 0)
        )
        avg_latency = await session.scalar(select(func.avg(SysApiLog.latency_ms)))
        return {
            "success": True,
            "data": {
                "users": {"total": user_total or 0},
                "roles": role_total or 0,
                "permissions": permission_total or 0,
                "api": {
                    "total": api_today or 0,
                    "errors": api_errors or 0,
                    "averageLatencyMs": round(float(avg_latency or 0), 1),
                },
            },
        }


def _config_row_to_dict(row: SysConfig) -> dict:
    return {
        "id": row.id,
        "configKey": row.config_key,
        "configValue": row.config_value,
        "description": row.description,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
    }


async def _ensure_default_configs(session: AsyncSession) -> None:
    default_keys = [item["configKey"] for item in DEFAULT_SYSTEM_CONFIGS]
    existing_keys = set(
        (
            await session.execute(
                select(SysConfig.config_key).where(SysConfig.config_key.in_(default_keys))
            )
        ).scalars().all()
    )
    now = datetime.utcnow()
    for item in DEFAULT_SYSTEM_CONFIGS:
        if item["configKey"] in existing_keys:
            continue
        session.add(
            SysConfig(
                config_key=item["configKey"],
                config_value=item["configValue"],
                description=item["description"],
                created_at=now,
                updated_at=now,
            )
        )
    if len(existing_keys) < len(DEFAULT_SYSTEM_CONFIGS):
        await session.commit()


@router.get(
    "/config",
    dependencies=[Depends(require_permissions("system:monitor:view"))],
)
async def list_system_config_handler():
    if _use_dev_store():
        return {
            "success": True,
            "data": _dev_store().list_configs(DEFAULT_SYSTEM_CONFIGS),
            "mode": "development",
        }
    db = get_db()
    async with db._session_factory() as session:
        await _ensure_default_configs(session)
        rows = (
            await session.execute(select(SysConfig).order_by(SysConfig.config_key.asc()))
        ).scalars().all()
        return {
            "success": True,
            "data": [_config_row_to_dict(row) for row in rows],
        }


@router.put(
    "/config",
    dependencies=[Depends(require_permissions("system:monitor:view"))],
)
async def update_system_config_handler(payload: ConfigUpdate, request: Request):
    if _use_dev_store():
        rows = _dev_store().update_configs(
            [item.model_dump(by_alias=True) for item in payload.items],
            DEFAULT_SYSTEM_CONFIGS,
        )
        return {
            "success": True,
            "data": rows,
            "mode": "development",
        }
    db = get_db()
    async with db._session_factory() as session:
        await _ensure_default_configs(session)
        keys = [item.configKey for item in payload.items]
        rows_by_key = {
            row.config_key: row
            for row in (
                await session.execute(
                    select(SysConfig).where(SysConfig.config_key.in_(keys))
                )
            ).scalars().all()
        }
        now = datetime.utcnow()
        for item in payload.items:
            row = rows_by_key.get(item.configKey)
            if row is None:
                session.add(
                    SysConfig(
                        config_key=item.configKey,
                        config_value=item.configValue,
                        description=item.description,
                        created_at=now,
                        updated_at=now,
                    )
                )
            else:
                row.config_value = item.configValue
                row.description = item.description
                row.updated_at = now
        await _log_admin_action(
            session,
            request,
            operation_type="UPDATE_CONFIG",
            operation_name="更新系统配置",
            resource_type="system_config",
            resource_id="batch",
        )
        await session.commit()
        rows = (
            await session.execute(select(SysConfig).order_by(SysConfig.config_key.asc()))
        ).scalars().all()
        return {
            "success": True,
            "data": [_config_row_to_dict(row) for row in rows],
        }


def _open_api_path_filter():
    filters = []
    for endpoint in OPEN_API_ENDPOINTS:
        method_filter = SysApiLog.method == endpoint["method"]
        if endpoint["match"] == "prefix":
            filters.append(method_filter & SysApiLog.path.like(f"{endpoint['prefix']}%"))
        else:
            filters.append(method_filter & (SysApiLog.path == endpoint["path"]))
    return or_(*filters)


def _endpoint_path_filter(endpoint: dict):
    method_filter = SysApiLog.method == endpoint["method"]
    if endpoint["match"] == "prefix":
        return method_filter & SysApiLog.path.like(f"{endpoint['prefix']}%")
    return method_filter & (SysApiLog.path == endpoint["path"])


def _match_open_api(method: str, path: str) -> dict | None:
    method = method.upper()
    for endpoint in OPEN_API_ENDPOINTS:
        if endpoint["method"] != method:
            continue
        if endpoint["match"] == "prefix" and path.startswith(endpoint["prefix"]):
            return endpoint
        if endpoint["match"] == "exact" and path == endpoint["path"]:
            return endpoint
    return None


def _api_log_to_dict(row: SysApiLog, *, include_detail: bool = False) -> dict:
    endpoint = _match_open_api(row.method, row.path)
    data = {
        "id": row.id,
        "traceId": row.trace_id,
        "apiCode": endpoint["key"] if endpoint else None,
        "apiName": endpoint["name"] if endpoint else None,
        "userId": row.user_id,
        "username": row.username,
        "method": row.method,
        "path": row.path,
        "queryString": row.query_string,
        "statusCode": row.status_code,
        "success": bool(row.success),
        "latencyMs": row.latency_ms,
        "ipAddress": row.ip_address,
        "errorCode": row.error_code,
        "errorMessage": row.error_message,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
    }
    if include_detail:
        data.update({
            "userAgent": row.user_agent,
            "requestSummary": row.request_summary,
            "responseSummary": row.response_summary,
        })
    return data


async def _open_api_summary(session: AsyncSession, since: datetime | None = None) -> dict:
    filters = [_open_api_path_filter()]
    if since is not None:
        filters.append(SysApiLog.created_at >= since)
    total = await session.scalar(
        select(func.count()).select_from(SysApiLog).where(*filters)
    ) or 0
    errors = await session.scalar(
        select(func.count()).select_from(SysApiLog).where(*filters, SysApiLog.success == 0)
    ) or 0
    avg_latency = await session.scalar(
        select(func.avg(SysApiLog.latency_ms)).where(*filters)
    )
    return {
        "total": total,
        "success": total - errors,
        "errors": errors,
        "successRate": round(((total - errors) / total * 100), 1) if total else 100.0,
        "averageLatencyMs": round(float(avg_latency or 0), 1),
    }


@router.get(
    "/api-logs/open-api-stats",
    dependencies=[Depends(require_permissions("audit:api-log:view"))],
)
async def open_api_log_stats_handler():
    if _use_dev_store():
        return _dev_store().open_api_stats(OPEN_API_ENDPOINTS)

    now = datetime.utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week = today - timedelta(days=today.weekday())
    month = today.replace(day=1)
    last_7_days = today - timedelta(days=6)
    last_30_days = today - timedelta(days=29)
    last_12_weeks = week - timedelta(weeks=11)
    last_12_months = month
    for _ in range(11):
        if last_12_months.month == 1:
            last_12_months = last_12_months.replace(year=last_12_months.year - 1, month=12)
        else:
            last_12_months = last_12_months.replace(month=last_12_months.month - 1)

    db = get_db()
    async with db._session_factory() as session:
        periods = {
            "today": await _open_api_summary(session, today),
            "week": await _open_api_summary(session, week),
            "month": await _open_api_summary(session, month),
            "last7Days": await _open_api_summary(session, last_7_days),
            "last30Days": await _open_api_summary(session, last_30_days),
            "total": await _open_api_summary(session),
        }

        endpoints = []
        for endpoint in OPEN_API_ENDPOINTS:
            endpoint_filter = _endpoint_path_filter(endpoint)
            total_count = await session.scalar(
                select(func.count()).select_from(SysApiLog).where(endpoint_filter)
            ) or 0
            error_count = await session.scalar(
                select(func.count()).select_from(SysApiLog).where(
                    endpoint_filter,
                    SysApiLog.success == 0,
                )
            ) or 0
            avg_latency = await session.scalar(
                select(func.avg(SysApiLog.latency_ms)).where(endpoint_filter)
            )
            endpoints.append({
                "key": endpoint["key"],
                "name": endpoint["name"],
                "method": endpoint["method"],
                "path": endpoint["path"],
                "today": await session.scalar(
                    select(func.count()).select_from(SysApiLog).where(
                        _endpoint_path_filter(endpoint),
                        SysApiLog.created_at >= today,
                    )
                ) or 0,
                "week": await session.scalar(
                    select(func.count()).select_from(SysApiLog).where(
                        _endpoint_path_filter(endpoint),
                        SysApiLog.created_at >= week,
                    )
                ) or 0,
                "month": await session.scalar(
                    select(func.count()).select_from(SysApiLog).where(
                        _endpoint_path_filter(endpoint),
                        SysApiLog.created_at >= month,
                    )
                ) or 0,
                "total": total_count,
                "errors": error_count,
                "successRate": round(((total_count - error_count) / total_count * 100), 1)
                if total_count else 100.0,
                "averageLatencyMs": round(float(avg_latency or 0), 1),
            })

        daily_rows = (
            await session.execute(
                select(
                    func.date(SysApiLog.created_at).label("day"),
                    func.count().label("count"),
                    func.sum(case((SysApiLog.success == 0, 1), else_=0)).label("errors"),
                )
                .where(
                    _open_api_path_filter(),
                    SysApiLog.created_at >= last_30_days,
                )
                .group_by(func.date(SysApiLog.created_at))
                .order_by(func.date(SysApiLog.created_at))
            )
        ).all()
        daily_map = {
            str(row.day): {
                    "date": str(row.day),
                    "count": int(row.count or 0),
                    "errors": int(row.errors or 0),
                    "successRate": round(
                        ((int(row.count or 0) - int(row.errors or 0)) / int(row.count or 1) * 100),
                        1,
                    ) if int(row.count or 0) else 100.0,
                }
            for row in daily_rows
        }
        daily = []
        for offset in range(30):
            date = (last_30_days + timedelta(days=offset)).date().isoformat()
            daily.append(daily_map.get(date, {"date": date, "count": 0, "errors": 0, "successRate": 100.0}))

        week_expr = func.date_format(SysApiLog.created_at, "%x-W%v")
        weekly_rows = (
            await session.execute(
                select(
                    week_expr.label("week"),
                    func.count().label("count"),
                    func.sum(case((SysApiLog.success == 0, 1), else_=0)).label("errors"),
                )
                .where(
                    _open_api_path_filter(),
                    SysApiLog.created_at >= last_12_weeks,
                )
                .group_by(week_expr)
                .order_by(week_expr)
            )
        ).all()
        weekly_map = {
            str(row.week): {
                    "week": str(row.week),
                    "count": int(row.count or 0),
                    "errors": int(row.errors or 0),
                    "successRate": round(
                        ((int(row.count or 0) - int(row.errors or 0)) / int(row.count or 1) * 100),
                        1,
                    ) if int(row.count or 0) else 100.0,
                }
            for row in weekly_rows
        }
        weekly = []
        for offset in range(12):
            item_week = last_12_weeks + timedelta(weeks=offset)
            iso_year, iso_week, _ = item_week.isocalendar()
            label = f"{iso_year}-W{iso_week:02d}"
            weekly.append(weekly_map.get(label, {"week": label, "count": 0, "errors": 0, "successRate": 100.0}))

        month_expr = func.date_format(SysApiLog.created_at, "%Y-%m")
        monthly_rows = (
            await session.execute(
                select(
                    month_expr.label("month"),
                    func.count().label("count"),
                    func.sum(case((SysApiLog.success == 0, 1), else_=0)).label("errors"),
                )
                .where(
                    _open_api_path_filter(),
                    SysApiLog.created_at >= last_12_months,
                )
                .group_by(month_expr)
                .order_by(month_expr)
            )
        ).all()
        monthly_map = {
            str(row.month): {
                    "month": str(row.month),
                    "count": int(row.count or 0),
                    "errors": int(row.errors or 0),
                    "successRate": round(
                        ((int(row.count or 0) - int(row.errors or 0)) / int(row.count or 1) * 100),
                        1,
                    ) if int(row.count or 0) else 100.0,
                }
            for row in monthly_rows
        }
        monthly = []
        month_cursor = last_12_months
        for _ in range(12):
            label = month_cursor.strftime("%Y-%m")
            monthly.append(monthly_map.get(label, {"month": label, "count": 0, "errors": 0, "successRate": 100.0}))
            if month_cursor.month == 12:
                month_cursor = month_cursor.replace(year=month_cursor.year + 1, month=1)
            else:
                month_cursor = month_cursor.replace(month=month_cursor.month + 1)

        return {
            "success": True,
            "data": {
                "apiSource": "docs/开放API接口文档.docx",
                "updatedAt": now.isoformat(),
                "periods": periods,
                "endpoints": endpoints,
                "daily": daily,
                "weekly": weekly,
                "monthly": monthly,
            },
        }


@router.get(
    "/open-api/metrics",
    dependencies=[Depends(require_permissions("audit:api-log:view"))],
)
async def open_api_metrics_handler():
    data = (await open_api_log_stats_handler())["data"]
    periods = data["periods"]
    return {
        "success": True,
        "data": {
            "todayCalls": periods["today"]["total"],
            "weekCalls": periods["week"]["total"],
            "monthCalls": periods["month"]["total"],
            "totalCalls": periods["total"]["total"],
            "todaySuccessRate": periods["today"]["successRate"],
            "todayErrors": periods["today"]["errors"],
            "last7DaysCalls": periods["last7Days"]["total"],
            "avgLatencyMs": periods["last30Days"]["averageLatencyMs"],
        },
    }


@router.get(
    "/open-api/ranking",
    dependencies=[Depends(require_permissions("audit:api-log:view"))],
)
async def open_api_ranking_handler():
    data = (await open_api_log_stats_handler())["data"]
    return {"success": True, "data": data["endpoints"]}


@router.get(
    "/open-api/daily-stats",
    dependencies=[Depends(require_permissions("audit:api-log:view"))],
)
async def open_api_daily_stats_handler(days: int = Query(30, ge=1, le=90)):
    data = (await open_api_log_stats_handler())["data"]
    return {"success": True, "data": data["daily"][-days:]}


@router.get(
    "/open-api/call-logs",
    dependencies=[Depends(require_permissions("audit:api-log:view"))],
)
async def open_api_call_logs_handler(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    method: str | None = None,
    path: str | None = None,
    statusCode: int | None = None,
    success: bool | None = None,
    minLatencyMs: int | None = Query(None, ge=0),
    maxLatencyMs: int | None = Query(None, ge=0),
    startTime: datetime | None = None,
    endTime: datetime | None = None,
    traceId: str | None = None,
    username: str | None = None,
):
    if _use_dev_store():
        return _dev_store().list_api_logs(page, pageSize)

    db = get_db()
    async with db._session_factory() as session:
        query = select(SysApiLog).where(_open_api_path_filter())
        if method:
            query = query.where(SysApiLog.method == method.upper())
        if path:
            query = query.where(SysApiLog.path.contains(path))
        if statusCode is not None:
            query = query.where(SysApiLog.status_code == statusCode)
        if success is not None:
            query = query.where(SysApiLog.success == (1 if success else 0))
        if minLatencyMs is not None:
            query = query.where(SysApiLog.latency_ms >= minLatencyMs)
        if maxLatencyMs is not None:
            query = query.where(SysApiLog.latency_ms <= maxLatencyMs)
        if startTime is not None:
            query = query.where(SysApiLog.created_at >= startTime)
        if endTime is not None:
            query = query.where(SysApiLog.created_at <= endTime)
        if traceId:
            query = query.where(SysApiLog.trace_id.contains(traceId))
        if username:
            query = query.where(SysApiLog.username.contains(username))

        total = await session.scalar(
            select(func.count()).select_from(query.subquery())
        )
        rows = (
            await session.execute(
                query.order_by(SysApiLog.created_at.desc())
                .offset((page - 1) * pageSize)
                .limit(pageSize)
            )
        ).scalars().all()
        return {
            "success": True,
            "data": [_api_log_to_dict(row) for row in rows],
            "total": total or 0,
            "page": page,
            "pageSize": pageSize,
        }


@router.get(
    "/open-api/call-logs/{log_id}",
    dependencies=[Depends(require_permissions("audit:api-log:view"))],
)
async def open_api_call_log_detail_handler(log_id: int):
    db = get_db()
    async with db._session_factory() as session:
        row = await session.get(SysApiLog, log_id)
        if row is None or _match_open_api(row.method, row.path) is None:
            raise HTTPException(status_code=404, detail="开放 API 调用记录不存在")
        return {"success": True, "data": _api_log_to_dict(row, include_detail=True)}


@router.get(
    "/api-logs",
    dependencies=[Depends(require_permissions("audit:api-log:view"))],
)
async def list_api_logs_handler(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    method: str | None = None,
    path: str | None = None,
    statusCode: int | None = None,
    minLatencyMs: int | None = Query(None, ge=0),
):
    if _use_dev_store():
        return _dev_store().list_api_logs(page, pageSize)
    db = get_db()
    async with db._session_factory() as session:
        query = select(SysApiLog)
        if method:
            query = query.where(SysApiLog.method == method.upper())
        if path:
            query = query.where(SysApiLog.path.contains(path))
        if statusCode is not None:
            query = query.where(SysApiLog.status_code == statusCode)
        if minLatencyMs is not None:
            query = query.where(SysApiLog.latency_ms >= minLatencyMs)
        total = await session.scalar(
            select(func.count()).select_from(query.subquery())
        )
        rows = (
            await session.execute(
                query.order_by(SysApiLog.created_at.desc())
                .offset((page - 1) * pageSize)
                .limit(pageSize)
            )
        ).scalars().all()
        return {
            "success": True,
            "data": [{
                "id": row.id,
                "traceId": row.trace_id,
                "userId": row.user_id,
                "username": row.username,
                "method": row.method,
                "path": row.path,
                "statusCode": row.status_code,
                "success": bool(row.success),
                "latencyMs": row.latency_ms,
                "errorCode": row.error_code,
                "errorMessage": row.error_message,
                "createdAt": row.created_at.isoformat() if row.created_at else None,
            } for row in rows],
            "total": total or 0,
            "page": page,
            "pageSize": pageSize,
        }
