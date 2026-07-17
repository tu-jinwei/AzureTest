"""
圖書館使用者端 API：各國使用者查詢、下載、預覽文件
資料來源：Global DB（global_document + global_document_distribution）
依分發規則（country_code）和 auth_rules 過濾
"""
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy import select, func, and_, cast, Date as SADate, literal_column

from core.database import GlobalSessionLocal
from core.permissions import has_permission, require_permission
from core.security import get_current_user_payload
from models.global_models import GlobalDocument, GlobalDocumentDistribution, GlobalCatalog
from models.schemas import (
    UserLibraryDocResponse,
    UserLibraryCatalogResponse,
    MessageResponse,
)
from services.storage_service import storage_service
from utils.audit_logger import audit_log, AuditAction

logger = logging.getLogger(__name__)
router = APIRouter()

GLOBAL_COUNTRY = "global"


# ===== 工具函式 =====

def _check_doc_auth(auth_rules: dict, email: str, role: str) -> bool:
    """檢查使用者是否有權存取文件（依分發規則的 auth_rules）"""
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


def _resolve_country(payload: dict, query_country: Optional[str] = None) -> str:
    """解析要查詢的國家"""
    from core.permissions import is_cross_country_role
    from config import settings
    user_country = payload.get("country", "TW")
    role = payload.get("role", "user")

    if query_country and query_country != user_country:
        if not is_cross_country_role(role):
            raise HTTPException(status_code=403, detail="只有管理者可以跨國查看")
        if query_country not in settings.LOCAL_DB_CONFIG:
            raise HTTPException(status_code=400, detail=f"國家 [{query_country}] 不存在")
        return query_country

    return user_country


