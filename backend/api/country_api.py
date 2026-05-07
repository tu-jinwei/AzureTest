"""
國家 API：取得 / 新增 / 編輯 / 刪除國家
- GET    /api/countries          — 所有登入者可讀（回傳 is_active=True 的國家）
- GET    /api/countries/all      — root only，回傳全部（含停用）
- POST   /api/countries          — root only，新增國家
- PUT    /api/countries/{code}   — root only，編輯國家
- DELETE /api/countries/{code}   — root only，刪除國家
"""
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_global_db
from core.permissions import require_permission
from core.security import get_current_user_payload
from models.global_models import Country

logger = logging.getLogger(__name__)
router = APIRouter()


# ===== Schemas =====

class CountryOut(BaseModel):
    code: str
    name_zh: str
    name_en: str
    is_active: bool
    sort_order: int

    class Config:
        from_attributes = True


class CountryCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=5, description="國家代碼，如 TW")
    name_zh: str = Field(..., min_length=1, max_length=50, description="中文名稱")
    name_en: str = Field(..., min_length=1, max_length=50, description="英文名稱")
    is_active: bool = True
    sort_order: int = 0


class CountryUpdate(BaseModel):
    name_zh: Optional[str] = Field(None, min_length=1, max_length=50)
    name_en: Optional[str] = Field(None, min_length=1, max_length=50)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


# ===== Endpoints =====

@router.get("", response_model=List[CountryOut])
async def list_countries(
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_global_db),
):
    """
    取得啟用中的國家列表（所有登入者可用）
    若 DB 無資料，fallback 到 LOCAL_DB_CONFIG
    """
    result = await db.execute(
        select(Country).where(Country.is_active == True).order_by(Country.sort_order, Country.code)
    )
    rows = result.scalars().all()

    if rows:
        return rows

    # Fallback：DB 尚未建立時，從 LOCAL_DB_CONFIG 回傳
    from config import settings
    configured_countries = list(settings.LOCAL_DB_CONFIG.keys())
    COUNTRY_NAMES_ZH = {
        "TW": "台灣", "JP": "日本", "SG": "新加坡", "TH": "泰國",
        "VN": "越南", "PH": "菲律賓",
    }
    COUNTRY_NAMES_EN = {
        "TW": "Taiwan", "JP": "Japan", "SG": "Singapore", "TH": "Thailand",
        "VN": "Vietnam", "PH": "Philippines",
    }
    return [
        CountryOut(
            code=code,
            name_zh=COUNTRY_NAMES_ZH.get(code, code),
            name_en=COUNTRY_NAMES_EN.get(code, code),
            is_active=True,
            sort_order=i,
        )
        for i, code in enumerate(sorted(configured_countries))
    ]


@router.get("/all", response_model=List[CountryOut])
async def list_all_countries(
    payload: dict = Depends(require_permission("manage_countries")),
    db: AsyncSession = Depends(get_global_db),
):
    """取得全部國家（含停用），root only"""
    result = await db.execute(
        select(Country).order_by(Country.sort_order, Country.code)
    )
    return result.scalars().all()


@router.post("", response_model=CountryOut, status_code=status.HTTP_201_CREATED)
async def create_country(
    body: CountryCreate,
    payload: dict = Depends(require_permission("manage_countries")),
    db: AsyncSession = Depends(get_global_db),
):
    """新增國家，root only"""
    # 檢查代碼是否已存在
    existing = await db.get(Country, body.code.upper())
    if existing:
        raise HTTPException(status_code=409, detail=f"國家代碼 {body.code} 已存在")

    country = Country(
        code=body.code.upper(),
        name_zh=body.name_zh,
        name_en=body.name_en,
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    db.add(country)
    await db.commit()
    await db.refresh(country)
    logger.info(f"[country] 新增國家 {country.code} by {payload.get('sub')}")
    return country


@router.put("/{code}", response_model=CountryOut)
async def update_country(
    code: str,
    body: CountryUpdate,
    payload: dict = Depends(require_permission("manage_countries")),
    db: AsyncSession = Depends(get_global_db),
):
    """編輯國家，root only"""
    country = await db.get(Country, code.upper())
    if not country:
        raise HTTPException(status_code=404, detail=f"找不到國家代碼 {code}")

    if body.name_zh is not None:
        country.name_zh = body.name_zh
    if body.name_en is not None:
        country.name_en = body.name_en
    if body.is_active is not None:
        country.is_active = body.is_active
    if body.sort_order is not None:
        country.sort_order = body.sort_order
    country.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(country)
    logger.info(f"[country] 更新國家 {code} by {payload.get('sub')}")
    return country


@router.delete("/{code}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_country(
    code: str,
    payload: dict = Depends(require_permission("manage_countries")),
    db: AsyncSession = Depends(get_global_db),
):
    """刪除國家，root only"""
    country = await db.get(Country, code.upper())
    if not country:
        raise HTTPException(status_code=404, detail=f"找不到國家代碼 {code}")

    await db.delete(country)
    await db.commit()
    logger.info(f"[country] 刪除國家 {code} by {payload.get('sub')}")
