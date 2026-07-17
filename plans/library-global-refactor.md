# 圖書館全域化重構計畫

## 背景與目標

### 現有問題
- 圖書館文件存放在各國 Local DB（`local_library`、`local_library_catalog`），各國獨立隔離
- 管理者若要讓同一份文件出現在多個國家，必須重複上傳 N 次
- 跨 DB 操作沒有 Transaction 保護，容易造成資料不一致
- `global_library` 表已存在於 Global DB 但功能不完整、幾乎未使用

### 目標
1. **上傳一次，分發多國**：管理者上傳文件後，可選擇要分發到哪些國家的哪些館
2. **各國獨立存取控制**：每個國家可設定不同的 `auth_rules`（誰能看）
3. **公告直接引用文件**：公告可選擇全域文件，一次發布到多個國家
4. **降低維護成本**：廢棄各國 Local DB 的圖書館表，統一由 Global DB 管理

---

## 架構設計

### DB 架構變更

```
Global DB（新增 2 張表，修改 1 張表）
├── global_document          ← 原 global_library 重構
├── global_document_distribution  ← 🆕 分發規則
├── global_catalog           ← 🆕 全域館目錄
└── ... 其他表不變

Local DB（廢棄 2 張表）
├── local_library            ← 廢棄（資料遷移後清空）
├── local_library_catalog    ← 廢棄（資料遷移後清空）
└── ... 其他表保留
```

### 檔案儲存路徑變更

```
現有：uploads/{country}/library/{doc_id}/{filename}
新的：uploads/global/library/{doc_id}/{filename}

現有：uploads/{country}/catalog/{catalog_id}/cover.{ext}
新的：uploads/global/catalog/{catalog_id}/cover.{ext}
```

---

## DB Schema 詳細設計

### 1. `global_document`（重構自 `global_library`）

```sql
-- 重構現有 global_library 表
ALTER TABLE global_library RENAME TO global_document;

-- 新增欄位
ALTER TABLE global_document
  ADD COLUMN files_json JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN uploaded_by VARCHAR(255),
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- 移除不再需要的欄位（library_name 移到 distribution 表）
-- 注意：library_name 和 auth_rules 保留作向後相容，之後可移除
```

**最終欄位**：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `doc_id` | UUID PK | 文件唯一識別碼 |
| `name` | VARCHAR(255) | 文件名稱 |
| `description` | TEXT | 文件描述 |
| `files_json` | JSONB | 多檔案清單 `[{filename, relative_path, file_size}]` |
| `file_url` | TEXT | 第一個檔案路徑（向後相容） |
| `metadata_json` | JSONB | 元資料（file_count, pii_scan 等） |
| `uploaded_by` | VARCHAR(255) | 上傳者 email |
| `is_active` | BOOLEAN | 是否啟用 |
| `created_at` | TIMESTAMPTZ | 建立時間 |
| `updated_at` | TIMESTAMPTZ | 更新時間 |

---

### 2. `global_document_distribution`（🆕 新增）

```sql
CREATE TABLE global_document_distribution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id UUID NOT NULL REFERENCES global_document(doc_id) ON DELETE CASCADE,
    country_code VARCHAR(5) NOT NULL,
    catalog_name VARCHAR(255) NOT NULL,
    auth_rules JSONB NOT NULL DEFAULT '{
        "authorized_roles": [],
        "authorized_users": [],
        "exception_list": []
    }',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(doc_id, country_code)
);

CREATE INDEX idx_distribution_country ON global_document_distribution(country_code);
CREATE INDEX idx_distribution_doc ON global_document_distribution(doc_id);
```

**欄位說明**：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | UUID PK | 分發規則識別碼 |
| `doc_id` | UUID FK | 對應的文件 |
| `country_code` | VARCHAR(5) | 目標國家（TW/HK/SG/US） |
| `catalog_name` | VARCHAR(255) | 在該國放入的館名 |
| `auth_rules` | JSONB | 該國的存取規則（可各國不同） |
| `is_active` | BOOLEAN | 是否啟用此分發 |