def _doc_dist_to_response(
    doc: GlobalDocument,
    dist: GlobalDocumentDistribution,
) -> UserLibraryDocResponse:
    return UserLibraryDocResponse(
        doc_id=str(doc.doc_id),
        name=doc.name,
        description=doc.description,
        file_url=doc.file_url,
        files=doc.files_json or [],
        catalog_name=dist.catalog_name,
        country_code=dist.country_code,
        auth_rules=dist.auth_rules or {},
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


# ===== 使用者端 API =====

@router.get("", response_model=List[UserLibraryDocResponse])
async def list_library(
    country: Optional[str] = Query(None, description="國家代碼（僅 root/admin 可跨國）"),
    payload: dict = Depends(get_current_user_payload),
):
    """取得本國可見的圖書館文件清單（依分發規則 + auth_rules 過濾）"""
    email = payload["sub"]
    role = payload.get("role", "user")
    target_country = _resolve_country(payload, country)

    async with GlobalSessionLocal() as session:
        result = await session.execute(
            select(GlobalDocument, GlobalDocumentDistribution)
            .join(
                GlobalDocumentDistribution,
                GlobalDocument.doc_id == GlobalDocumentDistribution.doc_id,
            )
            .where(
                and_(
                    GlobalDocumentDistribution.country_code == target_country,
                    GlobalDocumentDistribution.is_active == True,  # noqa: E712
                    GlobalDocument.is_active == True,  # noqa: E712
                )
            )
            .order_by(GlobalDocumentDistribution.catalog_name, GlobalDocument.name)
        )
        rows = result.fetchall()

    # root / admin 看到全部
    if has_permission(role, "access_all_docs"):
        return [_doc_dist_to_response(doc, dist) for doc, dist in rows]

    # 其他角色依 auth_rules 過濾
    return [
        _doc_dist_to_response(doc, dist)
        for doc, dist in rows
        if _check_doc_auth(dist.auth_rules, email, role)
    ]


@router.get("/catalogs", response_model=List[UserLibraryCatalogResponse])
async def list_catalogs(
    country: Optional[str] = Query(None, description="國家代碼（僅 root/admin 可跨國）"),
    payload: dict = Depends(get_current_user_payload),
):
    """取得本國有文件的館清單"""
    email = payload["sub"]
    role = payload.get("role", "user")
    target_country = _resolve_country(payload, country)

    async with GlobalSessionLocal() as session:
        # 取得本國有分發的館名清單
        dist_result = await session.execute(
            select(GlobalDocumentDistribution)
            .where(
                and_(
                    GlobalDocumentDistribution.country_code == target_country,
                    GlobalDocumentDistribution.is_active == True,  # noqa: E712
                )
            )
        )
        dists = dist_result.scalars().all()

        # 過濾 auth_rules
        if not has_permission(role, "access_all_docs"):
            dists = [d for d in dists if _check_doc_auth(d.auth_rules, email, role)]

        if not dists:
            return []

        # 統計各館文件數
        catalog_names = list({d.catalog_name for d in dists})
        count_map: dict = {}
        for d in dists:
            count_map[d.catalog_name] = count_map.get(d.catalog_name, 0) + 1

        # 取得館的詳細資訊（封面圖片等），同時依國家篩選（同名館在不同國家是不同館）
        cat_result = await session.execute(
            select(GlobalCatalog).where(
                and_(
                    GlobalCatalog.catalog_name.in_(catalog_names),
                    GlobalCatalog.country_code == target_country,
                )
            )
        )
        catalogs = {cat.catalog_name: cat for cat in cat_result.scalars().all()}

    return [
        UserLibraryCatalogResponse(
            catalog_id=str(catalogs[name].catalog_id) if name in catalogs else name,
            catalog_name=name,
            description=catalogs[name].description if name in catalogs else None,
            image_url=catalogs[name].image_url if name in catalogs else None,
            doc_count=count_map.get(name, 0),
            created_at=catalogs[name].created_at if name in catalogs else None,
        )
        for name in sorted(catalog_names)
    ]


@router.get("/latest", response_model=List[UserLibraryDocResponse])
async def list_latest_library(
    limit: int = Query(4, ge=1, le=20, description="回傳筆數"),
    country: Optional[str] = Query(None, description="國家代碼（僅 root/admin 可跨國）"),
    payload: dict = Depends(get_current_user_payload),
):
    """取得最新的圖書館文件（按建立時間倒序，供首頁展示）"""
    email = payload["sub"]
    role = payload.get("role", "user")
    target_country = _resolve_country(payload, country)

    async with GlobalSessionLocal() as session:
        result = await session.execute(
            select(GlobalDocument, GlobalDocumentDistribution)
            .join(
                GlobalDocumentDistribution,
                GlobalDocument.doc_id == GlobalDocumentDistribution.doc_id,
            )
            .where(
                and_(
                    GlobalDocumentDistribution.country_code == target_country,
                    GlobalDocumentDistribution.is_active == True,  # noqa: E712
                    GlobalDocument.is_active == True,  # noqa: E712
                )
            )
            .order_by(GlobalDocument.created_at.desc())
        )
        rows = result.fetchall()

    if has_permission(role, "access_all_docs"):
        filtered = rows
    else:
        filtered = [
            (doc, dist) for doc, dist in rows
            if _check_doc_auth(dist.auth_rules, email, role)
        ]

    return [_doc_dist_to_response(doc, dist) for doc, dist in filtered[:limit]]


@router.get("/all", response_model=List[UserLibraryDocResponse])
async def list_all_library(
    country: Optional[str] = Query(None, description="國家代碼（僅 root/admin 可跨國）"),
    payload: dict = Depends(require_permission("manage_library")),
):
    """取得所有文件（管理用，不過濾 auth_rules）"""
    target_country = _resolve_country(payload, country)

    async with GlobalSessionLocal() as session:
        result = await session.execute(
            select(GlobalDocument, GlobalDocumentDistribution)
            .join(
                GlobalDocumentDistribution,
                GlobalDocument.doc_id == GlobalDocumentDistribution.doc_id,
            )
            .where(
                and_(
                    GlobalDocumentDistribution.country_code == target_country,
                    GlobalDocumentDistribution.is_active == True,  # noqa: E712
                    GlobalDocument.is_active == True,  # noqa: E712
                )
            )
            .order_by(GlobalDocumentDistribution.catalog_name, GlobalDocument.name)
        )
        rows = result.fetchall()

    return [_doc_dist_to_response(doc, dist) for doc, dist in rows]


@router.get("/{doc_id}/download")
async def download_document(
    doc_id: str,
    request: Request,
    filename: Optional[str] = Query(None, description="指定下載的檔案名稱（多檔案時使用）"),
    country: Optional[str] = Query(None, description="國家代碼（僅 root/admin 可跨國）"),
    payload: dict = Depends(get_current_user_payload),
):
    """下載文件（需授權檢查）"""
    email = payload["sub"]
    role = payload.get("role", "user")
    target_country = _resolve_country(payload, country)

    async with GlobalSessionLocal() as session:
        # 取得文件 + 本國分發規則
        result = await session.execute(
            select(GlobalDocument, GlobalDocumentDistribution)
            .join(
                GlobalDocumentDistribution,
                GlobalDocument.doc_id == GlobalDocumentDistribution.doc_id,
            )
            .where(
                and_(
                    GlobalDocument.doc_id == doc_id,
                    GlobalDocumentDistribution.country_code == target_country,
                    GlobalDocumentDistribution.is_active == True,  # noqa: E712
                    GlobalDocument.is_active == True,  # noqa: E712
                )
            )
        )
        row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="文件不存在或未分發到此國家")

    doc, dist = row

    # 權限檢查
    if not has_permission(role, "access_all_docs"):
        if not _check_doc_auth(dist.auth_rules, email, role):
            raise HTTPException(status_code=403, detail="無權存取此文件")

    if not doc.file_url and not doc.files_json:
        raise HTTPException(status_code=404, detail="文件檔案不存在")

    # 決定要下載哪個檔案
    if filename:
        target_filename = filename
    else:
        metadata = doc.metadata_json or {}
        target_filename = metadata.get("original_filename", doc.name)

    file_path = storage_service.get_file_path(GLOBAL_COUNTRY, "library", str(doc.doc_id), target_filename)
    if not file_path:
        raise HTTPException(status_code=404, detail="實體檔案不存在")

    audit_log(
        action=AuditAction.LIBRARY_DOWNLOAD,
        operator_email=email,
        country_code=target_country,
        target=doc_id,
        details={"doc_name": doc.name, "filename": target_filename, "library_name": dist.catalog_name},
        request=request,
    )
    return FileResponse(
        path=str(file_path),
        filename=target_filename,
        media_type="application/octet-stream",
    )


