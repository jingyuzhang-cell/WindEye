"""Pydantic request/response schemas for admin user/role/permission APIs."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


# ── User schemas ─────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=64, description="用户名")
    password: str = Field(..., min_length=8, max_length=64, description="密码")
    realName: str | None = Field(default=None, alias="realName", description="真实姓名")
    email: str | None = None
    phone: str | None = None
    department: str | None = None
    roleIds: list[int] = Field(default_factory=list, alias="roleIds", description="角色ID列表")

    model_config = ConfigDict(populate_by_name=True)


class UserUpdate(BaseModel):
    realName: str | None = Field(default=None, alias="realName")
    email: str | None = None
    phone: str | None = None
    department: str | None = None
    roleIds: list[int] | None = Field(default=None, alias="roleIds")

    model_config = ConfigDict(populate_by_name=True)


class UserStatusPatch(BaseModel):
    status: int = Field(..., ge=0, le=2, description="1=active, 0=disabled, 2=locked")

    model_config = ConfigDict(populate_by_name=True)


class PasswordReset(BaseModel):
    newPassword: str = Field(..., min_length=8, max_length=64, alias="newPassword")

    model_config = ConfigDict(populate_by_name=True)


class RoleInfo(BaseModel):
    id: int
    roleCode: str
    roleName: str


class RoleCreate(BaseModel):
    roleCode: str = Field(..., min_length=2, max_length=64, alias="roleCode", description="角色编码")
    roleName: str = Field(..., min_length=2, max_length=128, alias="roleName", description="角色名称")
    description: str | None = None
    status: int = Field(default=1, ge=0, le=1)
    sortOrder: int = Field(default=0, ge=0, le=9999, alias="sortOrder")

    model_config = ConfigDict(populate_by_name=True)


class RoleUpdate(BaseModel):
    roleName: str | None = Field(default=None, min_length=2, max_length=128, alias="roleName")
    description: str | None = None
    status: int | None = Field(default=None, ge=0, le=1)
    sortOrder: int | None = Field(default=None, ge=0, le=9999, alias="sortOrder")

    model_config = ConfigDict(populate_by_name=True)


class ConfigItemUpdate(BaseModel):
    configKey: str = Field(..., min_length=2, max_length=128, alias="configKey")
    configValue: str = Field(default="", max_length=2048, alias="configValue")
    description: str | None = Field(default=None, max_length=512)

    model_config = ConfigDict(populate_by_name=True)


class ConfigUpdate(BaseModel):
    items: list[ConfigItemUpdate] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class UserResponse(BaseModel):
    id: int
    username: str
    realName: str | None = None
    email: str | None = None
    phone: str | None = None
    avatar: str | None = None
    department: str | None = None
    status: int
    failedLoginCount: int | None = 0
    lockedUntil: str | None = None
    lastLoginAt: str | None = None
    lastLoginIp: str | None = None
    passwordUpdatedAt: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None
    roles: list[RoleInfo] = []

    model_config = ConfigDict(populate_by_name=True)


class UserListResponse(BaseModel):
    data: list[UserResponse]
    total: int
    page: int
    pageSize: int
    success: bool = True


# ── Login schemas ────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)
    autoLogin: bool = Field(default=False, alias="autoLogin")
    type: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class LoginResponse(BaseModel):
    status: str = "ok"
    type: str = "account"
    currentAuthority: str = "admin"
    accessToken: str | None = None
    refreshToken: str | None = None
    expiresIn: int | None = None


class CurrentUserData(BaseModel):
    name: str
    userid: str
    email: str | None = None
    phone: str | None = None
    avatar: str | None = None
    department: str | None = None
    access: str = "admin"
    roles: list[RoleInfo] = []
    permissions: list[str] = []


class CurrentUserResponse(BaseModel):
    success: bool = True
    data: CurrentUserData | None = None


# ── Refresh token schema ─────────────────────────────────────────────

class RefreshRequest(BaseModel):
    refreshToken: str = Field(..., alias="refreshToken")

    model_config = ConfigDict(populate_by_name=True)


class RefreshResponse(BaseModel):
    success: bool = True
    accessToken: str
    expiresIn: int
