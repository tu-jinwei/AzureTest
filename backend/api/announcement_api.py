"""
公告 API：CRUD + 發布/取消發布
公告存在 Local DB（各國 PostgreSQL）
"""
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select, update

from core.data_router import data_router
from core.permissions import require_permission
from core.security import get_current_user_payload
from models.local_models import LocalNotice
from models.schemas import (
    AnnouncementCreate,
    AnnouncementResponse,
    AnnouncementUpdate,
    MessageResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=List[AnnouncementResponse])
async def list_announcements(payload: dict = Depends(get_current_user_payload)):
    """取得公告列表（已發布的）"""
    country = payload.get("country", "TW")
    session = await data_router.get_local_pg(country)
    try:
        result = await session.execute(
            select(LocalNotice)
            .where(LocalNotice.publish_status == "published")
            .order_by(LocalNotice.created_at.desc())
        )
        notices = result.scalars().all()
        return [_notice_to_response(n) for n in notices]
    finally:
        await session.close()


@router.get("/all", response_model=List[AnnouncementResponse])
async def list_all_announcements(
    payload: dict = Depends(require_permission("manage_announcements")),
):
    """取得所有公告（含未發布，管理用）"""
    country = payload.get("country", "TW")
    session = await data_router.get_local_pg(country)
    try:
        result = await session.execute(
            select(LocalNotice).order_by(LocalNotice.created_at.desc())
        )
        notices = result.scalars().all()
        return [_notice_to_response(n) for n in notices]
    finally:
        await session.close()


@router.post("", response_model=MessageResponse)
async def create_announcement(
    body: AnnouncementCreate,
    payload: dict = Depends(require_permission("manage_announcements")),
):
    """新增公告"""
    country = payload.get("country", "TW")
    session = await data_router.get_local_pg(country)
    try:
        notice = LocalNotice(
            subject=body.subject,
            content_en=body.content_en,
            files=body.files or [],
            publish_status=body.publish_status,
        )
        session.add(notice)
        await session.commit()
        return MessageResponse(message="公告已新增", detail=str(notice.notice_id))
    finally:
        await session.close()


@router.put("/{notice_id}", response_model=MessageResponse)
async def update_announcement(
    notice_id: str,
    body: AnnouncementUpdate,
    payload: dict = Depends(require_permission("manage_announcements")),
):
    """編輯公告"""
    country = payload.get("country", "TW")
    update_data = {}
    if body.subject is not None:
        update_data["subject"] = body.subject
    if body.content_en is not None:
        update_data["content_en"] = body.content_en
    if body.publish_status is not None:
        update_data["publish_status"] = body.publish_status
    if body.files is not None:
        update_data["files"] = body.files

    if not update_data:
        raise HTTPException(status_code=400, detail="沒有要更新的欄位")

    session = await data_router.get_local_pg(country)
    try:
        result = await session.execute(
            update(LocalNotice)
            .where(LocalNotice.notice_id == notice_id)
            .values(**update_data)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="公告不存在")
        await session.commit()
        return MessageResponse(message="公告已更新")
    finally:
        await session.close()


@router.delete("/{notice_id}", response_model=MessageResponse)
async def delete_announcement(
    notice_id: str,
    payload: dict = Depends(require_permission("manage_announcements")),
):
    """刪除公告"""
    country = payload.get("country", "TW")
    session = await data_router.get_local_pg(country)
    try:
        result = await session.execute(
            delete(LocalNotice).where(LocalNotice.notice_id == notice_id)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="公告不存在")
        await session.commit()
        return MessageResponse(message="公告已刪除")
    finally:
        await session.close()


def _notice_to_response(notice: LocalNotice) -> AnnouncementResponse:
    return AnnouncementResponse(
        notice_id=str(notice.notice_id),
        subject=notice.subject,
        content_en=notice.content_en,
        files=notice.files or [],
        publish_status=notice.publish_status,
        created_at=notice.created_at,
        updated_at=notice.updated_at,
    )
