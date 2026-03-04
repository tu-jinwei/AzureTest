"""
資料路由器
依 email → country_code 決定資料存取的 Local DB 連線
"""
import logging
from typing import Optional

from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import GlobalSessionLocal
from core.local_database import local_db_factory

logger = logging.getLogger(__name__)


class DataRouter:
    """
    資料路由器：依使用者 email 查詢 User_Route_Map，
    決定資料應該路由到哪個國家的 Local DB
    """

    async def get_country(self, email: str) -> str:
        """查詢使用者所屬國家"""
        from models.global_models import UserRouteMap

        async with GlobalSessionLocal() as session:
            result = await session.execute(
                select(UserRouteMap.country_code).where(UserRouteMap.email == email)
            )
            country = result.scalar_one_or_none()
            if not country:
                raise HTTPException(status_code=404, detail=f"找不到使用者 {email} 的路由資訊")
            return country

    async def get_local_pg(self, country_code: str) -> AsyncSession:
        """取得指定國家的 PostgreSQL Session"""
        session_factory = local_db_factory.get_pg_session(country_code)
        if not session_factory:
            raise HTTPException(
                status_code=500,
                detail=f"國家 [{country_code}] 的 PostgreSQL 連線未設定"
            )
        return session_factory()

    async def get_local_mongo(self, country_code: str) -> AsyncIOMotorDatabase:
        """取得指定國家的 MongoDB Database"""
        db = local_db_factory.get_mongo_db(country_code)
        if not db:
            raise HTTPException(
                status_code=500,
                detail=f"國家 [{country_code}] 的 MongoDB 連線未設定"
            )
        return db

    async def get_local_pg_by_email(self, email: str) -> AsyncSession:
        """依 email 取得對應國家的 PostgreSQL Session"""
        country = await self.get_country(email)
        return await self.get_local_pg(country)

    async def get_local_mongo_by_email(self, email: str) -> AsyncIOMotorDatabase:
        """依 email 取得對應國家的 MongoDB Database"""
        country = await self.get_country(email)
        return await self.get_local_mongo(country)


# 全域單例
data_router = DataRouter()
