"""
資料遷移腳本：將各國 Local DB 的圖書館資料遷移到 Global DB
執行方式：cd backend && python migrations/migrate_local_to_global.py

遷移步驟：
1. 從各國 Local DB 讀取 local_library_catalog → 寫入 global_catalog（去重）
2. 從各國 Local DB 讀取 local_library → 寫入 global_document
3. 建立 global_document_distribution 記錄（country_code = 原來的國家）
4. 移動實體檔案：uploads/{country}/library/{id}/ → uploads/global/library/{id}/
5. 移動封面圖片：uploads/{country}/catalog/{id}/ → uploads/global/catalog/{id}/
6. 驗證資料完整性

注意：
- 遷移前請先執行 v3_global_library.sql
- 遷移不會刪除 Local DB 的資料，確認無誤後可手動清空
- 若 doc_id 已存在於 global_document，跳過（冪等操作）
"""
import asyncio
import json
import logging
import os
import shutil
import sys
from pathlib import Path

# 加入 backend 目錄到 Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from urllib.parse import quote_plus

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

UPLOAD_ROOT = Path(__file__).parent.parent / "uploads"
GLOBAL_COUNTRY = "global"


async def get_global_session() -> AsyncSession:
    """建立 Global DB 連線"""
    from config import settings
    engine = create_async_engine(
        settings.GLOBAL_DB_URL,
        echo=False,
        connect_args={"ssl": False} if "localhost" in settings.GLOBAL_DB_HOST else {},
    )
    factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    return factory(), engine


async def get_local_session(country_code: str) -> AsyncSession:
    """建立指定國家的 Local DB 連線"""
    from config import settings
    url = settings.get_local_pg_url(country_code)
    if not url:
        raise ValueError(f"找不到國家 [{country_code}] 的 Local DB 設定")
    engine = create_async_engine(url, echo=False)
    factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    return factory(), engine


def move_files(src_dir: Path, dst_dir: Path, dry_run: bool = False) -> int:
    """移動目錄下的所有檔案，回傳移動的檔案數"""
    if not src_dir.exists():
        return 0
    dst_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for file in src_dir.iterdir():
        if file.is_file():
            dst_file = dst_dir / file.name
            if not dry_run:
                shutil.copy2(str(file), str(dst_file))
            logger.info(f"  {'[DRY RUN] ' if dry_run else ''}複製: {file} → {dst_file}")
            count += 1
    return count