**設計說明**：
- `UNIQUE(doc_id, country_code)`：一份文件在同一國家只能有一筆分發規則
- `auth_rules` 各國獨立，TW 可以限定人員，HK 可以公開
- `is_active = false` 可暫時停止某國的分發，不需要刪除記錄

---

### 3. `global_catalog`（🆕 新增）

```sql
CREATE TABLE global_catalog (
    catalog_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**欄位說明**：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `catalog_id` | UUID PK | 館唯一識別碼 |
| `catalog_name` | VARCHAR(255) UNIQUE | 館名（全域唯一） |
| `description` | TEXT | 館描述 |
| `image_url` | TEXT | 封面圖片路徑 |

**設計說明**：
- 館名全域唯一，各國共用同一套館名清單
- 管理者建立館後，上傳文件時可選擇要放入哪個館（各國可選不同館）

---

## ORM Model 設計

### `backend/models/global_models.py` 修改

```python
class GlobalDocument(GlobalBase):
    """全域文件主表（重構自 GlobalLibrary）"""
    __tablename__ = "global_document"

    doc_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    metadata_json = Column("metadata", JSONB, nullable=False, default={})
    file_url = Column(Text)  # 向後相容
    files_json = Column("files", JSONB, nullable=False, default=[])
    uploaded_by = Column(String(255))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class GlobalDocumentDistribution(GlobalBase):
    """文件分發規則表"""
    __tablename__ = "global_document_distribution"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_id = Column(UUID(as_uuid=True), nullable=False)  # FK to global_document
    country_code = Column(String(5), nullable=False)
    catalog_name = Column(String(255), nullable=False)
    auth_rules = Column(JSONB, nullable=False, default={
        "authorized_roles": [],
        "authorized_users": [],
        "exception_list": [],
    })
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class GlobalCatalog(GlobalBase):
    """全域館目錄"""
    __tablename__ = "global_catalog"

    catalog_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    catalog_name = Column(String(255), nullable=False, unique=True)
    description = Column(Text)
    image_url = Column(Text)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
```

---

## 後端 API 設計

### 管理端 API（`/api/global-library`，需 `manage_library` 權限）

#### 館目錄管理

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/global-library/catalogs` | 列出所有全域館（含各國文件數統計） |
| `POST` | `/global-library/catalogs` | 建立新館 |
| `PUT` | `/global-library/catalogs/{catalog_id}` | 更新館名/描述 |
| `DELETE` | `/global-library/catalogs/{catalog_id}` | 刪除館（僅限無文件分發的空館） |
| `POST` | `/global-library/catalogs/{catalog_id}/image` | 上傳館封面圖片 |
| `DELETE` | `/global-library/catalogs/{catalog_id}/image` | 刪除館封面圖片 |
| `GET` | `/global-library/catalogs/{catalog_id}/image` | 取得館封面圖片 |

#### 文件管理

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/global-library/docs` | 列出所有全域文件（含分發狀態） |
| `POST` | `/global-library/upload` | 上傳文件 + 設定分發規則 |
| `PUT` | `/global-library/docs/{doc_id}` | 更新文件資訊（名稱、描述） |
| `DELETE` | `/global-library/docs/{doc_id}` | 刪除文件（同時刪除所有分發規則和實體檔案） |
| `POST` | `/global-library/docs/{doc_id}/upload-file` | 追加附件 |
| `DELETE` | `/global-library/docs/{doc_id}/file` | 刪除單一附件 |
| `GET` | `/global-library/docs/{doc_id}/distributions` | 查看某文件的分發規則 |
| `PUT` | `/global-library/docs/{doc_id}/distributions` | 批次更新分發規則 |

#### 上傳 API Request Body 設計

```
POST /global-library/upload
Content-Type: multipart/form-data

