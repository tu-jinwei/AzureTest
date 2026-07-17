"""
全域圖書館管理 API（管理端）
- 文件上傳、編輯、刪除
- 分發規則管理（哪些國家能看、放哪個館、各國存取規則）
- 全域館目錄管理
- 需要 manage_library 權限（root / admin）
"""
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy import delete, select, update, func, and_

from core.database import GlobalSessionLocal
from core.permissions import require_permission, has_permission
from core.security import get_current_user_payload
from models.global_models import GlobalDocument, GlobalDocumentDistribution, GlobalCatalog
from models.schemas import (
    AuthRules,
    DistributionRule,
    DistributionRuleResponse,
    GlobalDocCreate,
    GlobalDocUpdate,
    GlobalDocResponse,
    GlobalDocListResponse,
    GlobalCatalogCreate,
    GlobalCatalogUpdate,
    GlobalCatalogResponse,
    MessageResponse,
)
from services.storage_service import storage_service
from services.pii_service import get_pii_service
from utils.audit_logger import audit_log, AuditAction

logger = logging.getLogger(__name__)
router = APIRouter()

GLOBAL_COUNTRY = "global"  # 全域文件的 storage country_code


# ===== 工具函式 =====

def _dist_to_response(dist: GlobalDocumentDistribution) -> DistributionRuleResponse:
    return DistributionRuleResponse(
        id=str(dist.id),
        doc_id=str(dist.doc_id),
        country_code=dist.country_code,
        catalog_name=dist.catalog_name,
        auth_rules=dist.auth_rules or {},
        is_active=dist.is_active,
        created_at=dist.created_at,
        updated_at=dist.updated_at,
    )