async def migrate_country(
    country_code: str,
    global_session: AsyncSession,
    dry_run: bool = False,
) -> dict:
    """遷移單一國家的圖書館資料"""
    stats = {
        "country": country_code,
        "catalogs_migrated": 0,
        "docs_migrated": 0,
        "docs_skipped": 0,
        "files_moved": 0,
        "errors": [],
    }

    logger.info(f"\n{'='*50}")
    logger.info(f"開始遷移國家：{country_code}")
    logger.info(f"{'='*50}")

    try:
        local_session, local_engine = await get_local_session(country_code)
    except ValueError as e:
        logger.warning(f"⚠️ 跳過 {country_code}：{e}")
        stats["errors"].append(str(e))
        return stats

    try:
        # ===== Step 1: 遷移館目錄 =====
        logger.info(f"\n[{country_code}] Step 1: 遷移館目錄...")
        cat_result = await local_session.execute(
            text("SELECT catalog_id, library_name, description, image_url, created_at FROM local_library_catalog ORDER BY library_name")
        )
        catalogs = cat_result.fetchall()
        logger.info(f"  找到 {len(catalogs)} 個館")

        for cat in catalogs:
            # 檢查 global_catalog 是否已存在
            existing = await global_session.execute(
                text("SELECT catalog_id FROM global_catalog WHERE catalog_name = :name"),
                {"name": cat.library_name}
            )
            if existing.fetchone():
                logger.info(f"  館「{cat.library_name}」已存在，跳過")
                continue

            if not dry_run:
                await global_session.execute(
                    text("""
                        INSERT INTO global_catalog (catalog_id, catalog_name, description, image_url, created_at, updated_at)
                        VALUES (:catalog_id, :catalog_name, :description, :image_url, NOW(), NOW())
                        ON CONFLICT (catalog_name) DO NOTHING
                    """),
                    {
                        "catalog_id": str(cat.catalog_id),
                        "catalog_name": cat.library_name,
                        "description": cat.description,
                        "image_url": None,  # 圖片路徑會在移動檔案後更新
                    }
                )
            logger.info(f"  ✅ 館「{cat.library_name}」已遷移")
            stats["catalogs_migrated"] += 1

            # 移動封面圖片
            if cat.image_url:
                src_dir = UPLOAD_ROOT / country_code / "catalog" / str(cat.catalog_id)
                dst_dir = UPLOAD_ROOT / GLOBAL_COUNTRY / "catalog" / str(cat.catalog_id)
                moved = move_files(src_dir, dst_dir, dry_run)
                if moved > 0:
                    stats["files_moved"] += moved
                    # 更新 image_url 路徑
                    if not dry_run:
                        # 找到移動後的檔案名稱
                        if dst_dir.exists():
                            for f in dst_dir.iterdir():
                                if f.is_file():
                                    new_image_url = f"uploads/global/catalog/{cat.catalog_id}/{f.name}"
                                    await global_session.execute(
                                        text("UPDATE global_catalog SET image_url = :url WHERE catalog_id = :id"),
                                        {"url": new_image_url, "id": str(cat.catalog_id)}
                                    )
                                    break

        # ===== Step 2: 遷移文件 =====
        logger.info(f"\n[{country_code}] Step 2: 遷移文件...")
        doc_result = await local_session.execute(
            text("""
                SELECT doc_id, library_name, name, description, metadata, auth_rules,
                       file_url, files, created_at, updated_at
                FROM local_library
                ORDER BY library_name, name
            """)
        )
        docs = doc_result.fetchall()
        logger.info(f"  找到 {len(docs)} 個文件")

        for doc in docs:
            doc_id = str(doc.doc_id)

            # 檢查 global_document 是否已存在
            existing = await global_session.execute(
                text("SELECT doc_id FROM global_document WHERE doc_id = :id"),
                {"id": doc_id}
            )
            if existing.fetchone():
                logger.info(f"  文件「{doc.name}」({doc_id}) 已存在，跳過")
                stats["docs_skipped"] += 1
                continue

            # 移動實體檔案
            src_dir = UPLOAD_ROOT / country_code / "library" / doc_id
            dst_dir = UPLOAD_ROOT / GLOBAL_COUNTRY / "library" / doc_id
            moved = move_files(src_dir, dst_dir, dry_run)
            stats["files_moved"] += moved

            # 更新 file_url 和 files_json 的路徑
            new_file_url = None
            new_files_json = []

            if doc.file_url:
                # 替換路徑前綴
                new_file_url = doc.file_url.replace(
                    f"uploads/{country_code}/library/",
                    f"uploads/{GLOBAL_COUNTRY}/library/"
                )

            if doc.files:
                for f in (doc.files or []):
                    new_f = dict(f)
                    if new_f.get("relative_path"):
                        new_f["relative_path"] = new_f["relative_path"].replace(
                            f"uploads/{country_code}/library/",
                            f"uploads/{GLOBAL_COUNTRY}/library/"
                        )
                    new_files_json.append(new_f)

            if not dry_run:
                # 序列化 JSONB 欄位（asyncpg 不允許混用 $N 和 :name 參數）
                metadata_json = json.dumps(doc.metadata) if doc.metadata else "{}"
                doc_auth_rules_json = json.dumps({
                    "authorized_roles": [],
                    "authorized_users": [],
                    "exception_list": [],
                })
                files_json_str = json.dumps(new_files_json) if new_files_json else "[]"

                # 寫入 global_document
                await global_session.execute(
                    text("""
                        INSERT INTO global_document
                            (doc_id, name, description, metadata, auth_rules, file_url, files,
                             uploaded_by, is_active, created_at, updated_at)
                        VALUES
                            (:doc_id, :name, :description,
                             CAST(:metadata AS jsonb), CAST(:auth_rules AS jsonb),
                             :file_url, CAST(:files AS jsonb),
                             :uploaded_by, true, :created_at, :updated_at)
                        ON CONFLICT (doc_id) DO NOTHING
                    """),
                    {
                        "doc_id": doc_id,
                        "name": doc.name,
                        "description": doc.description,
                        "metadata": metadata_json,
                        "auth_rules": doc_auth_rules_json,
                        "file_url": new_file_url,
                        "files": files_json_str,
                        "uploaded_by": None,
                        "created_at": doc.created_at,
                        "updated_at": doc.updated_at,
                    }
                )

                # 建立分發規則（auth_rules 從原本的 doc.auth_rules 取得）
                raw_auth = doc.auth_rules if doc.auth_rules else {
                    "authorized_roles": [],
                    "authorized_users": [],
                    "exception_list": [],
                }
                dist_auth_json = json.dumps(raw_auth) if isinstance(raw_auth, dict) else raw_auth
                await global_session.execute(
                    text("""
                        INSERT INTO global_document_distribution
                            (doc_id, country_code, catalog_name, auth_rules, is_active, created_at, updated_at)
                        VALUES
                            (:doc_id, :country_code, :catalog_name,
                             CAST(:auth_rules AS jsonb), true, NOW(), NOW())
                        ON CONFLICT (doc_id, country_code) DO NOTHING
                    """),
                    {
                        "doc_id": doc_id,
                        "country_code": country_code,
                        "catalog_name": doc.library_name,
                        "auth_rules": dist_auth_json,
                    }
                )

            logger.info(f"  ✅ 文件「{doc.name}」({doc_id}) 已遷移 → {country_code}/{doc.library_name}")
            stats["docs_migrated"] += 1

        if not dry_run:
            await global_session.commit()
            logger.info(f"\n[{country_code}] ✅ 已提交到 Global DB")

    except Exception as e:
        logger.error(f"[{country_code}] ❌ 遷移失敗: {e}")
        stats["errors"].append(str(e))
        if not dry_run:
            await global_session.rollback()
    finally:
        await local_session.close()
        await local_engine.dispose()

    return stats


