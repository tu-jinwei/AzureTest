-- Migration: 為 local_library 表新增 files JSONB 欄位（多檔案支援）
-- 日期: 2026-03-04
-- 說明: 原本 file_url 只存單一檔案路徑，新增 files 欄位存放多檔案資訊陣列
--       files 結構: [{ "filename": "xxx.pdf", "relative_path": "uploads/TW/library/uuid/xxx.pdf", "file_size": 123456 }]
--
-- 注意: 此 migration 需要在所有國家的 Local DB 上執行

-- 新增 files 欄位
ALTER TABLE local_library
ADD COLUMN IF NOT EXISTS files JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 將現有的單檔資料遷移到 files 欄位（向後相容）
-- 只處理有 file_url 但 files 為空陣列的記錄
UPDATE local_library
SET files = jsonb_build_array(
    jsonb_build_object(
        'filename', COALESCE(metadata->>'original_filename', name),
        'relative_path', file_url,
        'file_size', COALESCE((metadata->>'file_size')::bigint, 0)
    )
)
WHERE file_url IS NOT NULL
  AND file_url != ''
  AND (files IS NULL OR files = '[]'::jsonb);

-- 驗證
-- SELECT doc_id, name, file_url, files FROM local_library LIMIT 10;