def _doc_to_response(doc: GlobalDocument, distributions: list) -> GlobalDocResponse:
    return GlobalDocResponse(
        doc_id=str(doc.doc_id),
        name=doc.name,
        description=doc.description,
        file_url=doc.file_url,
        files=doc.files_json or [],
        metadata=doc.metadata_json or {},
        uploaded_by=doc.uploaded_by,
        is_active=doc.is_active,
        distributions=[_dist_to_response(d) for d in distributions],
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


def _doc_to_list_response(doc: GlobalDocument, distributions: list) -> GlobalDocListResponse:
    active_dists = [d for d in distributions if d.is_active]
    return GlobalDocListResponse(
        doc_id=str(doc.doc_id),
        name=doc.name,
        description=doc.description,
        file_url=doc.file_url,
        files=doc.files_json or [],
        uploaded_by=doc.uploaded_by,
        is_active=doc.is_active,
        distribution_countries=[d.country_code for d in active_dists],
        distribution_catalogs=list({d.catalog_name for d in active_dists}),
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


# ===== 全域館目錄 API =====

@router.get("/catalogs", response_model=List[GlobalCatalogResponse])
async def list_global_catalogs(
    country_code: Optional[str] = Query(None, description="依國家代碼篩選"),
    payload: dict = Depends(get_current_user_payload),
):
    """取得全域館清單（可依國家篩選，含文件數統計）"""
    async with GlobalSessionLocal() as session:
        # 取得館清單（可依國家篩選）
        stmt = select(GlobalCatalog).order_by(GlobalCatalog.catalog_name)
        if country_code:
            stmt = stmt.where(GlobalCatalog.country_code == country_code)
        cat_result = await session.execute(stmt)
        catalogs = cat_result.scalars().all()

        # 計算各館的分發文件數（依 catalog_id 對應的 catalog_name + country_code）
        count_result = await session.execute(
            select(
                GlobalDocumentDistribution.catalog_name,
                GlobalDocumentDistribution.country_code,
                func.count(GlobalDocumentDistribution.doc_id).label("cnt"),
            )
            .where(GlobalDocumentDistribution.is_active == True)  # noqa: E712
            .group_by(
                GlobalDocumentDistribution.catalog_name,
                GlobalDocumentDistribution.country_code,
            )
        )
        count_rows = count_result.fetchall()

    # 整理統計資料：key = (catalog_name, country_code)
    catalog_stats: dict = {}
    for row in count_rows:
        key = (row.catalog_name, row.country_code)
        catalog_stats[key] = row.cnt

    return [
        GlobalCatalogResponse(
            catalog_id=str(cat.catalog_id),
            catalog_name=cat.catalog_name,
            country_code=cat.country_code,
            description=cat.description,
            image_url=cat.image_url,
            doc_count=catalog_stats.get((cat.catalog_name, cat.country_code), 0),
            created_at=cat.created_at,
            updated_at=cat.updated_at,
        )
        for cat in catalogs
    ]


@router.post("/catalogs", response_model=GlobalCatalogResponse)
async def create_global_catalog(
    body: GlobalCatalogCreate,
    payload: dict = Depends(require_permission("manage_library")),
):
    """建立新全域館（同一國家內館名不可重複）"""
    async with GlobalSessionLocal() as session:
        # 檢查同一國家是否已存在同名館
        existing = await session.execute(
            select(GlobalCatalog).where(
                and_(
                    GlobalCatalog.catalog_name == body.catalog_name,
                    GlobalCatalog.country_code == body.country_code,
                )
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"館名「{body.catalog_name}」在此國家已存在")

        catalog = GlobalCatalog(
            catalog_name=body.catalog_name,
            country_code=body.country_code,
            description=body.description,
        )
        session.add(catalog)
        await session.commit()
        await session.refresh(catalog)

    return GlobalCatalogResponse(
        catalog_id=str(catalog.catalog_id),
        catalog_name=catalog.catalog_name,
        country_code=catalog.country_code,
        description=catalog.description,
        image_url=catalog.image_url,
        doc_count=0,
        created_at=catalog.created_at,
        updated_at=catalog.updated_at,
    )


@router.put("/catalogs/{catalog_id}", response_model=GlobalCatalogResponse)
async def update_global_catalog(
    catalog_id: str,
    body: GlobalCatalogUpdate,
    payload: dict = Depends(require_permission("manage_library")),
):
    """更新全域館名稱或描述（若館名變更，同步更新同國家分發規則的 catalog_name）"""
    async with GlobalSessionLocal() as session:
        result = await session.execute(
            select(GlobalCatalog).where(GlobalCatalog.catalog_id == catalog_id)
        )
        catalog = result.scalar_one_or_none()
        if not catalog:
            raise HTTPException(status_code=404, detail="館不存在")

        old_name = catalog.catalog_name
        country = catalog.country_code
        update_data = {}

        if body.catalog_name is not None and body.catalog_name != old_name:
            # 檢查同一國家新館名是否已存在
            dup = await session.execute(
                select(GlobalCatalog).where(
                    and_(
                        GlobalCatalog.catalog_name == body.catalog_name,
                        GlobalCatalog.country_code == country,
                    )
                )
            )
            if dup.scalar_one_or_none():
                raise HTTPException(status_code=400, detail=f"館名「{body.catalog_name}」在此國家已存在")
            update_data["catalog_name"] = body.catalog_name

        if body.description is not None:
            update_data["description"] = body.description

        if not update_data:
            raise HTTPException(status_code=400, detail="沒有要更新的欄位")

        await session.execute(
            update(GlobalCatalog)
            .where(GlobalCatalog.catalog_id == catalog_id)
            .values(**update_data, updated_at=datetime.now(timezone.utc))
        )

        # 若館名有變更，同步更新同國家的分發規則 catalog_name
        if "catalog_name" in update_data:
            await session.execute(
                update(GlobalDocumentDistribution)
                .where(
                    and_(
                        GlobalDocumentDistribution.catalog_name == old_name,
                        GlobalDocumentDistribution.country_code == country,
                    )
                )
                .values(catalog_name=update_data["catalog_name"])
            )
            logger.info(f"全域館名已更新 [{country}]: {old_name} → {update_data['catalog_name']}")

        await session.commit()
        await session.refresh(catalog)

    return GlobalCatalogResponse(
        catalog_id=str(catalog.catalog_id),
        catalog_name=catalog.catalog_name,
        country_code=catalog.country_code,
        description=catalog.description,
        image_url=catalog.image_url,
        doc_count=0,
        created_at=catalog.created_at,
        updated_at=catalog.updated_at,
    )


@router.delete("/catalogs/{catalog_id}", response_model=MessageResponse)
async def delete_global_catalog(
    catalog_id: str,
    payload: dict = Depends(require_permission("manage_library")),
):
    """刪除全域館（僅限無文件分發的空館）"""
    async with GlobalSessionLocal() as session:
        result = await session.execute(
            select(GlobalCatalog).where(GlobalCatalog.catalog_id == catalog_id)
        )
        catalog = result.scalar_one_or_none()
        if not catalog:
            raise HTTPException(status_code=404, detail="館不存在")

        # 檢查是否有文件分發到此館（同國家）
        count_result = await session.execute(
            select(func.count()).select_from(GlobalDocumentDistribution).where(
                and_(
                    GlobalDocumentDistribution.catalog_name == catalog.catalog_name,
                    GlobalDocumentDistribution.country_code == catalog.country_code,
                )
            )
        )
        doc_count = count_result.scalar() or 0
        if doc_count > 0:
            raise HTTPException(
                status_code=400,
                detail=f"無法刪除：館「{catalog.catalog_name}」中還有 {doc_count} 筆文件分發，請先移除所有文件的分發設定"
            )

        # 刪除封面圖片
        if catalog.image_url:
            storage_service.delete_files(GLOBAL_COUNTRY, "catalog", catalog_id)

        await session.execute(
            delete(GlobalCatalog).where(GlobalCatalog.catalog_id == catalog_id)
        )
        await session.commit()

    return MessageResponse(message=f"館「{catalog.catalog_name}」已刪除")


@router.post("/catalogs/{catalog_id}/image", response_model=MessageResponse)
async def upload_catalog_image(
    catalog_id: str,
    file: UploadFile = File(...),
    payload: dict = Depends(require_permission("manage_library")),
):
    """上傳全域館封面圖片（PNG/JPG，≤5MB）"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="未提供檔案")
    ext = file.filename.lower().rsplit('.', 1)[-1] if '.' in file.filename else ''
    if ext not in ('png', 'jpg', 'jpeg'):
        raise HTTPException(status_code=400, detail="僅支援 PNG 或 JPG 格式")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="圖片大小不可超過 5MB")
    await file.seek(0)

    async with GlobalSessionLocal() as session:
        result = await session.execute(
            select(GlobalCatalog).where(GlobalCatalog.catalog_id == catalog_id)
        )
        catalog = result.scalar_one_or_none()
        if not catalog:
            raise HTTPException(status_code=404, detail="館不存在")

        # 刪除舊圖片
        if catalog.image_url:
            storage_service.delete_files(GLOBAL_COUNTRY, "catalog", catalog_id)

        # 重命名為 cover.{ext}
        file.filename = f"cover.{ext}"
        file_result = await storage_service.save_file(GLOBAL_COUNTRY, "catalog", catalog_id, file)

        await session.execute(
            update(GlobalCatalog)
            .where(GlobalCatalog.catalog_id == catalog_id)
            .values(image_url=file_result["relative_path"], updated_at=datetime.now(timezone.utc))
        )
        await session.commit()

    return MessageResponse(message="封面圖片已上傳", detail=file_result["relative_path"])


@router.delete("/catalogs/{catalog_id}/image", response_model=MessageResponse)
async def delete_catalog_image(
    catalog_id: str,
    payload: dict = Depends(require_permission("manage_library")),
):
    """刪除全域館封面圖片"""
    async with GlobalSessionLocal() as session:
        result = await session.execute(
            select(GlobalCatalog).where(GlobalCatalog.catalog_id == catalog_id)
        )
        catalog = result.scalar_one_or_none()
        if not catalog:
            raise HTTPException(status_code=404, detail="館不存在")
        if not catalog.image_url:
            raise HTTPException(status_code=404, detail="該館沒有封面圖片")

        storage_service.delete_files(GLOBAL_COUNTRY, "catalog", catalog_id)

        await session.execute(
            update(GlobalCatalog)
            .where(GlobalCatalog.catalog_id == catalog_id)
            .values(image_url=None, updated_at=datetime.now(timezone.utc))
        )
        await session.commit()

    return MessageResponse(message="封面圖片已刪除")


@router.get("/catalogs/{catalog_id}/image")
async def get_catalog_image(
    catalog_id: str,
    payload: dict = Depends(get_current_user_payload),
):
    """取得全域館封面圖片"""
    async with GlobalSessionLocal() as session:
        result = await session.execute(
            select(GlobalCatalog).where(GlobalCatalog.catalog_id == catalog_id)
        )
        catalog = result.scalar_one_or_none()
        if not catalog or not catalog.image_url:
            raise HTTPException(status_code=404, detail="圖片不存在")

    parts = catalog.image_url.split('/')
    filename = parts[-1] if parts else None
    if not filename:
        raise HTTPException(status_code=404, detail="圖片路徑無效")

    file_path = storage_service.get_file_path(GLOBAL_COUNTRY, "catalog", catalog_id, filename)
    if not file_path:
        raise HTTPException(status_code=404, detail="圖片檔案不存在")

    ext = filename.lower().rsplit('.', 1)[-1] if '.' in filename else ''
    media_type = "image/png" if ext == "png" else "image/jpeg"
    return FileResponse(path=str(file_path), media_type=media_type)


# ===== 全域文件管理 API =====

@router.get("/docs", response_model=List[GlobalDocListResponse])
async def list_global_docs(
    catalog_name: Optional[str] = Query(None, description="依館名篩選"),
    country_code: Optional[str] = Query(None, description="依國家篩選"),
    is_active: Optional[bool] = Query(None, description="依啟用狀態篩選"),
    payload: dict = Depends(require_permission("manage_library")),
):
    """列出所有全域文件（管理端，含分發狀態）"""
    async with GlobalSessionLocal() as session:
        # 取得所有文件
        doc_stmt = select(GlobalDocument).order_by(GlobalDocument.created_at.desc())
        if is_active is not None:
            doc_stmt = doc_stmt.where(GlobalDocument.is_active == is_active)
        doc_result = await session.execute(doc_stmt)
        docs = doc_result.scalars().all()

        if not docs:
            return []

        doc_ids = [doc.doc_id for doc in docs]

        # 取得所有分發規則
        dist_stmt = select(GlobalDocumentDistribution).where(
            GlobalDocumentDistribution.doc_id.in_(doc_ids)
        )
        if catalog_name:
            dist_stmt = dist_stmt.where(GlobalDocumentDistribution.catalog_name == catalog_name)
        if country_code:
            dist_stmt = dist_stmt.where(GlobalDocumentDistribution.country_code == country_code)

        dist_result = await session.execute(dist_stmt)
        all_dists = dist_result.scalars().all()

    # 依 doc_id 分組
    dist_map: dict = {}
    for d in all_dists:
        key = str(d.doc_id)
        if key not in dist_map:
            dist_map[key] = []
        dist_map[key].append(d)

    # 若有 catalog_name 或 country_code 篩選，只回傳有分發的文件
    if catalog_name or country_code:
        filtered_doc_ids = set(dist_map.keys())
        docs = [doc for doc in docs if str(doc.doc_id) in filtered_doc_ids]

    return [_doc_to_list_response(doc, dist_map.get(str(doc.doc_id), [])) for doc in docs]


@router.get("/docs/{doc_id}", response_model=GlobalDocResponse)
async def get_global_doc(
    doc_id: str,
    payload: dict = Depends(require_permission("manage_library")),
):
    """取得單一全域文件詳情（含完整分發規則）"""
    async with GlobalSessionLocal() as session:
        doc_result = await session.execute(
            select(GlobalDocument).where(GlobalDocument.doc_id == doc_id)
        )
        doc = doc_result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="文件不存在")

        dist_result = await session.execute(
            select(GlobalDocumentDistribution).where(
                GlobalDocumentDistribution.doc_id == doc_id
            ).order_by(GlobalDocumentDistribution.country_code)
        )
        distributions = dist_result.scalars().all()

    return _doc_to_response(doc, distributions)


@router.post("/upload", response_model=MessageResponse)
async def upload_global_doc(
    request: Request,
    name: str = Form(..., description="文件名稱"),
    description: str = Form("", description="文件描述"),
    distributions: str = Form("[]", description="分發規則 JSON 字串"),
    file: Optional[UploadFile] = File(None, description="上傳的文件檔案"),
    payload: dict = Depends(require_permission("manage_library")),
):
    """
    上傳全域文件並設定分發規則
    distributions 格式：
    [
      {"country_code": "TW", "catalog_name": "法規館", "auth_rules": {...}, "is_active": true},
      {"country_code": "HK", "catalog_name": "產品館", "auth_rules": {...}, "is_active": true}
    ]
    """
    operator_email = payload.get("sub", "")

    # 解析分發規則
    try:
        dist_list_raw = json.loads(distributions)
        dist_rules = [DistributionRule(**d) for d in dist_list_raw]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"分發規則格式錯誤: {e}")

    # 建立文件 DB 記錄
    async with GlobalSessionLocal() as session:
        doc = GlobalDocument(
            name=name,
            description=description,
            metadata_json={},
            files_json=[],
            uploaded_by=operator_email,
            is_active=True,
        )
        session.add(doc)
        await session.commit()
        await session.refresh(doc)
        doc_id = str(doc.doc_id)

    # 處理檔案上傳
    files_info = []
    first_file_url = None
    if file and file.filename:
        try:
            result = await storage_service.save_file(
                GLOBAL_COUNTRY, "library", doc_id, file
            )
            files_info.append({
                "filename": result["original_filename"],
                "relative_path": result["relative_path"],
                "file_size": result["file_size"],
            })
            first_file_url = result["relative_path"]
        except Exception as e:
            logger.warning(f"檔案上傳失敗: {e}")

    # PII 掃描
    pii_warning = ""
    pii_scan_results = []
    try:
        pii_svc = get_pii_service()
        if pii_svc.enabled and files_info:
            from config import settings
            for fi in files_info:
                file_path = storage_service.get_file_path(
                    GLOBAL_COUNTRY, "library", doc_id, fi["filename"]
                )
                if file_path:
                    scan_result = await pii_svc.scan_file(file_path)
                    pii_scan_results.append({"filename": fi["filename"], **scan_result.to_dict()})
                    if scan_result.has_pii:
                        logger.warning(f"⚠️ PII 偵測: 全域文件 {doc_id}/{fi['filename']}")

            pii_files = [r for r in pii_scan_results if r.get("has_pii")]
            if pii_files and settings.PII_BLOCK_UPLOAD:
                # 阻擋模式：清理已儲存的檔案 + 刪除 DB 記錄
                storage_service.delete_files(GLOBAL_COUNTRY, "library", doc_id)
                async with GlobalSessionLocal() as session:
                    await session.execute(
                        delete(GlobalDocument).where(GlobalDocument.doc_id == doc_id)
                    )
                    await session.commit()
                blocked_details = [
                    f"「{pf['filename']}」含 {pf.get('entity_count', 0)} 個 PII"
                    for pf in pii_files
                ]
                raise HTTPException(
                    status_code=422,
                    detail=f"上傳被拒絕：偵測到個人敏感資訊（PII）。{'; '.join(blocked_details)}。請移除敏感資訊後重新上傳。",
                )
            elif pii_files:
                pii_warning = f"⚠️ {len(pii_files)} 個檔案偵測到個人敏感資訊（PII）"
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"⚠️ PII 掃描失敗（不影響上傳）: {e}")

    # 更新文件記錄（檔案資訊）
    metadata = {
        "file_count": len(files_info),
        "total_size": sum(f["file_size"] for f in files_info),
        "original_filename": files_info[0]["filename"] if files_info else None,
    }
    if pii_scan_results:
        metadata["pii_scan"] = pii_scan_results

    async with GlobalSessionLocal() as session:
        await session.execute(
            update(GlobalDocument)
            .where(GlobalDocument.doc_id == doc_id)
            .values(
                file_url=first_file_url,
                files_json=files_info,
                metadata_json=metadata,
            )
        )

        # 建立分發規則
        for rule in dist_rules:
            dist = GlobalDocumentDistribution(
                doc_id=doc_id,
                country_code=rule.country_code,
                catalog_name=rule.catalog_name,
                auth_rules=rule.auth_rules.model_dump(),
                is_active=rule.is_active,
            )
            session.add(dist)

        await session.commit()

    msg = "文件已上傳"
    if pii_warning:
        msg += f"。{pii_warning}"

    audit_log(
        action=AuditAction.LIBRARY_UPLOAD,
        operator_email=operator_email,
        country_code="global",
        target=doc_id,
        details={
            "doc_name": name,
            "file_count": len(files_info),
            "distribution_countries": [r.country_code for r in dist_rules],
        },
        request=request,
    )
    return MessageResponse(message=msg, detail=doc_id)


@router.put("/docs/{doc_id}", response_model=MessageResponse)
async def update_global_doc(
    doc_id: str,
    body: GlobalDocUpdate,
    request: Request,
    payload: dict = Depends(require_permission("manage_library")),
):
    """更新全域文件資訊（名稱、描述、啟用狀態）"""
    operator_email = payload.get("sub", "")
    update_data = {}
    if body.name is not None:
        update_data["name"] = body.name
    if body.description is not None:
        update_data["description"] = body.description
    if body.is_active is not None:
        update_data["is_active"] = body.is_active

    if not update_data:
        raise HTTPException(status_code=400, detail="沒有要更新的欄位")

    update_data["updated_at"] = datetime.now(timezone.utc)

    async with GlobalSessionLocal() as session:
        result = await session.execute(
            update(GlobalDocument)
            .where(GlobalDocument.doc_id == doc_id)
            .values(**update_data)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="文件不存在")
        await session.commit()

    audit_log(
        action=AuditAction.LIBRARY_UPDATE,
        operator_email=operator_email,
        country_code="global",
        target=doc_id,
        details=update_data,
        request=request,
    )
    return MessageResponse(message="文件資訊已更新")


@router.delete("/docs/{doc_id}", response_model=MessageResponse)
async def delete_global_doc(
    doc_id: str,
    request: Request,
    payload: dict = Depends(require_permission("manage_library")),
):
    """刪除全域文件（同時刪除所有分發規則和實體檔案）"""
    operator_email = payload.get("sub", "")

    async with GlobalSessionLocal() as session:
        doc_result = await session.execute(
            select(GlobalDocument).where(GlobalDocument.doc_id == doc_id)
        )
        doc = doc_result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="文件不存在")

        doc_name = doc.name

        # 刪除分發規則（CASCADE 應自動處理，但明確刪除更安全）
        await session.execute(
            delete(GlobalDocumentDistribution).where(
                GlobalDocumentDistribution.doc_id == doc_id
            )
        )
        # 刪除文件記錄
        await session.execute(
            delete(GlobalDocument).where(GlobalDocument.doc_id == doc_id)
        )
        await session.commit()

    # 刪除實體檔案
    storage_service.delete_files(GLOBAL_COUNTRY, "library", doc_id)

    audit_log(
        action=AuditAction.LIBRARY_DELETE,
        operator_email=operator_email,
        country_code="global",
        target=doc_id,
        details={"doc_name": doc_name},
        request=request,
    )
    return MessageResponse(message="文件已刪除")


@router.post("/docs/{doc_id}/upload-file", response_model=MessageResponse)
async def upload_doc_file(
    doc_id: str,
    request: Request,
    payload: dict = Depends(require_permission("manage_library")),
):
    """追加上傳附件到已有全域文件"""
    async with GlobalSessionLocal() as session:
        result = await session.execute(
            select(GlobalDocument).where(GlobalDocument.doc_id == doc_id)
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="文件不存在")
        current_files = list(doc.files_json or [])
        current_file_url = doc.file_url

    new_files = []
    content_type_header = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type_header:
        try:
            form = await request.form()
            uploaded_files = form.getlist("file")
            if not uploaded_files:
                single_file = form.get("file")
                if single_file and hasattr(single_file, 'filename') and single_file.filename:
                    uploaded_files = [single_file]

            for uploaded_file in uploaded_files:
                if hasattr(uploaded_file, 'filename') and uploaded_file.filename:
                    file_result = await storage_service.save_file(
                        GLOBAL_COUNTRY, "library", doc_id, uploaded_file
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

    current_files.extend(new_files)
    if not current_file_url and current_files:
        current_file_url = current_files[0].get("relative_path")

    metadata = {
        "file_count": len(current_files),
        "total_size": sum(f.get("file_size", 0) for f in current_files),
        "original_filename": current_files[0]["filename"] if current_files else None,
    }

    async with GlobalSessionLocal() as session:
        await session.execute(
            update(GlobalDocument)
            .where(GlobalDocument.doc_id == doc_id)
            .values(
                file_url=current_file_url,
                files_json=current_files,
                metadata_json=metadata,
                updated_at=datetime.now(timezone.utc),
            )
        )
        await session.commit()

    return MessageResponse(
        message=f"已追加上傳 {len(new_files)} 個附件",
        detail=", ".join(f["filename"] for f in new_files),
    )


@router.delete("/docs/{doc_id}/file", response_model=MessageResponse)
async def delete_doc_file(
    doc_id: str,
    filename: str = Query(..., description="要刪除的附件檔名"),
    payload: dict = Depends(require_permission("manage_library")),
):
    """刪除全域文件的單一附件"""
    async with GlobalSessionLocal() as session:
        result = await session.execute(
            select(GlobalDocument).where(GlobalDocument.doc_id == doc_id)
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="文件不存在")
        current_files = list(doc.files_json or [])

    file_entry = next((f for f in current_files if f.get("filename") == filename), None)
    if not file_entry:
        raise HTTPException(status_code=404, detail=f"找不到附件：{filename}")

    current_files.remove(file_entry)
    storage_service.delete_single_file(GLOBAL_COUNTRY, "library", doc_id, filename)

    new_file_url = current_files[0].get("relative_path") if current_files else None

    async with GlobalSessionLocal() as session:
        await session.execute(
            update(GlobalDocument)
            .where(GlobalDocument.doc_id == doc_id)
            .values(
                files_json=current_files,
                file_url=new_file_url,
                metadata_json={
                    "file_count": len(current_files),
                    "total_size": sum(f.get("file_size", 0) for f in current_files),
                    "original_filename": current_files[0]["filename"] if current_files else None,
                },
                updated_at=datetime.now(timezone.utc),
            )
        )
        await session.commit()

    return MessageResponse(message=f"附件「{filename}」已刪除")


# ===== 分發規則管理 API =====

@router.get("/docs/{doc_id}/distributions", response_model=List[DistributionRuleResponse])
async def get_distributions(
    doc_id: str,
    payload: dict = Depends(require_permission("manage_library")),
):
    """取得某文件的所有分發規則"""
    async with GlobalSessionLocal() as session:
        # 確認文件存在
        doc_result = await session.execute(
            select(GlobalDocument).where(GlobalDocument.doc_id == doc_id)
        )
        if not doc_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="文件不存在")

        dist_result = await session.execute(
            select(GlobalDocumentDistribution)
            .where(GlobalDocumentDistribution.doc_id == doc_id)
            .order_by(GlobalDocumentDistribution.country_code)
        )
        distributions = dist_result.scalars().all()

    return [_dist_to_response(d) for d in distributions]


@router.put("/docs/{doc_id}/distributions", response_model=MessageResponse)
async def update_distributions(
    doc_id: str,
    rules: List[DistributionRule],
    payload: dict = Depends(require_permission("manage_library")),
):
    """
    批次更新文件的分發規則（upsert 模式）
    - 若該國已有分發規則 → 更新
    - 若該國尚無分發規則 → 新增
    - 若要停止某國分發 → 設定 is_active=false 或不傳該國
    """
    async with GlobalSessionLocal() as session:
        # 確認文件存在
        doc_result = await session.execute(
            select(GlobalDocument).where(GlobalDocument.doc_id == doc_id)
        )
        if not doc_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="文件不存在")

        # 取得現有分發規則
        existing_result = await session.execute(
            select(GlobalDocumentDistribution).where(
                GlobalDocumentDistribution.doc_id == doc_id
            )
        )
        existing_dists = {d.country_code: d for d in existing_result.scalars().all()}

        now = datetime.now(timezone.utc)
        for rule in rules:
            if rule.country_code in existing_dists:
                # 更新現有規則
                await session.execute(
                    update(GlobalDocumentDistribution)
                    .where(
                        and_(
                            GlobalDocumentDistribution.doc_id == doc_id,
                            GlobalDocumentDistribution.country_code == rule.country_code,
                        )
                    )
                    .values(
                        catalog_name=rule.catalog_name,
                        auth_rules=rule.auth_rules.model_dump(),
                        is_active=rule.is_active,
                        updated_at=now,
                    )
                )
            else:
                # 新增分發規則
                dist = GlobalDocumentDistribution(
                    doc_id=doc_id,
                    country_code=rule.country_code,
                    catalog_name=rule.catalog_name,
                    auth_rules=rule.auth_rules.model_dump(),
                    is_active=rule.is_active,
                )
                session.add(dist)

        await session.commit()

    return MessageResponse(
        message=f"分發規則已更新（{len(rules)} 筆）",
        detail=", ".join(r.country_code for r in rules),
    )