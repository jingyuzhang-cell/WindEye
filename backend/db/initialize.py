"""Interactive MySQL initializer for WindEye authentication and audit data.

Run from backend/:
    python -m db.initialize --database user
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import re
from datetime import datetime

from sqlalchemy import delete, select, text
from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from db.models import (
    Base,
    SysConfig,
    SysPermission,
    SysRole,
    SysRolePermission,
    SysUser,
    SysUserRole,
)
from db.seed import PERMISSIONS, ROLE_PERMISSION_MAP
from services.auth_service import hash_password

DATABASE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_]+$")

ROLE_DEFINITIONS = [
    ("admin", "管理员", "全部系统权限", 1),
    ("analyst", "分析师", "图谱查询、分析、上传与导出", 2),
    ("auditor", "审核员", "只读访问与审计日志查看", 3),
    ("readonly", "只读用户", "图谱与报告只读访问", 4),
]

CONFIG_DEFINITIONS = [
    ("jwt.access_expire_minutes", "120", "Access Token 过期时间（分钟）"),
    ("jwt.refresh_expire_days", "7", "Refresh Token 过期时间（天）"),
    ("login.max_fail_count", "5", "登录失败最大次数"),
    ("login.lock_duration_minutes", "30", "账号锁定时长（分钟）"),
    ("password.min_length", "8", "密码最小长度"),
    ("password.expire_days", "90", "密码过期天数"),
    ("password.history_count", "5", "密码历史不可重复数量"),
    ("log.retention_days", "180", "日志留存天数"),
    ("log.slow_request_ms", "3000", "慢请求阈值（毫秒）"),
    ("audit.api_log_enabled", "true", "是否启用 API 调用日志"),
    ("audit.operation_log_enabled", "true", "是否启用操作审计日志"),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Initialize WindEye MySQL tables")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3306)
    parser.add_argument("--user", default="root")
    parser.add_argument("--database", default="user")
    parser.add_argument("--admin-username", default="admin")
    return parser.parse_args()


def prompt_secret(label: str) -> str:
    value = getpass.getpass(label)
    if not value:
        raise ValueError(f"{label.strip(': ')}不能为空")
    return value


async def ensure_database(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
    database: str,
) -> None:
    if not DATABASE_NAME_PATTERN.fullmatch(database):
        raise ValueError("数据库名仅允许字母、数字和下划线")

    server_url = URL.create(
        "mysql+asyncmy",
        username=username,
        password=password,
        host=host,
        port=port,
        query={"charset": "utf8mb4"},
    )
    engine = create_async_engine(server_url, pool_pre_ping=True)
    try:
        async with engine.begin() as connection:
            await connection.execute(
                text(
                    f"CREATE DATABASE IF NOT EXISTS `{database}` "
                    "DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
                )
            )
    finally:
        await engine.dispose()


async def initialize_data(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
    database: str,
    admin_username: str,
    admin_password: str,
) -> None:
    database_url = URL.create(
        "mysql+asyncmy",
        username=username,
        password=password,
        host=host,
        port=port,
        database=database,
        query={"charset": "utf8mb4"},
    )
    engine = create_async_engine(database_url, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        async with session_factory() as session:
            role_ids: dict[str, int] = {}
            for code, name, description, sort_order in ROLE_DEFINITIONS:
                role = await session.scalar(
                    select(SysRole).where(SysRole.role_code == code)
                )
                if role is None:
                    role = SysRole(role_code=code)
                    session.add(role)
                role.role_name = name
                role.description = description
                role.sort_order = sort_order
                role.status = 1
                await session.flush()
                role_ids[code] = role.id

            permission_ids: dict[str, int] = {}
            for code, name, perm_type, path, method, sort_order in PERMISSIONS:
                permission = await session.scalar(
                    select(SysPermission).where(SysPermission.perm_code == code)
                )
                if permission is None:
                    permission = SysPermission(perm_code=code)
                    session.add(permission)
                permission.perm_name = name
                permission.perm_type = perm_type
                permission.resource_path = path
                permission.http_method = method
                permission.sort_order = sort_order
                permission.status = 1
                await session.flush()
                permission_ids[code] = permission.id

            await session.execute(delete(SysRolePermission))
            for role_code, permission_codes in ROLE_PERMISSION_MAP.items():
                for permission_code in permission_codes:
                    session.add(
                        SysRolePermission(
                            role_id=role_ids[role_code],
                            permission_id=permission_ids[permission_code],
                        )
                    )

            for key, value, description in CONFIG_DEFINITIONS:
                config = await session.scalar(
                    select(SysConfig).where(SysConfig.config_key == key)
                )
                if config is None:
                    config = SysConfig(config_key=key)
                    session.add(config)
                config.config_value = value
                config.description = description

            admin = await session.scalar(
                select(SysUser).where(SysUser.username == admin_username)
            )
            admin_password_hash = hash_password(admin_password)
            password_updated_at = datetime.utcnow()
            if admin is None:
                admin = SysUser(
                    username=admin_username,
                    password_hash=admin_password_hash,
                    real_name="系统管理员",
                    email="admin@windeye.local",
                    department="系统管理",
                    status=1,
                    deleted=0,
                    password_updated_at=password_updated_at,
                )
                session.add(admin)
                await session.flush()

            admin.password_hash = admin_password_hash
            admin.password_updated_at = password_updated_at
            admin.status = 1
            admin.deleted = 0

            await session.execute(
                delete(SysUserRole).where(SysUserRole.user_id == admin.id)
            )
            session.add(
                SysUserRole(
                    user_id=admin.id,
                    role_id=role_ids["admin"],
                )
            )
            await session.commit()
    finally:
        await engine.dispose()


async def main() -> None:
    args = parse_args()
    database_password = prompt_secret("MySQL 密码: ")
    admin_password = prompt_secret("WindEye 管理员初始密码: ")
    confirm_password = prompt_secret("再次输入管理员初始密码: ")
    if admin_password != confirm_password:
        raise ValueError("两次输入的管理员密码不一致")
    if len(admin_password) < 8:
        raise ValueError("管理员密码至少需要 8 个字符")

    await ensure_database(
        host=args.host,
        port=args.port,
        username=args.user,
        password=database_password,
        database=args.database,
    )
    await initialize_data(
        host=args.host,
        port=args.port,
        username=args.user,
        password=database_password,
        database=args.database,
        admin_username=args.admin_username,
        admin_password=admin_password,
    )
    print("")
    print(f"WindEye MySQL 初始化完成：{args.host}:{args.port}/{args.database}")
    print("已创建 8 张核心表、4 个角色、权限矩阵、系统配置和管理员账号。")


if __name__ == "__main__":
    asyncio.run(main())