file: <binary>
name: "文件名稱"
description: "文件描述"
distributions: '[
  {"country_code": "TW", "catalog_name": "法規館", "auth_rules": {"authorized_users": [], ...}},
  {"country_code": "HK", "catalog_name": "產品館", "auth_rules": {"authorized_users": ["user@hk.com"], ...}},
  {"country_code": "SG", "catalog_name": "法規館", "auth_rules": {}}
]'
```

#### 分發規則更新 API

```
PUT /global-library/docs/{doc_id}/distributions
Content-Type: application/json

[
  {"country_code": "TW", "catalog_name": "法規館", "auth_rules": {...}, "is_active": true},
  {"country_code": "HK", "catalog_name": "產品館", "auth_rules": {...}, "is_active": false},
  {"country_code": "SG", "catalog_name": "法規館", "auth_rules": {...}, "is_active": true}
]
```

---

### 使用者端 API（`/api/library`，依授權過濾）

現有路徑保持不變，但查詢邏輯改為從 Global DB 查詢：

| 方法 | 路徑 | 說明 | 改動 |
|------|------|------|------|
| `GET` | `/library` | 查詢本國可見文件 | 改查 `global_document` JOIN `global_document_distribution` |
| `GET` | `/library/catalogs` | 查詢本國有文件的館清單 | 改查 `global_catalog` JOIN `global_document_distribution` |
| `GET` | `/library/latest` | 最新文件（首頁用） | 改查 Global DB |
| `GET` | `/library/{doc_id}/download` | 下載文件 | 改從 `uploads/global/` 取檔 |
| `GET` | `/library/{doc_id}/preview` | 預覽 PDF | 改從 `uploads/global/` 取檔 |
| `POST` | `/library/{doc_id}/view` | 記錄點擊 | 邏輯不變，只改 DB 查詢來源 |
| `GET` | `/library/stats/summary` | 統計報表 | 邏輯不變 |

#### 使用者端查詢邏輯

```python
# GET /library?country=TW（或從 JWT 取得 country）
SELECT
    d.doc_id, d.name, d.description, d.files_json, d.file_url,
    dist.catalog_name, dist.auth_rules, dist.country_code
FROM global_document d
JOIN global_document_distribution dist ON d.doc_id = dist.doc_id
WHERE dist.country_code = 'TW'
  AND dist.is_active = true
  AND d.is_active = true
ORDER BY dist.catalog_name, d.name
```

---

## Storage Service 改動

### `backend/services/storage_service.py`

新增支援 `global` 作為 `country_code` 的路徑：

```python
def _get_dir(self, country_code: str, category: str, item_id: str) -> Path:
    # country_code 可以是 "global"（全域文件）或具體國家代碼
    return self.root / country_code / category / item_id
```

實際上 `StorageService` 不需要改動，因為 `country_code` 只是路徑的一部分，傳入 `"global"` 即可：

```python
# 上傳全域文件
await storage_service.save_file("global", "library", doc_id, file)
# 路徑：uploads/global/library/{doc_id}/{filename}

