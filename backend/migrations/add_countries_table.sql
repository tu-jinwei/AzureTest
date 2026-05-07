-- Migration: 建立 countries 表（國家管理）
-- 由 root 管理，儲存系統支援的國家清單

CREATE TABLE IF NOT EXISTS countries (
    code        VARCHAR(5)   PRIMARY KEY,          -- 國家代碼，如 TW、JP
    name_zh     VARCHAR(50)  NOT NULL,             -- 中文名稱
    name_en     VARCHAR(50)  NOT NULL,             -- 英文名稱
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE, -- 是否啟用
    sort_order  INTEGER      NOT NULL DEFAULT 0,   -- 排序
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 預設插入現有 4 個國家
INSERT INTO countries (code, name_zh, name_en, is_active, sort_order) VALUES
    ('TW', '台灣',   'Taiwan',    TRUE, 1),
    ('JP', '日本',   'Japan',     TRUE, 2),
    ('SG', '新加坡', 'Singapore', TRUE, 3),
    ('TH', '泰國',   'Thailand',  TRUE, 4)
ON CONFLICT (code) DO NOTHING;