@router.get("/{doc_id}/preview")
async def preview_document(
    doc_id: str,
    request: Request,
    filename: Optional[str] = Query(None, description="指定預覽的檔案名稱"),
    country: Optional[str] = Query(None, description="國家代碼（僅 root/admin 可跨國）"),
    record: bool = Query(True, description="是否記錄稽核日誌"),
    payload: dict = Depends(get_current_user_payload),
):
    """預覽文件（僅支援 PDF）"""
    email = payload["sub"]
    role = payload.get("role", "user")
    target_country = _resolve_country(payload, country)

    async with GlobalSessionLocal() as session:
        result = await session.execute(
            select(GlobalDocument, GlobalDocumentDistribution)
            .join(
                GlobalDocumentDistribution,
                GlobalDocument.doc_id == GlobalDocumentDistribution.doc_id,
            )
            .where(
                and_(
                    GlobalDocument.doc_id == doc_id,
                    GlobalDocumentDistribution.country_code == target_country,
                    GlobalDocumentDistribution.is_active == True,  # noqa: E712
                    GlobalDocument.is_active == True,  # noqa: E712
                )
            )
        )
        row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="文件不存在或未分發到此國家")

    doc, dist = row

    if not has_permission(role, "access_all_docs"):
        if not _check_doc_auth(dist.auth_rules, email, role):
            raise HTTPException(status_code=403, detail="無權存取此文件")

    # 決定要預覽哪個檔案
    if filename:
        target_filename = filename
    else:
        files = doc.files_json or []
        if files:
            target_filename = files[0].get("filename")
        else:
            metadata = doc.metadata_json or {}
            target_filename = metadata.get("original_filename", doc.name)

    if not target_filename:
        raise HTTPException(status_code=404, detail="無可預覽的檔案")

    if not target_filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail=f"不支援預覽此檔案格式：{target_filename}（僅支援 PDF）"
        )

    file_path = storage_service.get_file_path(GLOBAL_COUNTRY, "library", str(doc.doc_id), target_filename)
    if not file_path:
        raise HTTPException(status_code=404, detail="實體檔案不存在")

    if record:
        audit_log(
            action=AuditAction.LIBRARY_PREVIEW,
            operator_email=email,
            country_code=target_country,
            target=doc_id,
            details={"doc_name": doc.name, "filename": target_filename, "library_name": dist.catalog_name},
            request=request,
        )
    return FileResponse(
        path=str(file_path),
        filename=target_filename,
        media_type="application/pdf",
    )