# 上傳館封面圖片
await storage_service.save_file("global", "catalog", catalog_id, file)
# 路徑：uploads/global/catalog/{catalog_id}/cover.{ext}
```

**結論**：`storage_service.py` 不需要修改，只需要在呼叫時傳入 `"global"` 作為 `country_code`。

---

## 前端 UI 設計

### `LibrarySettings.jsx` 重構

#### Tab 結構（不變）

```
LibrarySettings
├── Tab 1：館管理（Catalogs）
└── Tab 2：文件管理（Documents）
```

#### Tab 1：館管理

- 卡片式展示全域館清單（從 `/global-library/catalogs` 取得）
- 每張卡片顯示：館名、封面圖片、各國文件數統計
- 操作：新增館、編輯館（改名 + 換封面）、刪除館（空館才能刪）
- **改動**：API 從 `/library/catalogs` 改為 `/global-library/catalogs`

#### Tab 2：文件管理

- 表格顯示所有全域文件
- 新增欄位：「分發國家」（Tag 顯示 TW / HK / SG / US）
- 篩選：依館名、依國家
- 操作：上傳文件、編輯分發規則、刪除文件

#### 上傳文件 Modal（重構）

```
┌─────────────────────────────────────────────┐
│  上傳文件                                    │
├─────────────────────────────────────────────┤
│  文件名稱 *：[___________________________]   │
│  描述 *：   [___________________________]   │
│  選擇檔案：  [選擇檔案] 支援 PDF/DOC/...     │
│                                             │
│  ── 分發設定 ──────────────────────────────  │
│                                             │
│  ☑ TW 台灣                                  │
│    館名：[法規館          ▼]                 │
│    存取：● 公開  ○ 限定人員                  │
│                                             │
│  ☑ HK 香港                                  │
│    館名：[產品館          ▼]                 │
│    存取：○ 公開  ● 限定人員 [選擇使用者...]  │
│                                             │
│  ☐ SG 新加坡（不分發）                       │
│  ☐ US 美國（不分發）                         │
│                                             │
│                          [取消]  [上傳]      │
└─────────────────────────────────────────────┘
```

#### 編輯分發規則 Modal（新增）

```
┌─────────────────────────────────────────────┐
│  編輯分發規則：{文件名稱}                     │
├─────────────────────────────────────────────┤
│  TW 台灣                                    │
│    館名：[法規館 ▼]  狀態：● 啟用 ○ 停用    │
│    存取：● 公開  ○ 限定人員                  │
│                                             │
│  HK 香港                                    │
│    館名：[產品館 ▼]  狀態：● 啟用 ○ 停用    │
│    存取：○ 公開  ● 限定人員 [已選 3 人]      │
│                                             │
│  SG 新加坡（未分發）[+ 新增分發]             │
│  US 美國（未分發）  [+ 新增分發]             │
│                                             │
│                          [取消]  [儲存]      │
└─────────────────────────────────────────────┘
```

---

## 公告整合設計

### `AnnouncementSettings.jsx` 改動

公告的「關聯圖書館文件」選擇器，改為從全域文件選擇：

**現有**：從各國 Local DB 的 `local_library` 選文件
**改後**：從 `global_document` 選文件，並顯示該文件已分發到哪些國家

```
選擇關聯文件：
┌─────────────────────────────────────────────┐
│  搜尋文件...                                 │
├─────────────────────────────────────────────┤
│  ○ 法規說明文件 2024                         │
│    館：法規館  分發：TW HK SG               │
│                                             │
│  ○ 產品操作手冊 v3                           │
│    館：產品館  分發：TW HK                  │
│                                             │
│  ○ 合規指引                                  │
│    館：法規館  分發：TW                     │
└─────────────────────────────────────────────┘
```

**注意**：若公告要發布到某國，但選擇的文件未分發到該國，顯示警告：
> ⚠️ 「法規說明文件 2024」尚未分發到 SG，SG 使用者將無法查看此文件

---

## 資料遷移策略

### 遷移腳本：`backend/migrations/migrate_local_to_global.py`

```
執行步驟：
1. 建立新表（global_document、global_document_distribution、global_catalog）
2. 從各國 Local DB 讀取 local_library_catalog → 寫入 global_catalog（去重）
3. 從各國 Local DB 讀取 local_library → 寫入 global_document
4. 移動實體檔案：uploads/{country}/library/{id}/ → uploads/global/library/{id}/
5. 移動封面圖片：uploads/{country}/catalog/{id}/ → uploads/global/catalog/{id}/
6. 建立 global_document_distribution 記錄（country_code = 原來的國家）
7. 驗證資料完整性
8. 清空 local_library 和 local_library_catalog（保留表結構，不刪表）
```

### SQL Migration 腳本：`backend/migrations/v3_global_library.sql`

```sql
-- Step 1: 重命名並擴充 global_library
ALTER TABLE global_library RENAME TO global_document;
ALTER TABLE global_document
  ADD COLUMN IF NOT EXISTS files_json JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Step 2: 建立分發規則表
