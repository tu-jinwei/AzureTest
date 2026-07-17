-- ============================================================
-- Migration v3: 圖書館全域化重構
-- 將圖書館從各國 Local DB 搬移到 Global DB
-- 執行環境：Global PostgreSQL
-- ============================================================

-- Step 1: 重命名 global_library → global_document，並補充欄位
DO $$
BEGIN
    -- 若 global_library 存在且 global_document 不存在，則重命名
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_library')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_document') THEN
        ALTER TABLE global_library RENAME TO global_document;
        RAISE NOTICE 'global_library 已重命名為 global_document';
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_document') THEN
        -- 若兩者都不存在，建立新表
        CREATE TABLE global_document (
            doc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            description TEXT,
            metadata JSONB NOT NULL DEFAULT '{}',
            auth_rules JSONB NOT NULL DEFAULT '{"authorized_roles":[],"authorized_users":[],"exception_list":[]}',
            file_url TEXT,
            files JSONB NOT NULL DEFAULT '[]',
            uploaded_by VARCHAR(255),
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        RAISE NOTICE 'global_document 表已建立';
    ELSE
        RAISE NOTICE 'global_document 表已存在，跳過重命名';
    END IF;
END $$;

-- Step 2: 補充 global_document 缺少的欄位
ALTER TABLE global_document
    ADD COLUMN IF NOT EXISTS files JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 若原本有 library_name 欄位（舊 global_library 的欄位），保留不刪（向後相容）
-- 之後確認遷移完成後可手動刪除

-- Step 3: 建立分發規則表
CREATE TABLE IF NOT EXISTS global_document_distribution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id UUID NOT NULL,
    country_code VARCHAR(5) NOT NULL,
    catalog_name VARCHAR(255) NOT NULL,
    auth_rules JSONB NOT NULL DEFAULT '{"authorized_roles":[],"authorized_users":[],"exception_list":[]}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_doc_country UNIQUE (doc_id, country_code)
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_distribution_country ON global_document_distribution(country_code);
CREATE INDEX IF NOT EXISTS idx_distribution_doc ON global_document_distribution(doc_id);
CREATE INDEX IF NOT EXISTS idx_distribution_active ON global_document_distribution(is_active);
CREATE INDEX IF NOT EXISTS idx_distribution_catalog ON global_document_distribution(catalog_name);

-- Step 4: 建立全域館目錄表
CREATE TABLE IF NOT EXISTS global_catalog (
    catalog_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_name ON global_catalog(catalog_name);

-- Step 5: 驗證
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_document')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_document_distribution')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_catalog') THEN
        RAISE NOTICE '✅ Migration v3 完成：global_document、global_document_distribution、global_catalog 均已建立';
    ELSE
        RAISE EXCEPTION '❌ Migration v3 失敗：部分表格未建立';
    END IF;
END $$;
