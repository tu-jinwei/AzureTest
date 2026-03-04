"""
Global DB 連線管理（台灣 PostgreSQL）
"""
import ssl

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from config import settings

# 建立不驗證證書的 SSL context（適用於 RDS）
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# Global DB 非同步引擎
global_engine = create_async_engine(
    settings.GLOBAL_DB_URL,
    echo=settings.APP_ENV == "development",
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    connect_args={"ssl": ssl_context},
)

# Global DB Session 工廠
GlobalSessionLocal = async_sessionmaker(
    bind=global_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class GlobalBase(DeclarativeBase):
    """Global DB 的 ORM Base"""
    pass


async def get_global_db() -> AsyncSession:
    """FastAPI Dependency: 取得 Global DB Session"""
    async with GlobalSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_global_db():
    """初始化 Global DB（建立所有表）"""
    async with global_engine.begin() as conn:
        await conn.run_sync(GlobalBase.metadata.create_all)


async def close_global_db():
    """關閉 Global DB 連線池"""
    await global_engine.dispose()
