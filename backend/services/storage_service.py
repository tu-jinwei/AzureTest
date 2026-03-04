"""
檔案儲存服務 — 本地磁碟儲存（未來可替換為 Azure Blob Storage）
"""
import logging
import os
import shutil
from pathlib import Path
from typing import Optional

from fastapi import UploadFile

logger = logging.getLogger(__name__)

UPLOAD_ROOT = Path(__file__).parent.parent / "uploads"


class StorageService:
    """本地檔案儲存服務"""

    def __init__(self, root: Path = UPLOAD_ROOT):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        logger.info(f"📁 檔案儲存根目錄: {self.root}")

    def _get_dir(self, country_code: str, category: str, item_id: str) -> Path:
        return self.root / country_code / category / item_id

    async def save_file(self, country_code: str, category: str, item_id: str, file: UploadFile) -> dict:
        """
        儲存上傳的檔案
        category: "library" 或 "announcements"
        回傳 dict: { "relative_path": str, "file_size": int, "original_filename": str }
        """
        target_dir = self._get_dir(country_code, category, item_id)
        target_dir.mkdir(parents=True, exist_ok=True)

        file_path = target_dir / file.filename
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        relative_path = f"uploads/{country_code}/{category}/{item_id}/{file.filename}"
        logger.info(f"檔案已儲存: {relative_path} ({len(content)} bytes)")
        return {
            "relative_path": relative_path,
            "file_size": len(content),
            "original_filename": file.filename,
        }

    def get_file_path(self, country_code: str, category: str, item_id: str, filename: str) -> Optional[Path]:
        """取得檔案的絕對路徑（用於下載）"""
        file_path = self._get_dir(country_code, category, item_id) / filename
        if file_path.is_file():
            return file_path
        return None

    def delete_files(self, country_code: str, category: str, item_id: str) -> bool:
        """刪除整個項目目錄（包含所有檔案）"""
        target_dir = self._get_dir(country_code, category, item_id)
        if target_dir.exists():
            shutil.rmtree(target_dir)
            logger.info(f"檔案目錄已刪除: {target_dir}")
            return True
        return False


storage_service = StorageService()
