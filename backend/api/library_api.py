"""
圖書館 API：文件 CRUD + 權限設定 + 上傳/下載
靜態知識庫存在 Global DB（台灣 PostgreSQL）+ 台灣 Blob Storage
"""
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import delete, select, update

from core.database import GlobalSessionLocal
from core.permissions import has_permission, require_permission
from core.security import get_current_user_payload
from models.global_models import GlobalLibrary
from models.schemas import (
    LibraryAuthUpdate,
    LibraryDocCreate,
    LibraryDocResponse,
    MessageResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=List[LibraryDocResponse])
async def list_library(payload: dict = Depends(get_current_user_payload)):
    """取得圖書館文件列表（依授權過濾）"""
    email = payload["sub"]
    role = payload.get("role", "user")

    async with GlobalSessionLocal() as session:
        result = await session.execute(
            select(GlobalLibrary).order_by(GlobalLibrary.library_name, GlobalLibrary.name)
        )
        all_docs = result.scalars().all()

    # platform_admin / super_admin 看到全部
    if has_permission(role, "access_all_docs"):
        return [_doc_to_response(d) for d in all_docs]

    # 其他角色依 auth_rules 過濾
    authorized_docs = []
    for doc in all_docs:
        if _check_doc_auth(doc.auth_rules, email, role):
            authorized_docs.append(doc)

    return [_doc_to_response(d) for d in authorized_docs]


@router.get("/all", response_model=List[LibraryDocResponse])
async def list_all_library(
    payload: dict = Depends(require_permission("manage_library")),
):
    """取得所有文件（管理用）"""
    async with GlobalSessionLocal() as session:
        result = await session.execute(
            select(GlobalLibrary).order_by(GlobalLibrary.library_name, GlobalLibrary.name)
        )
        docs = result.scalars().all()

    return [_doc_to_response(d) for d in docs]


@router.post("/upload", response_model=MessageResponse)
async def upload_document(
    library_name: str,
    name: str,
    description: str = "",
    file: UploadFile = File(None),
    payload: dict = Depends(require_permission("manage_library")),
):
    """上傳文件至台灣 Blob Storage"""
    file_url = None

    if file:
        # TODO: 實作 Azure Blob Storage 上傳
        # blob_service = BlobServiceClient.from_connection_string(settings.TW_BLOB_CONNECTION_STRING)
        # container = blob_service.get_container_client(settings.TW_BLOB_CONTAINER)
        # blob_name = f"{library_name}/{file.filename}"
        # await container.upload_blob(blob_name, file.file)
        # file_url = f"https://.../{blob_name}"
        file_url = f"/api/library/files/{file.filename}"
        logger.info(f"[DEV] 文件上傳模擬: {file.filename}")

    async with GlobalSessionLocal() as session:
        doc = GlobalLibrary(
            library_name=library_name,
            name=name,
            description=description,
            metadata_json={"original_filename": file.filename if file else None},
            file_url=file_url,
        )
        session.add(doc)
        await session.commit()
        doc_id = str(doc.doc_id)

    return MessageResponse(message="文件已上傳", detail=doc_id)


@router.delete("/{doc_id}", response_model=MessageResponse)
async def delete_document(
    doc_id: str,
    payload: dict = Depends(require_permission("manage_library")),
):
    """刪除文件"""
    async with GlobalSessionLocal() as session:
        # 取得文件資訊（用於刪除 Blob）
        doc_result = await session.execute(
            select(GlobalLibrary).where(GlobalLibrary.doc_id == doc_id)
        )
        doc = doc_result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="文件不存在")

        # TODO: 刪除 Blob Storage 中的實體檔案

        await session.execute(
            delete(GlobalLibrary).where(GlobalLibrary.doc_id == doc_id)
        )
        await session.commit()

    return MessageResponse(message="文件已刪除")


@router.put("/{doc_id}/auth", response_model=MessageResponse)
async def update_doc_auth(
    doc_id: str,
    body: LibraryAuthUpdate,
    payload: dict = Depends(require_permission("manage_library")),
):
    """更新文件授權規則"""
    if len(body.authorized_users) > 50:
        raise HTTPException(status_code=400, detail="授權使用者不可超過 50 人")

    auth_data = {
        "authorized_roles": body.authorized_roles,
        "authorized_users": body.authorized_users,
        "exception_list": body.exception_list,
    }

    async with GlobalSessionLocal() as session:
        result = await session.execute(
            update(GlobalLibrary)
            .where(GlobalLibrary.doc_id == doc_id)
            .values(auth_rules=auth_data)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="文件不存在")
        await session.commit()

    return MessageResponse(message="文件授權規則已更新")


@router.get("/{doc_id}/download")
async def download_document(
    doc_id: str,
    payload: dict = Depends(get_current_user_payload),
):
    """下載文件（需授權檢查）"""
    email = payload["sub"]
    role = payload.get("role", "user")

    async with GlobalSessionLocal() as session:
        result = await session.execute(
            select(GlobalLibrary).where(GlobalLibrary.doc_id == doc_id)
        )
        doc = result.scalar_one_or_none()

    if not doc:
        raise HTTPException(status_code=404, detail="文件不存在")

    # 權限檢查
    if not has_permission(role, "access_all_docs"):
        if not _check_doc_auth(doc.auth_rules, email, role):
            raise HTTPException(status_code=403, detail="無權存取此文件")

    if not doc.file_url:
        raise HTTPException(status_code=404, detail="文件檔案不存在")

    # TODO: 實作從 Blob Storage 串流下載
    return {"file_url": doc.file_url, "name": doc.name}


# === 內部工具函式 ===

def _doc_to_response(doc: GlobalLibrary) -> LibraryDocResponse:
    return LibraryDocResponse(
        doc_id=str(doc.doc_id),
        library_name=doc.library_name,
        name=doc.name,
        description=doc.description,
        file_url=doc.file_url,
        auth_rules=doc.auth_rules or {},
        created_at=doc.created_at,
    )


def _check_doc_auth(auth_rules: dict, email: str, role: str) -> bool:
    """檢查使用者是否有權存取文件"""
    if not auth_rules:
        return True  # 無授權規則 = 公開

    exception_list = auth_rules.get("exception_list", [])
    if email in exception_list:
        return False

    authorized_users = auth_rules.get("authorized_users", [])
    if authorized_users and email in authorized_users:
        return True

    authorized_roles = auth_rules.get("authorized_roles", [])
    if authorized_roles and role in authorized_roles:
        return True

    # 如果沒有設定任何授權規則（空陣列），視為公開
    if not authorized_users and not authorized_roles:
        return True

    return False
