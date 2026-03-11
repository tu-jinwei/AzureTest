-- Migration: 為 local_library_catalog 新增 image_url 欄位
-- 需要在各國的 Local DB 執行此 SQL

ALTER TABLE local_library_catalog ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 驗證欄位已新增
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'local_library_catalog' AND column_name = 'image_url';