@router.post("/{doc_id}/view", response_model=MessageResponse)
async def record_view(
    doc_id: str,
    request: Request,
    country: Optional[str] = Query(None, description="國家代碼（僅 root/admin 可跨國）"),
    payload: dict = Depends(get_current_user_payload),
):
    """記錄文件點擊（開啟文件 Modal 時呼叫）"""
    email = payload["sub"]
    role = payload.get("role", "user")
    target_country = _resolve_country(payload, country)

    async with GlobalSessionLocal() as session:
        result = await session.execute(
            select(GlobalDocument, GlobalDocumentDistribution)
            .join(
                GlobalDocumentDistribution,
                GlobalDocument.doc_id == GlobalDocumentDistribution.doc_id,
            )
            .where(
                and_(
                    GlobalDocument.doc_id == doc_id,
                    GlobalDocumentDistribution.country_code == target_country,
                    GlobalDocumentDistribution.is_active == True,  # noqa: E712
                    GlobalDocument.is_active == True,  # noqa: E712
                )
            )
        )
        row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="文件不存在或未分發到此國家")

    doc, dist = row

    if not has_permission(role, "access_all_docs"):
        if not _check_doc_auth(dist.auth_rules, email, role):
            raise HTTPException(status_code=403, detail="無權存取此文件")

    audit_log(
        action=AuditAction.LIBRARY_VIEW,
        operator_email=email,
        country_code=target_country,
        target=doc_id,
        details={"doc_name": doc.name, "library_name": dist.catalog_name},
        request=request,
    )
    return MessageResponse(message="已記錄")


