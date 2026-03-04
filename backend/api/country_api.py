"""
國家 API：取得已設定的國家列表
"""
import logging
from typing import List

from fastapi import APIRouter, Depends

from config import settings
from core.security import get_current_user_payload

logger = logging.getLogger(__name__)
router = APIRouter()

# 國家名稱對照表
COUNTRY_NAMES = {
    "TW": "台灣",
    "JP": "日本",
    "SG": "新加坡",
    "TH": "泰國",
    "VN": "越南",
    "PH": "菲律賓",
    "MY": "馬來西亞",
    "ID": "印尼",
    "IN": "印度",
    "HK": "香港",
}


@router.get("")
async def list_countries(
    payload: dict = Depends(get_current_user_payload),
):
    """
    取得已設定 Local DB 的國家列表
    回傳格式：[{"code": "TW", "name": "台灣"}, ...]
    """
    configured_countries = list(settings.LOCAL_DB_CONFIG.keys())

    return [
        {
            "code": code,
            "name": COUNTRY_NAMES.get(code, code),
        }
        for code in sorted(configured_countries)
    ]
