"""
圖書館 API：文件 CRUD + 權限設定 + 上傳/下載
圖書館存在 Local DB（各國 PostgreSQL），國家隔離
super_admin 可跨國查看（透過 ?country=XX 參數）
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import delete, select, update, func

from config import settings
from core.data_router import data_router
from core.local_database import local_db_factory
from core.permissions import has_permission, require_permission
from core.security import get_current_user_payload
from models.local_models import LocalLibrary
from models.schemas import (
    LibraryAuthUpdate,
    LibraryDocCreate,
    LibraryDocResponse,
    LibraryDocUpdate,
    MessageResponse,
)
from services.storage_service import storage_service

logger = logging.getLogger(__name__)
router = APIRouter()


def _resolve_country(payload: dict, query_country: Optional[str] = None) -> str:
    """
    解析要查詢的國家：
    - super_admin 可透過 query param 指定國家
    - 其他角色只能查自己的國家
    """
    user_country = payload.get("country", "TW")
    role = payload.get("role", "user")

    if query_country and query_country != user_country:
        if role != "super_admin":
            raise HTTPException(status_code=403, detail="只有最高管理者可以跨國查看")
        # 驗證國家是否存在
        if query_country not in settings.LOCAL_DB_CONFIG:
            raise HTTPException(status_code=400, detail=f"國家 [{query_country}] 不存在")
        return query_country

    return user_country


@router.get("", response_model=List[LibraryDocResponse])
async def list_library(
    country: Optional[str] = Query(None, description="國家代碼（僅 super_admin 可跨國）"),
    payload: dict = Depends(get_current_user_payload),
):
    """取得圖書館文件列表（依授權過濾）"""
    email = payload["sub"]
    role = payload.get("role", "user")
    target_country = _resolve_country(payload, country)

    session = await data_router.get_local_pg(target_country)
    try:
        result = await session.execute(
            select(LocalLibrary).order_by(LocalLibrary.library_name, LocalLibrary.name)
        )
        all_docs = result.scalars().all()
    finally:
        await session.close()

    # platform_admin / super_admin 看到全部
    if has_permission(role, "access_all_docs"):
        return [_doc_to_response(d) for d in all_docs]

    # 其他角色依 auth_rules 過濾
    authorized_docs = []
    for doc in all_docs:
        if _check_doc_auth(doc.auth_rules, email, role):
            authorized_docs.append(doc)

    return [_doc_to_response(d) for d in authorized_docs]


@router.get("/latest", response_model=List[LibraryDocResponse])
async def list_latest_library(
    limit: int = Query(4, ge=1, le=20, description="回傳筆數"),
    country: Optional[str] = Query(None, description="國家代碼（僅 super_admin 可跨國）"),
    payload: dict = Depends(get_current_user_payload),
):
    """取得最新的圖書館文件（按建立時間倒序，供首頁展示）"""
    email = payload["sub"]
    role = payload.get("role", "user")
    target_country = _resolve_country(payload, country)

    session = await data_router.get_local_pg(target_country)
    try:
        result = await session.execute(
            select(LocalLibrary).order_by(LocalLibrary.created_at.desc())
        )
        all_docs = result.scalars().all()
    finally:
        await session.close()

    # 權限過濾
    if has_permission(role, "access_all_docs"):
        filtered = all_docs
    else:
        filtered = [d for d in all_docs if _check_doc_auth(d.auth_rules, email, role)]

    # 取前 N 筆
    return [_doc_to_response(d) for d in filtered[:limit]]


@router.get("/all", response_model=List[LibraryDocResponse])
async def list_all_library(
    country: Optional[str] = Query(None, description="國家代碼（僅 super_admin 可跨國）"),
    payload: dict = Depends(require_permission("manage_library")),
):
    """取得所有文件（管理用）"""
    target_country = _resolve_country(payload, country)

    session = await data_router.get_local_pg(target_country)
    try:
        result = await session.execute(
            select(LocalLibrary).order_by(LocalLibrary.library_name, LocalLibrary.name)
        )
        docs = result.scalars().all()
    finally:
        await session.close()

    return [_doc_to_response(d) for d in docs]


@router.post("/upload", response_model=MessageResponse)
async def upload_document(
    request: Request,
    library_name: str = Query(..., description="館名"),
    name: str = Query(..., description="文件名稱"),
    description: str = Query("", description="文件描述"),
    country: Optional[str] = Query(None, description="國家代碼（僅 super_admin 可跨國）"),
    payload: dict = Depends(require_permission("manage_library")),
):
    """上傳文件至本國圖書館（支援多檔案）"""
    target_country = _resolve_country(payload, country)

    # 先建立 DB 記錄
    session = await data_router.get_local_pg(target_country)
    try:
        doc = LocalLibrary(
            library_name=library_name,
            name=name,
            description=description,
            metadata_json={},
            file_url=None,
            files_json=[],
        )
        session.add(doc)
        await session.commit()
        await session.refresh(doc)
        doc_id = str(doc.doc_id)
    finally:
        await session.close()

    # 處理多檔案上傳
    files_info = []
    first_file_url = None
    content_type_header = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type_header:
        try:
            form = await request.form()
            # 取得所有名為 "file" 的上傳檔案
            for key in form:
                if key == "file":
                    uploaded_file = form[key]
                    if hasattr(uploaded_file, 'filename') and uploaded_file.filename:
                        result = await storage_service.save_file(
                            target_country, "library", doc_id, uploaded_file
                        )
                        files_info.append({
                            "filename": result["original_filename"],
                            "relative_path": result["relative_path"],
                            "file_size": result["file_size"],
                        })
                        if first_file_url is None:
                            first_file_url = result["relative_path"]

            # form.getlist 方式取得多個同名欄位
            if not files_info:
                uploaded_files = form.getlist("file")
                for uploaded_file in uploaded_files:
                    if hasattr(uploaded_file, 'filename') and uploaded_file.filename:
                        result = await storage_service.save_file(
                            target_country, "library", doc_id, uploaded_file
                        )
                        files_info.append({
                            "filename": result["original_filename"],
                            "relative_path": result["relative_path"],
                            "file_size": result["file_size"],
                        })
                        if first_file_url is None:
                            first_file_url = result["relative_path"]
        except Exception as e:
            logger.warning(f"檔案上傳失敗: {e}")

    # 更新 DB
    if files_info:
        session = await data_router.get_local_pg(target_country)
        try:
            await session.execute(
                update(LocalLibrary)
                .where(LocalLibrary.doc_id == doc_id)
                .values(
                    file_url=first_file_url,
                    files_json=files_info,
                    metadata_json={
                        "file_count": len(files_info),
                        "total_size": sum(f["file_size"] for f in files_info),
                        "original_filename": files_info[0]["filename"] if files_info else None,
                    },
                )
            )
            await session.commit()
        finally:
            await session.close()

    return MessageResponse(message="文件已上傳", detail=doc_id)


@router.delete("/by-library/{library_name}", response_model=MessageResponse)
async def delete_library(
    library_name: str,
    country: Optional[str] = Query(None, description="國家代碼（僅 super_admin 可跨國）"),
    payload: dict = Depends(require_permission("manage_library")),
):
    """刪除整個館（僅限空館）"""
    target_country = _resolve_country(payload, country)

    session = await data_router.get_local_pg(target_country)
    try:
        # 檢查該館下是否還有文件
        result = await session.execute(
            select(func.count()).select_from(LocalLibrary).where(
                LocalLibrary.library_name == library_name
            )
        )
        doc_count = result.scalar()

        if doc_count is None or doc_count == 0:
            # 確認館名是否曾經存在（doc_count == 0 可能代表館已空或從未存在）
            # 由於館名不是獨立的表，doc_count == 0 表示該館已經沒有文件
            # 回傳成功（館名自然消失）
            pass
        elif doc_count > 0:
            raise HTTPException(
                status_code=400,
                detail=f"無法刪除：館「{library_name}」中還有 {doc_count} 個文件，請先刪除所有文件"
            )
    finally:
        await session.close()

    return MessageResponse(message=f"館「{library_name}」已刪除")


@router.delete("/{doc_id}", response_model=MessageResponse)
async def delete_document(
    doc_id: str,
    country: Optional[str] = Query(None, description="國家代碼（僅 super_admin 可跨國）"),
    payload: dict = Depends(require_permission("manage_library")),
):
    """刪除文件"""
    target_country = _resolve_country(payload, country)

    session = await data_router.get_local_pg(target_country)
    try:
        # 取得文件資訊
        doc_result = await session.execute(
            select(LocalLibrary).where(LocalLibrary.doc_id == doc_id)
        )
        doc = doc_result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="文件不存在")

        await session.execute(
            delete(LocalLibrary).where(LocalLibrary.doc_id == doc_id)
        )
        await session.commit()
    finally:
        await session.close()

    # 刪除實體檔案
    storage_service.delete_files(target_country, "library", doc_id)

    return MessageResponse(message="文件已刪除")


@router.put("/{doc_id}", response_model=MessageResponse)
async def update_document(
    doc_id: str,
    body: LibraryDocUpdate,
    country: Optional[str] = Query(None, description="國家代碼（僅 super_admin 可跨國）"),
    payload: dict = Depends(require_permission("manage_library")),
):
    """編輯文件資訊（名稱、描述、館名）"""
    target_country = _resolve_country(payload, country)

    update_data = {}
    if body.name is not None:
        update_data["name"] = body.name
    if body.description is not None:
        update_data["description"] = body.description
    if body.library_name is not None:
        update_data["library_name"] = body.library_name

    if not update_data:
        raise HTTPException(status_code=400, detail="沒有要更新的欄位")

    session = await data_router.get_local_pg(target_country)
    try:
        result = await session.execute(
            update(LocalLibrary)
            .where(LocalLibrary.doc_id == doc_id)
            .values(**update_data)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="文件不存在")
        await session.commit()
    finally:
        await session.close()

    return MessageResponse(message="文件資訊已更新")


@router.delete("/{doc_id}/file", response_model=MessageResponse)
async def delete_document_file(
    doc_id: str,
    filename: str = Query(..., description="要刪除的附件檔名"),
    country: Optional[str] = Query(None, description="國家代碼（僅 super_admin 可跨國）"),
    payload: dict = Depends(require_permission("manage_library")),
):
    """刪除文件的單一附件"""
    target_country = _resolve_country(payload, country)

    # 取得文件
    session = await data_router.get_local_pg(target_country)
    try:
        result = await session.execute(
            select(LocalLibrary).where(LocalLibrary.doc_id == doc_id)
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="文件不存在")

        current_files = list(doc.files_json or [])
    finally:
        await session.close()

    # 找到並移除指定 filename 的 entry
    file_entry = next((f for f in current_files if f.get("filename") == filename), None)
    if not file_entry:
        raise HTTPException(status_code=404, detail=f"找不到附件：{filename}")

    current_files.remove(file_entry)

    # 刪除實體檔案
    storage_service.delete_single_file(target_country, "library", doc_id, filename)

    # 更新 DB
    new_file_url = None
    if current_files:
        new_file_url = current_files[0].get("relative_path")

    session = await data_router.get_local_pg(target_country)
    try:
        await session.execute(
            update(LocalLibrary)
            .where(LocalLibrary.doc_id == doc_id)
            .values(
                files_json=current_files,
                file_url=new_file_url,
                metadata_json={
                    "file_count": len(current_files),
                    "total_size": sum(f.get("file_size", 0) for f in current_files),
                    "original_filename": current_files[0]["filename"] if current_files else None,
                },
            )
        )
        await session.commit()
    finally:
        await session.close()

    return MessageResponse(message=f"附件「{filename}」已刪除")


@router.post("/{doc_id}/upload-file", response_model=MessageResponse)
async def upload_document_file(
    doc_id: str,
    request: Request,
    country: Optional[str] = Query(None, description="國家代碼（僅 super_admin 可跨國）"),
    payload: dict = Depends(require_permission("manage_library")),
):
    """追加上傳附件到已有文件（支援多檔案）"""
    target_country = _resolve_country(payload, country)

    # 驗證文件存在
    session = await data_router.get_local_pg(target_country)
    try:
        result = await session.execute(
            select(LocalLibrary).where(LocalLibrary.doc_id == doc_id)
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="文件不存在")

        current_files = list(doc.files_json or [])
        current_file_url = doc.file_url
    finally:
        await session.close()

    # 處理多檔案上傳
    new_files = []
    content_type_header = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type_header:
        try:
            form = await request.form()
            # 取得所有名為 "file" 的上傳檔案
            uploaded_files = form.getlist("file")
            if not uploaded_files:
                single_file = form.get("file")
                if single_file and hasattr(single_file, 'filename') and single_file.filename:
                    uploaded_files = [single_file]

            for uploaded_file in uploaded_files:
                if hasattr(uploaded_file, 'filename') and uploaded_file.filename:
                    file_result = await storage_service.save_file(
                        target_country, "library", doc_id, uploaded_file
                    )
                    new_files.append({
                        "filename": file_result["original_filename"],
                        "relative_path": file_result["relative_path"],
                        "file_size": file_result["file_size"],
                    })
        except Exception as e:
            logger.warning(f"追加附件上傳失敗: {e}")
            raise HTTPException(status_code=500, detail=f"檔案上傳失敗: {str(e)}")

    if not new_files:
        raise HTTPException(status_code=400, detail="未收到任何檔案")

    # 追加到 files_json
    current_files.extend(new_files)

    # 更新 file_url（如果原本沒有檔案）
    if not current_file_url and current_files:
        current_file_url = current_files[0].get("relative_path")

    # 更新 DB
    session = await data_router.get_local_pg(target_country)
    try:
        await session.execute(
            update(LocalLibrary)
            .where(LocalLibrary.doc_id == doc_id)
            .values(
                file_url=current_file_url,
                files_json=current_files,
                metadata_json={
                    "file_count": len(current_files),
                    "total_size": sum(f.get("file_size", 0) for f in current_files),
                    "original_filename": current_files[0]["filename"] if current_files else None,
                },
            )
        )
        await session.commit()
    finally:
        await session.close()

    uploaded_names = [f["filename"] for f in new_files]
    return MessageResponse(
        message=f"已追加上傳 {len(new_files)} 個附件",
        detail=", ".join(uploaded_names),
    )


@router.put("/{doc_id}/auth", response_model=MessageResponse)
async def update_doc_auth(
    doc_id: str,
    body: LibraryAuthUpdate,
    country: Optional[str] = Query(None, description="國家代碼（僅 super_admin 可跨國）"),
    payload: dict = Depends(require_permission("manage_library")),
):
    """更新文件授權規則"""
    target_country = _resolve_country(payload, country)

    if len(body.authorized_users) > 50:
        raise HTTPException(status_code=400, detail="授權使用者不可超過 50 人")

    auth_data = {
        "authorized_roles": body.authorized_roles,
        "authorized_users": body.authorized_users,
        "exception_list": body.exception_list,
    }

    session = await data_router.get_local_pg(target_country)
    try:
        result = await session.execute(
            update(LocalLibrary)
            .where(LocalLibrary.doc_id == doc_id)
            .values(auth_rules=auth_data)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="文件不存在")
        await session.commit()
    finally:
        await session.close()

    return MessageResponse(message="文件授權規則已更新")


@router.get("/{doc_id}/download")
async def download_document(
    doc_id: str,
    filename: Optional[str] = Query(None, description="指定下載的檔案名稱（多檔案時使用）"),
    country: Optional[str] = Query(None, description="國家代碼（僅 super_admin 可跨國）"),
    payload: dict = Depends(get_current_user_payload),
):
    """下載文件（需授權檢查，支援指定檔名下載）"""
    email = payload["sub"]
    role = payload.get("role", "user")
    target_country = _resolve_country(payload, country)

    session = await data_router.get_local_pg(target_country)
    try:
        result = await session.execute(
            select(LocalLibrary).where(LocalLibrary.doc_id == doc_id)
        )
        doc = result.scalar_one_or_none()
    finally:
        await session.close()

    if not doc:
        raise HTTPException(status_code=404, detail="文件不存在")

    # 權限檢查
    if not has_permission(role, "access_all_docs"):
        if not _check_doc_auth(doc.auth_rules, email, role):
            raise HTTPException(status_code=403, detail="無權存取此文件")

    if not doc.file_url and not doc.files_json:
        raise HTTPException(status_code=404, detail="文件檔案不存在")

    # 決定要下載哪個檔案
    if filename:
        target_filename = filename
    else:
        # 向後相容：從 metadata 取得原始檔名
        metadata = doc.metadata_json or {}
        target_filename = metadata.get("original_filename", doc.name)

    # 取得實體檔案路徑
    file_path = storage_service.get_file_path(target_country, "library", str(doc.doc_id), target_filename)
    if not file_path:
        raise HTTPException(status_code=404, detail="實體檔案不存在")

    return FileResponse(
        path=str(file_path),
        filename=target_filename,
        media_type="application/octet-stream",
    )


@router.get("/{doc_id}/preview")
async def preview_document(
    doc_id: str,
    filename: Optional[str] = Query(None, description="指定預覽的檔案名稱（多檔案時使用）"),
    country: Optional[str] = Query(None, description="國家代碼（僅 super_admin 可跨國）"),
    payload: dict = Depends(get_current_user_payload),
):
    """預覽文件（僅支援 PDF，回傳 application/pdf 供 iframe 嵌入）"""
    email = payload["sub"]
    role = payload.get("role", "user")
    target_country = _resolve_country(payload, country)

    session = await data_router.get_local_pg(target_country)
    try:
        result = await session.execute(
            select(LocalLibrary).where(LocalLibrary.doc_id == doc_id)
        )
        doc = result.scalar_one_or_none()
    finally:
        await session.close()

    if not doc:
        raise HTTPException(status_code=404, detail="文件不存在")

    # 權限檢查
    if not has_permission(role, "access_all_docs"):
        if not _check_doc_auth(doc.auth_rules, email, role):
            raise HTTPException(status_code=403, detail="無權存取此文件")

    # 決定要預覽哪個檔案
    if filename:
        target_filename = filename
    else:
        # 預設預覽第一個檔案
        files = doc.files_json or []
        if files:
            target_filename = files[0].get("filename")
        else:
            metadata = doc.metadata_json or {}
            target_filename = metadata.get("original_filename", doc.name)

    if not target_filename:
        raise HTTPException(status_code=404, detail="無可預覽的檔案")

    # 僅支援 PDF 預覽
    if not target_filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail=f"不支援預覽此檔案格式：{target_filename}（僅支援 PDF）"
        )

    file_path = storage_service.get_file_path(
        target_country, "library", str(doc.doc_id), target_filename
    )
    if not file_path:
        raise HTTPException(status_code=404, detail="實體檔案不存在")

    return FileResponse(
        path=str(file_path),
        filename=target_filename,
        media_type="application/pdf",
    )


# === 內部工具函式 ===

def _doc_to_response(doc: LocalLibrary) -> LibraryDocResponse:
    return LibraryDocResponse(
        doc_id=str(doc.doc_id),
        library_name=doc.library_name,
        name=doc.name,
        description=doc.description,
        file_url=doc.file_url,
        files=doc.files_json or [],
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
