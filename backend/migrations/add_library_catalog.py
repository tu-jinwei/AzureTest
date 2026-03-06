#!/usr/bin/env python3
"""
遷移腳本：新增 local_library_catalog 表並從現有 local_library 資料填充

用法：
    cd ~/wei/Azure/backend
    python -m migrations.add_library_catalog

此腳本不會刪除任何現有資料，只會：
1. 建立 local_library_catalog 表（如果不存在）
2. 從 local_library 表中提取所有不重複的 library_name
3. 為每個 library_name 建立一筆 catalog 記錄
"""
import sys
import os

# 確保 backend 目錄在 path 中
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uuid
from datetime import datetime, timezone

from sqlalchemy import create_engine, text, inspect
from config import settings


COUNTRIES = ["TW", "SG", "JP", "TH"]


def get_sync_url(country_code: str) -> str:
    """取得同步版本的 Local DB URL"""
    config = settings.LOCAL_DB_CONFIG.get(country_code)
    if not config:
        return None
    from urllib.parse import quote_plus
    user = quote_plus(config["pg_user"])
    password = quote_plus(config["pg_password"])
    return (
        f"postgresql+psycopg2://{user}:{password}"
        f"@{config['pg_host']}:{config['pg_port']}/{config['pg_db']}"
    )


def migrate_country(country_code: str):
    """對單一國家執行遷移"""
    url = get_sync_url(country_code)
    if not url:
        print(f"  ⚠️  [{country_code}] 無 Local DB 設定，跳過")
        return

    engine = create_engine(url)

    with engine.begin() as conn:
        inspector = inspect(engine)
        tables = inspector.get_table_names()

        # 1. 建立 local_library_catalog 表（如果不存在）
        if "local_library_catalog" not in tables:
            print(f"  📦 [{country_code}] 建立 local_library_catalog 表...")
            conn.execute(text("""
                CREATE TABLE local_library_catalog (
                    catalog_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    library_name VARCHAR(255) NOT NULL UNIQUE,
                    description TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            print(f"  ✅ [{country_code}] local_library_catalog 表已建立")
        else:
            print(f"  ℹ️  [{country_code}] local_library_catalog 表已存在")

        # 2. 從 local_library 提取不重複的 library_name
        if "local_library" not in tables:
            print(f"  ⚠️  [{country_code}] local_library 表不存在，跳過資料填充")
            engine.dispose()
            return

        result = conn.execute(text("""
            SELECT DISTINCT library_name
            FROM local_library
            WHERE library_name IS NOT NULL AND library_name != ''
        """))
        existing_names = [row[0] for row in result]

        if not existing_names:
            print(f"  ℹ️  [{country_code}] local_library 中無資料，無需填充")
            engine.dispose()
            return

        # 3. 檢查已存在的 catalog 記錄
        result = conn.execute(text("""
            SELECT library_name FROM local_library_catalog
        """))
        already_in_catalog = {row[0] for row in result}

        # 4. 插入缺少的 catalog 記錄
        inserted = 0
        for name in existing_names:
            if name not in already_in_catalog:
                conn.execute(text("""
                    INSERT INTO local_library_catalog (catalog_id, library_name, created_at)
                    VALUES (:cid, :name, :now)
                """), {
                    "cid": str(uuid.uuid4()),
                    "name": name,
                    "now": datetime.now(timezone.utc),
                })
                inserted += 1

        print(f"  ✅ [{country_code}] 已插入 {inserted} 筆 catalog 記錄（共 {len(existing_names)} 個館名）")

    engine.dispose()


def main():
    print("=" * 50)
    print("🔄 遷移：新增 local_library_catalog 表")
    print("=" * 50)

    for country in COUNTRIES:
        print(f"\n{'─' * 40}")
        print(f"🌏 處理國家：{country}")
        try:
            migrate_country(country)
        except Exception as e:
            print(f"  ❌ [{country}] 遷移失敗：{e}")

    print(f"\n{'=' * 50}")
    print("✅ 遷移完成")
    print("=" * 50)


if __name__ == "__main__":
    main()