@router.get("/stats/summary")
async def get_library_stats(
    country: Optional[str] = Query(None, description="國家代碼（僅 root/admin 可跨國）"),
    date_from: Optional[str] = Query(None, description="開始時間（ISO 8601）"),
    date_to: Optional[str] = Query(None, description="結束時間（ISO 8601）"),
    payload: dict = Depends(get_current_user_payload),
):
    """取得圖書館文件統計（點擊、預覽、下載次數）"""
    from models.global_models import GlobalAuditLog
    from core.permissions import is_cross_country_role

    role = payload.get("role", "user")
    user_country = payload.get("country", "")

    if is_cross_country_role(role):
        target_country = country
    else:
        target_country = user_country or "TW"

    dt_from = None
    dt_to = None
    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"date_from 格式錯誤：{date_from}")
    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"date_to 格式錯誤：{date_to}")

    library_actions = [
        AuditAction.LIBRARY_VIEW,
        AuditAction.LIBRARY_PREVIEW,
        AuditAction.LIBRARY_DOWNLOAD,
    ]

    async with GlobalSessionLocal() as session:
        base_conditions = [
            GlobalAuditLog.action.in_(library_actions),
            GlobalAuditLog.result == "success",
        ]
        if target_country:
            base_conditions.append(GlobalAuditLog.country_code == target_country)
        if dt_from:
            base_conditions.append(GlobalAuditLog.timestamp >= dt_from)
        if dt_to:
            base_conditions.append(GlobalAuditLog.timestamp <= dt_to)

        where_clause = and_(*base_conditions)

        summary_result = await session.execute(
            select(
                GlobalAuditLog.action,
                func.count(GlobalAuditLog.log_id).label("count"),
            )
            .where(where_clause)
            .group_by(GlobalAuditLog.action)
        )
        summary_rows = summary_result.fetchall()
        summary = {row.action: row.count for row in summary_rows}

        doc_result = await session.execute(
            select(
                GlobalAuditLog.target,
                GlobalAuditLog.action,
                func.count(GlobalAuditLog.log_id).label("count"),
            )
            .where(where_clause)
            .group_by(GlobalAuditLog.target, GlobalAuditLog.action)
            .order_by(func.count(GlobalAuditLog.log_id).desc())
            .limit(100)
        )
        doc_rows = doc_result.fetchall()

        doc_stats: dict = {}
        for row in doc_rows:
            doc_id_key = row.target
            if doc_id_key not in doc_stats:
                doc_stats[doc_id_key] = {
                    "doc_id": doc_id_key,
                    "doc_name": "",
                    "library_name": "",
                    "views": 0,
                    "previews": 0,
                    "downloads": 0,
                }
            if row.action == AuditAction.LIBRARY_VIEW:
                doc_stats[doc_id_key]["views"] = row.count
            elif row.action == AuditAction.LIBRARY_PREVIEW:
                doc_stats[doc_id_key]["previews"] = row.count
            elif row.action == AuditAction.LIBRARY_DOWNLOAD:
                doc_stats[doc_id_key]["downloads"] = row.count

        if doc_stats:
            name_conditions = [
                GlobalAuditLog.target.in_(list(doc_stats.keys())),
                GlobalAuditLog.action.in_(library_actions),
                GlobalAuditLog.details != None,  # noqa: E711
            ]
            if target_country:
                name_conditions.append(GlobalAuditLog.country_code == target_country)
            details_result = await session.execute(
                select(GlobalAuditLog.target, GlobalAuditLog.details)
                .where(and_(*name_conditions))
                .order_by(GlobalAuditLog.timestamp.desc())
                .limit(500)
            )
            seen_docs = set()
            for row in details_result.fetchall():
                if row.target not in seen_docs and row.details:
                    doc_stats[row.target]["doc_name"] = row.details.get("doc_name", "")
                    doc_stats[row.target]["library_name"] = row.details.get("library_name", "")
                    seen_docs.add(row.target)

        lib_name_col = literal_column("details->>'library_name'").label("library_name")
        library_result = await session.execute(
            select(
                GlobalAuditLog.action,
                func.count(GlobalAuditLog.log_id).label("count"),
                lib_name_col,
            )
            .where(where_clause)
            .group_by(GlobalAuditLog.action, literal_column("details->>'library_name'"))
            .order_by(func.count(GlobalAuditLog.log_id).desc())
        )
        library_rows = library_result.fetchall()

        library_stats: dict = {}
        for row in library_rows:
            lib_name = row.library_name or "（未知）"
            if lib_name not in library_stats:
                library_stats[lib_name] = {"library_name": lib_name, "views": 0, "previews": 0, "downloads": 0}
            if row.action == AuditAction.LIBRARY_VIEW:
                library_stats[lib_name]["views"] = row.count
            elif row.action == AuditAction.LIBRARY_PREVIEW:
                library_stats[lib_name]["previews"] = row.count
            elif row.action == AuditAction.LIBRARY_DOWNLOAD:
                library_stats[lib_name]["downloads"] = row.count

        trend_result = await session.execute(
            select(
                cast(GlobalAuditLog.timestamp, SADate).label("date"),
                GlobalAuditLog.action,
                func.count(GlobalAuditLog.log_id).label("count"),
            )
            .where(where_clause)
            .group_by(cast(GlobalAuditLog.timestamp, SADate), GlobalAuditLog.action)
            .order_by(cast(GlobalAuditLog.timestamp, SADate))
        )
        trend_rows = trend_result.fetchall()

        trend_map: dict = {}
        for row in trend_rows:
            date_str = str(row.date)
            if date_str not in trend_map:
                trend_map[date_str] = {"date": date_str, "views": 0, "previews": 0, "downloads": 0}
            if row.action == AuditAction.LIBRARY_VIEW:
                trend_map[date_str]["views"] = row.count
            elif row.action == AuditAction.LIBRARY_PREVIEW:
                trend_map[date_str]["previews"] = row.count
            elif row.action == AuditAction.LIBRARY_DOWNLOAD:
                trend_map[date_str]["downloads"] = row.count

        lib_trend_result = await session.execute(
            select(
                cast(GlobalAuditLog.timestamp, SADate).label("date"),
                GlobalAuditLog.action,
                func.count(GlobalAuditLog.log_id).label("count"),
                lib_name_col,
            )
            .where(where_clause)
            .group_by(
                cast(GlobalAuditLog.timestamp, SADate),
                GlobalAuditLog.action,
                literal_column("details->>'library_name'"),
            )
            .order_by(cast(GlobalAuditLog.timestamp, SADate))
        )
        lib_trend_rows = lib_trend_result.fetchall()

        lib_trend_map: dict = {}
        all_dates = set()
        for row in lib_trend_rows:
            date_str = str(row.date)
            lib_name = row.library_name or "（未知）"
            all_dates.add(date_str)
            if lib_name not in lib_trend_map:
                lib_trend_map[lib_name] = {}
            if date_str not in lib_trend_map[lib_name]:
                lib_trend_map[lib_name][date_str] = {"date": date_str, "views": 0, "previews": 0, "downloads": 0}
            if row.action == AuditAction.LIBRARY_VIEW:
                lib_trend_map[lib_name][date_str]["views"] = row.count
            elif row.action == AuditAction.LIBRARY_PREVIEW:
                lib_trend_map[lib_name][date_str]["previews"] = row.count
            elif row.action == AuditAction.LIBRARY_DOWNLOAD:
                lib_trend_map[lib_name][date_str]["downloads"] = row.count

        sorted_dates = sorted(all_dates)
        daily_trend_by_library = []
        for lib_name, date_map in lib_trend_map.items():
            trend_data = []
            for d in sorted_dates:
                if d in date_map:
                    trend_data.append(date_map[d])
                else:
                    trend_data.append({"date": d, "views": 0, "previews": 0, "downloads": 0})
            daily_trend_by_library.append({"library_name": lib_name, "trend": trend_data})

    top_docs = sorted(
        doc_stats.values(),
        key=lambda x: x["views"] + x["downloads"] + x["previews"],
        reverse=True,
    )[:20]

    return {
        "summary": {
            "total_views": summary.get(AuditAction.LIBRARY_VIEW, 0),
            "total_previews": summary.get(AuditAction.LIBRARY_PREVIEW, 0),
            "total_downloads": summary.get(AuditAction.LIBRARY_DOWNLOAD, 0),
        },
        "top_docs": top_docs,
        "by_library": sorted(
            library_stats.values(),
            key=lambda x: x["views"] + x["downloads"] + x["previews"],
            reverse=True,
        ),
        "daily_trend": list(trend_map.values()),
        "daily_trend_by_library": daily_trend_by_library,
    }