async def verify_migration(global_session: AsyncSession) -> None:
    """驗證遷移結果"""
    logger.info("\n" + "="*50)
    logger.info("驗證遷移結果")
    logger.info("="*50)

    doc_count = await global_session.execute(text("SELECT COUNT(*) FROM global_document"))
    dist_count = await global_session.execute(text("SELECT COUNT(*) FROM global_document_distribution"))
    cat_count = await global_session.execute(text("SELECT COUNT(*) FROM global_catalog"))

    logger.info(f"  global_document: {doc_count.scalar()} 筆")
    logger.info(f"  global_document_distribution: {dist_count.scalar()} 筆")
    logger.info(f"  global_catalog: {cat_count.scalar()} 筆")

    # 各國分發統計
    country_stats = await global_session.execute(
        text("""
            SELECT country_code, COUNT(*) as cnt
            FROM global_document_distribution
            GROUP BY country_code
            ORDER BY country_code
        """)
    )
    logger.info("\n  各國分發統計：")
    for row in country_stats.fetchall():
        logger.info(f"    {row.country_code}: {row.cnt} 筆")


async def main(dry_run: bool = False, countries: list = None):
    """主遷移流程"""
    from config import settings

    logger.info("="*60)
    logger.info(f"圖書館資料遷移腳本 {'[DRY RUN 模式]' if dry_run else '[正式執行]'}")
    logger.info("="*60)

    # 取得所有國家
    all_countries = list(settings.LOCAL_DB_CONFIG.keys())
    target_countries = countries or all_countries

    if not target_countries:
        logger.error("❌ 找不到任何 Local DB 設定，請確認 LOCAL_DB_CONFIG 環境變數")
        return

    logger.info(f"目標國家：{target_countries}")

    # 建立 Global DB 連線
    global_session, global_engine = await get_global_session()

    try:
        # 預處理：若 global_document 有舊的 library_name NOT NULL 欄位，改為 nullable
        # （該欄位是從舊 global_library 重命名而來，新架構不使用）
        try:
            await global_session.execute(text("""
                ALTER TABLE global_document
                    ALTER COLUMN library_name DROP NOT NULL
            """))
            await global_session.commit()
            logger.info("✅ global_document.library_name 已改為 nullable（舊欄位相容處理）")
        except Exception:
            await global_session.rollback()
            # 欄位不存在或已是 nullable，忽略錯誤
            pass

        all_stats = []
        for country_code in target_countries:
            stats = await migrate_country(country_code, global_session, dry_run)
            all_stats.append(stats)

        # 驗證結果
        if not dry_run:
            await verify_migration(global_session)

        # 總結
        logger.info("\n" + "="*60)
        logger.info("遷移總結")
        logger.info("="*60)
        total_docs = sum(s["docs_migrated"] for s in all_stats)
        total_cats = sum(s["catalogs_migrated"] for s in all_stats)
        total_files = sum(s["files_moved"] for s in all_stats)
        total_errors = sum(len(s["errors"]) for s in all_stats)

        for s in all_stats:
            status = "✅" if not s["errors"] else "⚠️"
            logger.info(
                f"  {status} {s['country']}: "
                f"館 {s['catalogs_migrated']} 個, "
                f"文件 {s['docs_migrated']} 筆 (跳過 {s['docs_skipped']}), "
                f"檔案 {s['files_moved']} 個"
                + (f", 錯誤 {len(s['errors'])} 個" if s["errors"] else "")
            )

        logger.info(f"\n  總計：館 {total_cats} 個, 文件 {total_docs} 筆, 檔案 {total_files} 個")
        if total_errors:
            logger.warning(f"  ⚠️ 共 {total_errors} 個錯誤，請檢查上方日誌")
        else:
            logger.info("  ✅ 遷移完成，無錯誤")

        if dry_run:
            logger.info("\n  [DRY RUN] 以上為模擬結果，未實際寫入資料庫或移動檔案")
            logger.info("  執行正式遷移：python migrations/migrate_local_to_global.py --execute")

    finally:
        await global_session.close()
        await global_engine.dispose()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="圖書館資料遷移：Local DB → Global DB")
    parser.add_argument(
        "--execute",
        action="store_true",
        help="正式執行遷移（預設為 dry run 模式）",
    )
    parser.add_argument(
        "--countries",
        nargs="+",
        help="指定要遷移的國家代碼（例如：TW HK），不指定則遷移所有國家",
    )
    args = parser.parse_args()

    asyncio.run(main(
        dry_run=not args.execute,
        countries=args.countries,
    ))
