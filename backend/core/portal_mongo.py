"""
Portal MongoDB 連線管理
獨立於 Local DB，專門用於對話歷史（Session + Message 雙 Collection）

Collections:
  - ctbc_portal_sessions: 對話 Session
  - ctbc_portal_messages: 每條訊息
"""
import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from config import settings

logger = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None

# Collection 名稱常數
SESSIONS_COLLECTION = "ctbc_portal_sessions"
MESSAGES_COLLECTION = "ctbc_portal_messages"


async def init_portal_mongo() -> None:
    """初始化 Portal MongoDB 連線並建立索引"""
    global _client, _db

    if not settings.PORTAL_MONGO_URI:
        logger.warning("⚠️ PORTAL_MONGO_URI 未設定，對話歷史功能將無法使用")
        return

    try:
        _client = AsyncIOMotorClient(
            settings.PORTAL_MONGO_URI,
            serverSelectionTimeoutMS=5000,
        )
        _db = _client[settings.PORTAL_MONGO_DB]

        # 測試連線
        await _client.admin.command("ping")
        logger.info(f"✅ Portal MongoDB 已連線: db={settings.PORTAL_MONGO_DB}")

        # 建立索引（冪等操作，重複執行不會出錯）
        sessions = _db[SESSIONS_COLLECTION]
        await sessions.create_index(
            [("user_email", 1), ("updated_at", -1)],
            name="idx_user_updated",
        )
        await sessions.create_index(
            [("session_id", 1)],
            unique=True,
            name="idx_session_id",
        )

        messages = _db[MESSAGES_COLLECTION]
        await messages.create_index(
            [("session_id", 1), ("created_at", 1)],
            name="idx_session_created",
        )

        logger.info("✅ Portal MongoDB 索引已建立")

    except Exception as e:
        logger.error(f"❌ Portal MongoDB 連線失敗: {e}")
        _client = None
        _db = None


async def close_portal_mongo() -> None:
    """關閉 Portal MongoDB 連線"""
    global _client, _db
    if _client:
        _client.close()
        _client = None
        _db = None
        logger.info("✅ Portal MongoDB 連線已關閉")


def get_portal_db() -> AsyncIOMotorDatabase | None:
    """取得 Portal MongoDB Database 實例"""
    return _db


def get_sessions_collection():
    """取得 sessions collection"""
    if _db is None:
        return None
    return _db[SESSIONS_COLLECTION]


def get_messages_collection():
    """取得 messages collection"""
    if _db is None:
        return None
    return _db[MESSAGES_COLLECTION]