@router.get("/stats/daily-detail")
async def get_daily_detail(
    date: str = Query(..., description="日期（YYYY-MM-DD 格式）"),
    country: Optional[str] = Query(None, description="國家代碼（僅 root/admin 可跨國）"),
    payload: dict = Depends(get_current_user_payload),
):
    """取得指定日期的文件閱覽/下載明細"""
    from models.global_models import GlobalAuditLog
    from core.permissions import is_cross_country_role

    role = payload.get("role", "user")
    user_country = payload.get("country", "")

    if is_cross_country_role(role):
        target_country = country
    else:
        target_country = user_country or "TW"

    try:
        from datetime import date as date_type
        target_date = date_type.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"日期格式錯誤：{date}，請使用 YYYY-MM-DD")

    library_actions = [
        AuditAction.LIBRARY_VIEW,
        AuditAction.LIBRARY_PREVIEW,
        AuditAction.LIBRARY_DOWNLOAD,
    ]

    async with GlobalSessionLocal() as session:
        base_conditions = [
            GlobalAuditLog.action.in_(library_actions),
            GlobalAuditLog.result == "success",
            cast(GlobalAuditLog.timestamp, SADate) == target_date,
        ]
        if target_country:
            base_conditions.append(GlobalAuditLog.country_code == target_country)

        where_clause = and_(*base_conditions)

        result = await session.execute(
            select(
                GlobalAuditLog.target,
                GlobalAuditLog.action,
                GlobalAuditLog.user_email,
                GlobalAuditLog.timestamp,
                GlobalAuditLog.details,
            )
            .where(where_clause)
            .order_by(GlobalAuditLog.timestamp.desc())
            .limit(500)
        )
        rows = result.fetchall()

    doc_map: dict = {}
    for row in rows:
        doc_id = row.target
        if doc_id not in doc_map:
            doc_name = ""
            library_name = ""
            if row.details:
                doc_name = row.details.get("doc_name", "")
                library_name = row.details.get("library_name", "")
            doc_map[doc_id] = {
                "doc_id": doc_id,
                "doc_name": doc_name,
                "library_name": library_name,
                "views": 0,
                "previews": 0,
                "downloads": 0,
                "users": set(),
                "records": [],
            }
        entry = doc_map[doc_id]
        if not entry["doc_name"] and row.details:
            entry["doc_name"] = row.details.get("doc_name", "")
            entry["library_name"] = row.details.get("library_name", "")

        if row.action == AuditAction.LIBRARY_VIEW:
            entry["views"] += 1
        elif row.action == AuditAction.LIBRARY_PREVIEW:
            entry["previews"] += 1
        elif row.action == AuditAction.LIBRARY_DOWNLOAD:
            entry["downloads"] += 1

        entry["users"].add(row.user_email)
        action_label = {
            AuditAction.LIBRARY_VIEW: "點擊",
            AuditAction.LIBRARY_PREVIEW: "預覽",
            AuditAction.LIBRARY_DOWNLOAD: "下載",
        }.get(row.action, row.action)
        entry["records"].append({
            "action": action_label,
            "user": row.user_email,
            "time": row.timestamp.strftime("%H:%M:%S") if row.timestamp else "",
        })

    docs = []
    for entry in doc_map.values():
        entry["users"] = list(entry["users"])
        entry["total"] = entry["views"] + entry["previews"] + entry["downloads"]
        docs.append(entry)

    docs.sort(key=lambda x: x["total"], reverse=True)

    return {
        "date": date,
        "total_records": len(rows),
        "docs": docs,
    }