CREATE TABLE IF NOT EXISTS global_document_distribution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id UUID NOT NULL,
    country_code VARCHAR(5) NOT NULL,
    catalog_name VARCHAR(255) NOT NULL,
    auth_rules JSONB NOT NULL DEFAULT '{"authorized_roles":[],"authorized_users":[],"exception_list":[]}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(doc_id, country_code)
);

CREATE INDEX IF NOT EXISTS idx_distribution_country ON global_document_distribution(country_code);
CREATE INDEX IF NOT EXISTS idx_distribution_doc ON global_document_distribution(doc_id);

-- Step 3: 建立全域館目錄表
CREATE TABLE IF NOT EXISTS global_catalog (
    catalog_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 實作 Todo 清單

### Phase 1：DB 與後端基礎

- [ ] 執行 `v3_global_library.sql` migration
- [ ] 修改 `backend/models/global_models.py`：新增 `GlobalDocument`、`GlobalDocumentDistribution`、`GlobalCatalog` class，移除舊的 `GlobalLibrary`
- [ ] 新增 `backend/models/schemas.py` 中的新 Schema（`GlobalDocCreate`、`DistributionRule`、`GlobalCatalogCreate` 等）
- [ ] 新增 `backend/api/global_library_api.py`（管理端 API）
- [ ] 修改 `backend/api/library_api.py`（使用者端 API，改查 Global DB）
- [ ] 在 `backend/main.py` 註冊新的 router
- [ ] 修改 `backend/core/permissions.py` 確認 `manage_library` 權限設定正確

### Phase 2：資料遷移

- [ ] 撰寫 `backend/migrations/migrate_local_to_global.py` 遷移腳本
- [ ] 在測試環境執行遷移並驗證資料完整性
- [ ] 移動實體檔案（`uploads/{country}/library/` → `uploads/global/library/`）

### Phase 3：前端重構

- [ ] 修改 `azure-portal/src/services/api.js`：新增 `globalLibraryAPI`，修改 `libraryAPI` 的端點
- [ ] 重構 `azure-portal/src/pages/settings/LibrarySettings.jsx`：
  - 館管理 Tab 改用 `globalLibraryAPI`
  - 文件管理 Tab 新增「分發國家」欄位
  - 上傳 Modal 新增分發設定 UI
  - 新增「編輯分發規則」Modal
- [ ] 修改 `azure-portal/src/pages/settings/AnnouncementSettings.jsx`：文件選擇器改為從全域文件選
- [ ] 修改 `azure-portal/src/utils/adapters.js`：新增 `adaptGlobalDocs`、`adaptDistributions` 等 adapter
- [ ] 更新 `azure-portal/src/i18n/locales/zh-TW.js` 和 `en.js`：新增分發相關的 i18n key

### Phase 4：測試與清理

- [ ] 測試各國使用者只能看到分發給自己國家的文件
- [ ] 測試 auth_rules 各國獨立設定
- [ ] 測試公告引用全域文件
- [ ] 測試 PII 掃描流程（改為掃描 global storage 的檔案）
- [ ] 確認稽核日誌正常記錄
- [ ] 清空 Local DB 的 `local_library` 和 `local_library_catalog`（可選：保留表結構）

---

## 風險與注意事項

| 風險 | 說明 | 緩解措施 |
|------|------|---------|
| 資料遷移失敗 | Local DB 資料無法完整遷移到 Global DB | 遷移前備份，遷移後驗證，保留 Local DB 資料直到確認無誤 |
| 實體檔案移動失敗 | 檔案路徑改變導致下載/預覽失敗 | 遷移腳本加入 rollback 機制，移動前先複製再刪除 |
| 公告引用文件失效 | 現有公告的 `library_docs` 引用 Local DB 的 doc_id | 遷移時保留原 doc_id，確保 UUID 不變 |
| 權限設定遺失 | Local DB 的 `auth_rules` 需正確遷移到 `global_document_distribution` | 遷移腳本逐筆驗證 auth_rules |
