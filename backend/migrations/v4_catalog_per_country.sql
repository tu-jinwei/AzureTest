-- ============================================================
-- Migration v4: 館目錄改為按國家分開管理
-- global_catalog 加 country_code 欄位，unique constraint 改為 (catalog_name, country_code)
-- 執行環境：Global PostgreSQL
-- ============================================================

-- Step 1: 加 country_code 欄位（預設空字串，讓現有資料不 null）
ALTER TABLE global_catalog
    ADD COLUMN IF NOT EXISTS country_code VARCHAR(5) NOT NULL DEFAULT '';

-- Step 2: 移除舊的 unique constraint（catalog_name 單欄唯一）
ALTER TABLE global_catalog
    DROP CONSTRAINT IF EXISTS global_catalog_catalog_name_key;

-- Step 3: 加新的複合 unique constraint（catalog_name + country_code）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_catalog_name_country'
    ) THEN
        ALTER TABLE global_catalog
            ADD CONSTRAINT uq_catalog_name_country UNIQUE (catalog_name, country_code);
        RAISE NOTICE 'uq_catalog_name_country constraint 已建立';
    ELSE
        RAISE NOTICE 'uq_catalog_name_country constraint 已存在，跳過';
    END IF;
END $$;

-- Step 4: 建立 country_code 索引
CREATE INDEX IF NOT EXISTS idx_catalog_country ON global_catalog(country_code);

-- Step 5: 驗證
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'global_catalog' AND column_name = 'country_code'
    ) THEN
        RAISE NOTICE '✅ Migration v4 完成：global_catalog.country_code 欄位已加入';
    ELSE
        RAISE EXCEPTION '❌ Migration v4 失敗：country_code 欄位未建立';
    END IF;
END $$;
