"""
角色權限定義與檢查
"""
from enum import Enum
from functools import wraps
from typing import List

from fastapi import Depends, HTTPException, status

from core.security import get_current_user_payload


class Role(str, Enum):
    SUPER_ADMIN = "super_admin"
    PLATFORM_ADMIN = "platform_admin"
    USER_MANAGER = "user_manager"
    LIBRARY_MANAGER = "library_manager"
    USER = "user"


ROLE_LABELS = {
    Role.SUPER_ADMIN: "台灣最高管理者",
    Role.PLATFORM_ADMIN: "平台管理者",
    Role.USER_MANAGER: "用戶管理者",
    Role.LIBRARY_MANAGER: "圖書館管理者",
    Role.USER: "一般使用者",
}

ROLE_PERMISSIONS = {
    Role.SUPER_ADMIN: [
        "view_announcements", "use_agents", "view_library", "chat_history",
        "manage_users", "manage_library", "manage_announcements",
        "manage_agent_permissions", "access_all_agents", "access_all_docs",
        "cross_country_logs",
    ],
    Role.PLATFORM_ADMIN: [
        "view_announcements", "use_agents", "view_library", "chat_history",
        "manage_users", "manage_library", "manage_announcements",
        "manage_agent_permissions", "access_all_agents", "access_all_docs",
    ],
    Role.USER_MANAGER: [
        "view_announcements", "use_agents", "view_library", "chat_history",
        "manage_users",
    ],
    Role.LIBRARY_MANAGER: [
        "view_announcements", "use_agents", "view_library", "chat_history",
        "manage_library",
    ],
    Role.USER: [
        "view_announcements", "use_agents", "view_library", "chat_history",
    ],
}


def has_permission(role: str, permission: str) -> bool:
    """檢查角色是否有特定權限"""
    try:
        role_enum = Role(role)
    except ValueError:
        return False
    return permission in ROLE_PERMISSIONS.get(role_enum, [])


def get_role_permissions(role: str) -> List[str]:
    """取得角色的所有權限"""
    try:
        role_enum = Role(role)
    except ValueError:
        return []
    return ROLE_PERMISSIONS.get(role_enum, [])


def require_permission(permission: str):
    """
    權限檢查 Dependency 工廠
    用法：
        @router.get("/api/users")
        async def list_users(
            payload: dict = Depends(require_permission("manage_users"))
        ):
    """
    async def _check_permission(
        payload: dict = Depends(get_current_user_payload),
    ) -> dict:
        role = payload.get("role", "user")
        if not has_permission(role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"權限不足：需要 [{permission}] 權限",
            )
        return payload

    return _check_permission


def require_any_permission(*permissions: str):
    """
    多權限檢查（任一符合即可）
    用法：
        @router.get("/api/audit/logs")
        async def get_logs(
            payload: dict = Depends(require_any_permission("manage_users", "cross_country_logs"))
        ):
    """
    async def _check_any_permission(
        payload: dict = Depends(get_current_user_payload),
    ) -> dict:
        role = payload.get("role", "user")
        for perm in permissions:
            if has_permission(role, perm):
                return payload
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"權限不足：需要以下任一權限 {list(permissions)}",
        )

    return _check_any_permission
