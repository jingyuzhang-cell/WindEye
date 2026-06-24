"""Seed script — initializes admin user, roles, permissions, and role-permission mapping.

Usage:
    python -m db.seed          # inside backend/ directory
    python db/seed.py          # from backend/ directory

Requires MySQL to be running and the schema.sql to have been executed first.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select, text

from db import MySQLClient
from db.models import (
    Base, SysPermission, SysRole, SysRolePermission, SysUser, SysUserRole,
)
from services.auth_service import hash_password

logger = logging.getLogger(__name__)

# ── Permission seed data ──────────────────────────────────────────────

PERMISSIONS = [
    # (perm_code, perm_name, perm_type, resource_path, http_method, sort_order)
    # System monitor
    ("system:monitor:view", "查看系统监控", "page", "/system/admin", "GET", 10),
    # User management
    ("admin:user:view", "查看用户列表", "api", "/api/v1/admin/users", "GET", 20),
    ("admin:user:create", "创建用户", "api", "/api/v1/admin/users", "POST", 21),
    ("admin:user:update", "修改用户", "api", "/api/v1/admin/users/*", "PUT", 22),
    ("admin:user:disable", "禁用/启用用户", "api", "/api/v1/admin/users/*/status", "PATCH", 23),
    ("admin:user:delete", "删除用户", "api", "/api/v1/admin/users/*", "DELETE", 24),
    # Role management
    ("admin:role:view", "查看角色列表", "api", "/api/v1/admin/roles", "GET", 30),
    ("admin:role:assign", "分配角色权限", "api", "/api/v1/admin/roles/*/permissions", "POST", 31),
    # Graph
    ("graph:search:view", "图谱关键词搜索", "api", "/api/v1/graph/search-all", "POST", 40),
    ("graph:search:export", "导出图谱查询结果", "button", "/api/v1/graph/export", "POST", 41),
    ("graph:expand:view", "图谱节点扩展", "api", "/api/v1/graph/expand", "POST", 42),
    # Governance
    ("governance:report:create", "生成治理报告", "api", "/api/v1/governance/reports", "POST", 50),
    ("governance:report:export", "导出治理报告", "api", "/api/v1/risk/reports/export-docx", "POST", 51),
    ("governance:report:delete", "删除治理报告", "api", "/api/v1/risk/reports/*", "DELETE", 52),
    # Audit logs
    ("audit:operation-log:view", "查看操作日志", "api", "/api/v1/admin/audit-logs", "GET", 60),
    ("audit:api-log:view", "查看API日志", "api", "/api/v1/admin/api-logs", "GET", 61),
    # Data
    ("data:upload", "上传文件", "api", "/api/v1/chat/upload", "POST", 70),
    # Pipeline
    ("pipeline:manage", "管理采集流水线", "api", "/api/v1/pipeline/*", "*", 80),
]

# ── Role <-> Permission mapping ───────────────────────────────────────
# Role codes → list of permission codes

ROLE_PERMISSION_MAP = {
    "admin": [
        # Admin has ALL permissions
        p[0] for p in PERMISSIONS
    ],
    "analyst": [
        "graph:search:view", "graph:search:export", "graph:expand:view",
        "governance:report:create", "governance:report:export",
        "data:upload", "pipeline:manage",
    ],
    "auditor": [
        "admin:user:view", "admin:role:view",
        "graph:search:view", "graph:expand:view",
        "audit:operation-log:view", "audit:api-log:view",
    ],
    "readonly": [
        "graph:search:view", "graph:expand:view",
    ],
}


async def seed():
    """Run the seed process."""
    logger.info("Starting seed...")

    client = MySQLClient.from_env()

    # 1. Create tables if they don't exist
    logger.info("Creating tables...")
    async with client._session_factory() as session:
        async with session.bind.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    logger.info("Tables created (or already exist).")

    # 2. Seed roles
    logger.info("Seeding roles...")
    roles_map: dict[str, SysRole] = {}
    async with client._session_factory() as session:
        for code, name, desc, sort in [
            ("admin", "管理员", "全部系统权限", 1),
            ("analyst", "分析师", "可查询图谱、运行分析、导出报告、上传数据", 2),
            ("auditor", "审核员", "只读访问全部数据，可查看操作日志和API日志", 3),
            ("readonly", "只读用户", "只读访问图谱查询和报告查看", 4),
        ]:
            result = await session.execute(
                select(SysRole).where(SysRole.role_code == code)
            )
            role = result.scalar_one_or_none()
            if role is None:
                role = SysRole(
                    role_code=code, role_name=name,
                    description=desc, sort_order=sort,
                )
                session.add(role)
            else:
                role.role_name = name
                role.description = desc
                role.sort_order = sort
            roles_map[code] = role
        await session.commit()
    logger.info(f"Seeded {len(roles_map)} roles.")

    # 3. Seed permissions
    logger.info("Seeding permissions...")
    perm_map: dict[str, SysPermission] = {}
    async with client._session_factory() as session:
        for code, name, ptype, path, method, sort in PERMISSIONS:
            result = await session.execute(
                select(SysPermission).where(SysPermission.perm_code == code)
            )
            perm = result.scalar_one_or_none()
            if perm is None:
                perm = SysPermission(
                    perm_code=code, perm_name=name, perm_type=ptype,
                    resource_path=path, http_method=method, sort_order=sort,
                )
                session.add(perm)
            else:
                perm.perm_name = name
                perm.perm_type = ptype
                perm.resource_path = path
                perm.http_method = method
                perm.sort_order = sort
            perm_map[code] = perm
        await session.commit()
    logger.info(f"Seeded {len(perm_map)} permissions.")

    # 4. Seed role-permission mappings
    logger.info("Seeding role-permission mappings...")
    async with client._session_factory() as session:
        # Flush role and perm objects to get their IDs
        for code, role in roles_map.items():
            await session.refresh(role)
        for code, perm in perm_map.items():
            await session.refresh(perm)

        # Delete existing mappings for clean state
        await session.execute(text("DELETE FROM sys_role_permission"))

        for role_code, perm_codes in ROLE_PERMISSION_MAP.items():
            role = roles_map[role_code]
            for perm_code in perm_codes:
                perm = perm_map.get(perm_code)
                if perm:
                    rp = SysRolePermission(role_id=role.id, permission_id=perm.id)
                    session.add(rp)
        await session.commit()
    logger.info("Role-permission mappings seeded.")

    # 5. Create admin user (username: admin, password: admin)
    logger.info("Creating admin user...")
    async with client._session_factory() as session:
        result = await session.execute(
            select(SysUser).where(SysUser.username == "admin")
        )
        admin = result.scalar_one_or_none()
        if admin is None:
            admin = SysUser(
                username="admin",
                password_hash=hash_password("admin"),
                real_name="系统管理员",
                email="admin@windeye.local",
                department="技术部",
                status=1,
                password_updated_at=datetime.utcnow(),
            )
            session.add(admin)
            await session.flush()
            await session.refresh(admin)

            # Assign admin role
            admin_role = roles_map["admin"]
            await session.refresh(admin_role)
            user_role = SysUserRole(user_id=admin.id, role_id=admin_role.id)
            session.add(user_role)
            await session.commit()
            logger.info("Admin user created (username=admin, password=admin).")
        else:
            logger.info("Admin user already exists — skipped.")
            # Ensure admin role is assigned
            admin_role = roles_map["admin"]
            await session.refresh(admin_role)
            result = await session.execute(
                select(SysUserRole).where(
                    SysUserRole.user_id == admin.id,
                    SysUserRole.role_id == admin_role.id,
                )
            )
            if result.scalar_one_or_none() is None:
                user_role = SysUserRole(user_id=admin.id, role_id=admin_role.id)
                session.add(user_role)
                await session.commit()
                logger.info("Admin role assigned to existing admin user.")

    await client.close()
    logger.info("Seed complete! Default login: admin / admin")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(seed())
