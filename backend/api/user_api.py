"""
使用者管理 API：CRUD + 角色指派 + 停用/啟用
"""
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update, func

from core.database import GlobalSessionLocal
from core.permissions import Role, require_permission
from models.global_models import UserRouteMap
from models.schemas import (
    MessageResponse,
    UserCreate,
    UserListResponse,
    UserRoleUpdate,
    UserStatusUpdate,
    UserUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=List[UserListResponse])
async def list_users(
    role: Optional[str] = Query(None, description="篩選角色"),
    country: Optional[str] = Query(None, description="篩選國家"),
    status: Optional[str] = Query(None, description="篩選狀態"),
    search: Optional[str] = Query(None, description="搜尋姓名或 Email"),
    payload: dict = Depends(require_permission("manage_users")),
):
    """取得使用者列表"""
    async with GlobalSessionLocal() as session:
        query = select(UserRouteMap)

        if role:
            query = query.where(UserRouteMap.role == role)
        if country:
            query = query.where(UserRouteMap.country_code == country)
        if status:
            query = query.where(UserRouteMap.status == status)
        if search:
            query = query.where(
                (UserRouteMap.name.ilike(f"%{search}%")) |
                (UserRouteMap.email.ilike(f"%{search}%"))
            )

        query = query.order_by(UserRouteMap.created_at.desc())
        result = await session.execute(query)
        users = result.scalars().all()

    return [
        UserListResponse(
            email=u.email,
            name=u.name,
            department=u.department,
            country=u.country_code,
            role=u.role,
            status=u.status,
            last_login_at=u.last_login_at,
            created_at=u.created_at,
        )
        for u in users
    ]


@router.post("", response_model=MessageResponse)
async def create_user(
    body: UserCreate,
    payload: dict = Depends(require_permission("manage_users")),
):
    """新增使用者"""
    email = body.email.lower()

    # 驗證角色值
    try:
        Role(body.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"無效的角色: {body.role}")

    async with GlobalSessionLocal() as session:
        # 檢查是否已存在
        existing = await session.execute(
            select(UserRouteMap).where(UserRouteMap.email == email)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="此 Email 已存在")

        new_user = UserRouteMap(
            email=email,
            name=body.name,
            department=body.department,
            country_code=body.country,
            role=body.role,
            status="active",
        )
        session.add(new_user)
        await session.commit()

    logger.info(f"使用者已建立: {email} (角色: {body.role}, 國家: {body.country})")
    return MessageResponse(message="使用者已建立", detail=email)


@router.put("/{email}", response_model=MessageResponse)
async def update_user(
    email: str,
    body: UserUpdate,
    payload: dict = Depends(require_permission("manage_users")),
):
    """編輯使用者"""
    update_data = {}
    if body.name is not None:
        update_data["name"] = body.name
    if body.department is not None:
        update_data["department"] = body.department
    if body.role is not None:
        try:
            Role(body.role)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"無效的角色: {body.role}")
        update_data["role"] = body.role

    if not update_data:
        raise HTTPException(status_code=400, detail="沒有要更新的欄位")

    update_data["updated_at"] = datetime.now(timezone.utc)

    async with GlobalSessionLocal() as session:
        result = await session.execute(
            update(UserRouteMap)
            .where(UserRouteMap.email == email.lower())
            .values(**update_data)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="使用者不存在")
        await session.commit()

    return MessageResponse(message="使用者已更新", detail=email)


@router.patch("/{email}/status", response_model=MessageResponse)
async def update_user_status(
    email: str,
    body: UserStatusUpdate,
    payload: dict = Depends(require_permission("manage_users")),
):
    """停用/啟用帳號"""
    async with GlobalSessionLocal() as session:
        result = await session.execute(
            update(UserRouteMap)
            .where(UserRouteMap.email == email.lower())
            .values(status=body.status, updated_at=datetime.now(timezone.utc))
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="使用者不存在")
        await session.commit()

    action = "啟用" if body.status == "active" else "停用"
    return MessageResponse(message=f"帳號已{action}", detail=email)


@router.patch("/{email}/role", response_model=MessageResponse)
async def update_user_role(
    email: str,
    body: UserRoleUpdate,
    payload: dict = Depends(require_permission("manage_users")),
):
    """角色指派"""
    try:
        Role(body.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"無效的角色: {body.role}")

    async with GlobalSessionLocal() as session:
        result = await session.execute(
            update(UserRouteMap)
            .where(UserRouteMap.email == email.lower())
            .values(role=body.role, updated_at=datetime.now(timezone.utc))
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="使用者不存在")
        await session.commit()

    return MessageResponse(message="角色已更新", detail=f"{email} → {body.role}")
