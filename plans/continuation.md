# CTBC AI Portal — 專案接續文件

> **使用方式**：新對話開始時貼上：
> `請讀取 Azure/plans/continuation.md 然後繼續工作`

---

## 1. 專案概述

CTBC AI Portal 是中國信託的內部 AI 入口網站，採用前後端分離架構，部署在同一台伺服器上。

## 2. 技術架構

| 層級 | 技術 | 路徑 |
|------|------|------|
| 前端 | React 19 + Vite 7 + Ant Design 5 | `Azure/azure-portal/` |
| 後端 | FastAPI + SQLAlchemy + Pydantic | `Azure/backend/` |
| Global DB | PostgreSQL | `10.0.0.138:5432/azuretestDB` |
| Local DB (TW) | PostgreSQL | `10.0.0.138:5432/azuretestDB_TW` |
| Local DB (SG) | PostgreSQL | `10.0.0.138:5432/azuretestDB_SG` |
| Local DB (JP) | PostgreSQL | `10.0.0.138:5432/azuretestDB_JP` |
| Local DB (TH) | PostgreSQL | `10.0.0.138:5432/azuretestDB_TH` |
| Portal MongoDB | MongoDB（對話歷史專用，需設定 `PORTAL_MONGO_URI`） | `core/portal_mongo.py` |
| 服務管理 | systemd `ctbc-backend.service` | port 8079 |
| 反向代理 | Nginx `/AzureTest/` → `http://10.0.2.83:8079` | — |

### 資料庫架構（國家隔離）

```
Global DB (azuretestDB)          ← 全球共用
├── user_route_map               ← 所有使用者（含 country_code）
├── agent_master                 ← Agent 定義（全球共用）
├── agent_acl                    ← Agent 存取控制（全球共用）
├── global_library               ← 已棄用（圖書館改存 Local DB）
└── global_audit_log             ← 全球稽核日誌

Local DB (azuretestDB_TW/SG/JP/TH)  ← 各國獨立
├── otp_vault                    ← OTP 暫存
├── login_audit                  ← 登入紀錄
├── local_notice                 ← 公告（各國獨立）
├── local_library_catalog        ← 圖書館館名目錄（各國獨立，館的生命週期由管理者控制）
├── local_library                ← 圖書館文件（各國獨立）
└── file_lifecycle               ← 檔案生命週期

Portal MongoDB (ctbc_portal)     ← 對話歷史專用（獨立於 Local DB）
├── ctbc_portal_sessions         ← 對話 Session
└── ctbc_portal_messages         ← 每條訊息
```

**國家隔離規則：**
- 每個使用者在建立帳號時設定 `country_code`，之後不可變更
- 非 `super_admin` 的使用者只能看到自己國家的公告、圖書館、使用者
- `super_admin` 可透過 `?country=XX` query parameter 跨國查看/管理
- Agent 全球共用，不受國家隔離限制

## 3. 部署流程

```bash
# 1. 前端 build（輸出到 backend/static）
cd Azure/azure-portal && npm run build

# 2. 重啟後端（start.sh 會自動 build + 啟動 uvicorn）
sudo systemctl restart ctbc-backend

# 3. 檢查狀態
sudo systemctl status ctbc-backend --no-pager

# 4. 重新種子資料（如需要，--drop 會清除舊資料）
cd Azure/backend && ./venv/bin/python seed_data.py --drop
```

**關鍵設定：**
- `vite.config.js`: `base: '/AzureTest/'`, `outDir: '../backend/static'`
- `backend/main.py`: FastAPI 同時 serve API (`/api/*`) 和前端靜態檔案（SPA fallback）
- `.env`: `APP_PORT=8079`, `APP_ENV=development`（dev 模式 OTP 會在 API response 的 `dev_otp` 欄位回傳）
- `.env`: `LOCAL_DB_CONFIG` 為 JSON 格式，定義各國 Local DB 連線資訊
- `.env`: `PORTAL_MONGO_URI` — Portal MongoDB 連線字串（對話歷史用）
- `.env`: `AGATHA_API_KEY` — Agatha Public API 金鑰（AI 聊天用）

## 4. 認證流程

1. 使用者輸入 email → `POST /api/auth/request-otp` → 回傳 `dev_otp`（dev 模式）
2. 輸入 OTP → `POST /api/auth/verify-otp` → 回傳 JWT `access_token` + `user` 物件
3. 前端存 token 到 `localStorage`，axios interceptor 自動附加 `Authorization: Bearer <token>`
4. `AuthContext` 每 60 秒呼叫 `GET /api/auth/me` 刷新使用者資訊（偵測角色變更）
5. 頁面切回時（visibilitychange）也會立即刷新

**JWT Payload 包含：** `sub`(email), `role`, `country`, `name`, `exp`, `iat`

## 5. 角色與權限系統

| 角色 | 權限 | 國家隔離 |
|------|------|---------|
| `super_admin` | 全部權限 + `cross_country_logs` | 可跨國查看/管理 |
| `platform_admin` | 全部權限（不含跨國日誌） | 只能看自己國家 |
| `user_manager` | 基本權限 + `manage_users` | 只能看自己國家 |
| `library_manager` | 基本權限 + `manage_library` | 只能看自己國家 |
| `user` | `view_announcements`, `use_agents`, `view_library`, `chat_history` | 只能看自己國家 |

**前端路由權限守衛**（`ProtectedRoute.jsx`）：
- `/settings/announcements` → `manage_announcements`
- `/settings/agent-permissions` → `manage_agent_permissions`
- `/settings/library` → `manage_library`
- `/settings/users` → `manage_users`

## 6. 檔案結構重點

### 前端 (`Azure/azure-portal/src/`)
```
App.jsx                          # 路由定義，settings 路由有權限守衛
main.jsx                         # React 入口
contexts/AuthContext.jsx          # 認證狀態管理（定期刷新、hasPermission）
contexts/CountryContext.jsx       # 全域國家狀態管理（TopBar 國家選擇器）
contexts/LanguageContext.jsx      # 多語系管理（zh-TW/en/ja/th/vi）
components/ProtectedRoute.jsx    # 路由守衛（支援 requiredPermission prop）
components/Layout.jsx            # 主版面（Sidebar + TopBar + Outlet）
components/Sidebar.jsx           # 側邊欄（根據權限動態顯示選單）
components/TopBar.jsx            # 頂部欄（國家選擇器 + 使用者資訊）
components/AntdLocaleWrapper.jsx # Ant Design 多語系包裝
components/PdfThumbnail.jsx      # PDF 縮圖元件
services/api.js                  # axios instance + 所有 API 函式（含 chatAPI.stream SSE）
utils/adapters.js                # 後端↔前端欄位名稱轉換（15+ 個函式）
data/mockData.js                 # 靜態假資料（fallback 用）+ 角色階層工具函式
i18n/                            # 多語系翻譯檔（zh-TW/en/ja/th/vi）
pages/Home.jsx                   # 首頁（公告 + Agent 列表 + 最新文件）
pages/Login.jsx                  # OTP 登入頁
pages/AgentChat.jsx              # Agent 對話（Streaming SSE + 多輪對話）
pages/ChatHistory.jsx            # 對話歷史（Session 列表 + 詳情 + 刪除 + 繼續對話）
pages/Library.jsx                # 圖書館瀏覽
pages/settings/AnnouncementSettings.jsx  # 公告 CRUD（super_admin 國家切換）
pages/settings/AgentPermissions.jsx      # Agent 權限管理（上架/下架 + ACL）
pages/settings/LibrarySettings.jsx       # 圖書館管理（super_admin 國家切換）
pages/settings/UserManagement.jsx        # 使用者管理（國家隔離 + super_admin 國家篩選）
```

### 後端 (`Azure/backend/`)
```
main.py                          # FastAPI 入口 + 靜態檔案 serve
config.py                        # Settings（讀 .env，含 LOCAL_DB_CONFIG、AGATHA_API_*、PORTAL_MONGO_*）
seed_data.py                     # 種子資料（10 使用者 + 6 Agent + 各國公告/圖書館）
start.sh                         # systemd 啟動腳本
api/auth_api.py                  # 認證 API（OTP + JWT + /me）
api/user_api.py                  # 使用者 CRUD API（國家隔離 + 角色階層檢查）
api/agent_api.py                 # Agent 管理 API（全球共用 + ACL 授權過濾）
api/announcement_api.py          # 公告 CRUD API（國家隔離 + 附件上傳/下載/刪除/預覽）
api/library_api.py               # 圖書館管理 API（國家隔離 + 多檔案上傳/下載/刪除/預覽）
api/country_api.py               # 國家列表 API（GET /api/countries）
api/chat_api.py                  # 對話 API（Agatha 串接 + Streaming SSE + Session 管理）
core/database.py                 # Global DB（PostgreSQL）連線
core/local_database.py           # Local DB 工廠（PG + MongoDB，管理各國連線池）
core/data_router.py              # DataRouter（根據 country_code 路由到正確的 Local DB）
core/portal_mongo.py             # Portal MongoDB 連線管理（對話歷史專用，雙 Collection）
core/permissions.py              # 角色權限定義 + require_permission dependency + 角色階層驗證
core/security.py                 # JWT 編解碼 + OTP 雜湊
models/global_models.py          # Global DB ORM（UserRouteMap, AgentMaster, AgentACL, GlobalLibrary, GlobalAuditLog）
models/local_models.py           # Local DB ORM（OTPVault, LoginAudit, LocalNotice, LocalLibraryCatalog, LocalLibrary, FileLifecycle）
models/schemas.py                # Pydantic Request/Response schemas（含 Session/Message schemas）
services/storage_service.py      # 本地檔案儲存服務（uploads/ 目錄管理）
```

## 7. API 端點總覽

| 模組 | 端點 | 方法 | 說明 | 國家隔離 |
|------|------|------|------|---------|
| 認證 | `/api/auth/request-otp` | POST | 請求 OTP | — |
| | `/api/auth/verify-otp` | POST | 驗證 OTP，回傳 JWT | — |
| | `/api/auth/me` | GET | 取得當前使用者（從 DB 讀取） | — |
| | `/api/auth/logout` | POST | 登出 | — |
| 使用者 | `/api/users` | GET | 列表（支援 search, role, status, country 篩選） | ✅ |
| | `/api/users` | POST | 新增使用者 | ✅ |
| | `/api/users/{email}` | PUT | 更新使用者 | ✅ |
| | `/api/users/{email}/status` | PATCH | 更新狀態 | ✅ |
| | `/api/users/{email}` | DELETE | 永久刪除使用者（硬刪除） | ✅ |
| | `/api/users/{email}/role` | PATCH | 更新角色 | ✅ |
| | `/api/users/assignable-roles` | GET | 可指派角色列表 | — |
| Agent | `/api/agents` | GET | 已發布 Agent 列表（依 ACL 過濾） | ❌ 全球共用 |
| | `/api/agents/all` | GET | 全部 Agent（管理用） | ❌ 全球共用 |
| | `/api/agents/{id}/publish` | PUT | 更新發布狀態 | ❌ 全球共用 |
| | `/api/agents/{id}/acl` | PUT | 更新存取控制 | ❌ 全球共用 |
| 公告 | `/api/announcements` | GET | 已發布公告 | ✅ `?country=XX` |
| | `/api/announcements/all` | GET | 全部公告（管理用） | ✅ `?country=XX` |
| | `/api/announcements` | POST | 新增公告 | ✅ `?country=XX` |
| | `/api/announcements/{id}` | PUT | 更新公告 | ✅ `?country=XX` |
| | `/api/announcements/{id}` | DELETE | 刪除公告（含附件） | ✅ `?country=XX` |
| | `/api/announcements/upload-file` | POST | 上傳公告附件（多檔案） | ✅ `?country=XX` |
| | `/api/announcements/{id}/file` | DELETE | 刪除公告單一附件 | ✅ `?country=XX` |
| | `/api/announcements/{id}/download` | GET | 下載公告附件 | ✅ `?country=XX` |
| | `/api/announcements/{id}/preview` | GET | 預覽公告附件 PDF | ✅ `?country=XX` |
| 圖書館 | `/api/library` | GET | 使用者可見文件（依 auth_rules 過濾） | ✅ `?country=XX` |
| | `/api/library/latest` | GET | 最新文件（首頁用，按建立時間倒序） | ✅ `?country=XX` |
| | `/api/library/all` | GET | 全部文件（管理用） | ✅ `?country=XX` |
| | `/api/library/upload` | POST | 上傳文件（multipart，多檔案） | ✅ `?country=XX` |
| | `/api/library/{id}` | PUT | 編輯文件資訊（名稱、描述、館名） | ✅ `?country=XX` |
| | `/api/library/{id}` | DELETE | 刪除文件（含實體檔案） | ✅ `?country=XX` |
| | `/api/library/{id}/auth` | PUT | 更新文件權限 | ✅ `?country=XX` |
| | `/api/library/{id}/download` | GET | 下載文件（支援指定檔名） | ✅ `?country=XX` |
| | `/api/library/{id}/preview` | GET | 預覽文件 PDF | ✅ `?country=XX` |
| | `/api/library/{id}/file` | DELETE | 刪除文件單一附件 | ✅ `?country=XX` |
| | `/api/library/{id}/upload-file` | POST | 追加上傳附件到已有文件 | ✅ `?country=XX` |
| | `/api/library/catalogs` | GET | 取得所有館名列表（含文件數量） | ✅ `?country=XX` |
| | `/api/library/catalogs` | POST | 手動建立新館 | ✅ `?country=XX` |
| | `/api/library/by-library/{library_name}` | DELETE | 刪除空館（含 catalog 記錄） | ✅ `?country=XX` |
| 國家 | `/api/countries` | GET | 已設定的國家列表 | — |
| 對話 | `/api/chat` | POST | 發送訊息（非 streaming） | — |
| | `/api/chat/stream` | POST | Streaming 聊天（SSE，整合 Agatha） | — |
| | `/api/chat/sessions` | GET | 對話 Session 列表（分頁，使用者隔離） | — |
| | `/api/chat/sessions/{session_id}` | GET | 對話 Session 詳情（含所有訊息） | — |
| | `/api/chat/sessions/{session_id}` | DELETE | 刪除對話 Session | — |
| | `/api/chat/history` | GET | ⚠️ Deprecated，請改用 `/chat/sessions` | — |
| | `/api/chat/{chat_id}` | GET | ⚠️ Deprecated，請改用 `/chat/sessions/{id}` | — |
| 系統 | `/api/health` | GET | 健康檢查 | — |

## 8. 種子資料帳號

| Email | 角色 | 國家 | 密碼 |
|-------|------|------|------|
| `super@ctbc.com` | super_admin | TW | OTP（dev 模式從 API 回傳） |
| `tina@ctbc.com` | platform_admin | TW | OTP |
| `john@ctbc.com` | user_manager | TW | OTP |
| `alice@ctbc.com` | library_manager | TW | OTP |
| `carol@ctbc.com` | user | TW | OTP |
| `eva@ctbc.com` | user (inactive) | TW | OTP |
| `admin.sg@ctbc.com` | platform_admin | SG | OTP |
| `bob@ctbc.com.sg` | user | SG | OTP |
| `david@ctbc.co.jp` | user | JP | OTP |
| `frank@ctbc.co.th` | user | TH | OTP |

## 9. 已完成的階段

### ✅ Phase 1-3：基礎建設
- 前端 UI 全部頁面（React + Ant Design）
- 後端 API 全部端點（FastAPI）
- 資料庫 schema + 種子資料
- systemd 服務 + Nginx 反向代理

### ✅ Phase 4：前後端整合
- 建立 `adapters.js`（15+ 個轉換函式，含 Session/Message 轉換）
- 所有頁面從 mockData 改為呼叫後端 API（失敗時 fallback 到 mock）
- `api.js` 完整的 axios instance + interceptors + SSE streaming 支援

### ✅ Bug 修復
1. **角色變更不即時反映**：AuthContext 加入 60 秒定期刷新 + visibilitychange 監聽
2. **權限移除後仍可訪問頁面**：ProtectedRoute 加入 `requiredPermission` prop，App.jsx 為 settings 路由設定權限
3. **權限提升漏洞（Privilege Escalation）**：user_manager 可以把自己或他人的角色改成 super_admin
   - 後端 `permissions.py` 加入 `ROLE_HIERARCHY`（角色等級定義）+ `validate_role_operation()`（階層驗證函式）+ `get_assignable_roles()`
   - 後端 `permissions.py` 的 `require_permission` / `require_any_permission` 改為從 DB 讀取最新角色（不再依賴 JWT 快照）
   - 後端 `user_api.py` 所有寫入端點（create / update / role / status）加入階層檢查：
     - 不能操作自己
     - 不能操作等級 ≥ 自己的使用者
     - 不能指派等級 ≥ 自己的角色
   - 新增 `GET /api/users/assignable-roles` API，回傳當前使用者可指派的角色列表
   - 前端 `mockData.js` 加入 `ROLE_HIERARCHY`、`canOperateUser()`、`getAssignableRoles()` 函式
   - 前端 `UserManagement.jsx`：
     - 角色下拉選單只顯示可指派的角色（從 API 取得）
     - 對等級 ≥ 自己或自己的使用者，編輯/停用/角色變更按鈕 disabled + Tooltip 提示
     - 自己那一行顯示「本人」Tag

### ✅ Phase 4.5：國家級資料隔離
**架構變更：**
- 同一台 PG 伺服器上建立 4 個 Local DB（azuretestDB_TW/SG/JP/TH）
- 圖書館從 Global DB 移至 Local DB（`LocalLibrary` model）
- Agent 維持全球共用（存在 Global DB）

**後端變更：**
- `.env` 的 `LOCAL_DB_CONFIG` 擴展為 4 國設定
- `models/local_models.py` 新增 `LocalLibrary` model
- `api/library_api.py` 改為從 Local DB 讀寫 + `_resolve_country()` helper
- `api/announcement_api.py` 加入 `_resolve_country()` helper + `?country=XX` 支援
- `api/user_api.py` 加入 `_resolve_country_filter()` helper（國家隔離篩選）
- `api/country_api.py` 新增 `GET /api/countries` 端點
- `main.py` 註冊 country_api router
- `seed_data.py` 重寫：Global DB + 各國 Local DB 種子資料

**前端變更：**
- `api.js` 新增 `countryAPI` + 公告/圖書館 API 加入 `country` 參數
- `UserManagement.jsx` 國家隔離 UI（super_admin 國家篩選下拉、非 super_admin 顯示國家標籤）
- `AnnouncementSettings.jsx` super_admin 國家切換下拉
- `LibrarySettings.jsx` super_admin 國家切換下拉

**隔離邏輯：**
- 後端 `_resolve_country()` pattern：
  - `super_admin` + 有 `?country=XX` → 使用指定國家
  - `super_admin` + 無 `?country` → 使用自己國家（預設）
  - 非 `super_admin` + 有 `?country=XX` → 403 錯誤
  - 非 `super_admin` + 無 `?country` → 使用自己國家

### ✅ Phase 4.6：檔案上傳 + Bug 修復 + UX 改進

**檔案儲存服務：**
- 新增 `services/storage_service.py` — 本地磁碟檔案儲存服務（未來可替換為 Azure Blob Storage）
- 儲存路徑：`uploads/{country_code}/{category}/{item_id}/{filename}`
- 支援圖書館文件和公告附件兩種類型
- 檔案大小限制：100MB（前後端雙重驗證）

**圖書館檔案上傳/下載/刪除：**
- `POST /api/library/upload` — 實際儲存檔案到本地磁碟（支援多檔案）
- `GET /api/library/{doc_id}/download` — FileResponse 串流下載（支援指定檔名）
- `GET /api/library/{doc_id}/preview` — PDF 預覽
- `DELETE /api/library/{doc_id}` — 同步刪除 DB 記錄 + 實體檔案
- `DELETE /api/library/{doc_id}/file` — 刪除單一附件
- `POST /api/library/{doc_id}/upload-file` — 追加上傳附件到已有文件
- `PUT /api/library/{doc_id}` — 編輯文件資訊（名稱、描述、館名）
- `GET /api/library/latest` — 最新文件（首頁用，按建立時間倒序）

**公告附件上傳/下載/刪除：**
- 新增 `POST /api/announcements/upload-file` — 上傳公告附件（多檔案）
- 新增 `GET /api/announcements/{notice_id}/download` — 下載公告附件
- 新增 `GET /api/announcements/{notice_id}/preview` — 預覽公告附件 PDF
- 新增 `DELETE /api/announcements/{notice_id}/file` — 刪除單一附件
- 前端 `AnnouncementSettings.jsx` 修復附件上傳流程（先建立公告 → 上傳附件）

**Bug 修復 — 刪除使用者：**
- 新增 `DELETE /api/users/{email}` — 硬刪除使用者
- 含階層檢查（不能刪自己、不能刪等級 ≥ 自己的人）
- 含國家隔離檢查
- 自動清理 Local DB 的 OTP 紀錄
- 前端 `UserManagement.jsx` 新增刪除按鈕（含二次確認）

**Bug 修復 — 刪除館：**
- 新增 `DELETE /api/library/by-library/{library_name}` — 刪除空館
- 有文件的館無法刪除（回傳 400 + 提示訊息）
- 前端 `LibrarySettings.jsx` 新增「館名管理」區塊（含刪除按鈕）

**UX 改進 — TopBar 國家選擇器：**
- 新增 `CountryContext.jsx` — 全域國家狀態管理
- TopBar 右上角新增國家顯示（一般使用者顯示 Tag，super_admin 顯示下拉選單）
- 移除各頁面（Home、Library、LibrarySettings、AnnouncementSettings）中各自的國家選擇器
- 所有頁面共用 TopBar 的國家狀態

### ✅ Phase 4.7：Agatha AI 串接 + 對話歷史

**Agatha Public API 整合：**
- `chat_api.py` 整合 Agatha Public API（`POST https://uat.heph-ai.net/agatha/public/api/public-api-keys/chat`）
- 支援 Streaming SSE 模式（優先）+ 非 Streaming fallback
- 根據 Agent 的 `agent_config_json.agatha_enabled` 判斷是否走 Agatha
- 非 Agatha Agent 回傳 mock 回覆
- `config.py` 新增 `AGATHA_API_URL`、`AGATHA_API_KEY`、`AGATHA_API_TIMEOUT` 設定

**Portal MongoDB 對話歷史：**
- 新增 `core/portal_mongo.py` — 獨立的 Portal MongoDB 連線管理
- 雙 Collection 架構：`ctbc_portal_sessions`（Session 摘要）+ `ctbc_portal_messages`（每條訊息）
- 自動建立索引：`(user_email, updated_at)` + `(session_id)` unique + `(session_id, created_at)`
- `config.py` 新增 `PORTAL_MONGO_URI`、`PORTAL_MONGO_DB` 設定
- `main.py` lifespan 中初始化/關閉 Portal MongoDB

**對話 Session API：**
- `POST /api/chat/stream` — Streaming 聊天（SSE），前端收到 content/complete/error 事件
- `GET /api/chat/sessions` — Session 列表（分頁，**使用者隔離**：只能看自己的對話）
- `GET /api/chat/sessions/{session_id}` — Session 詳情（含所有訊息，驗證所有權）
- `DELETE /api/chat/sessions/{session_id}` — 刪除 Session 及所有訊息（驗證所有權）
- 舊版 `/api/chat/history` 和 `/api/chat/{chat_id}` 標記為 deprecated，保留向後相容

**前端對話功能：**
- `api.js` 新增 `chatAPI.stream()` — 使用 fetch + ReadableStream 處理 SSE
- `api.js` 新增 `chatAPI.sessions()` / `chatAPI.sessionDetail()` / `chatAPI.deleteSession()`
- `adapters.js` 新增 `adaptSessionSummary()` / `adaptSessionList()` / `adaptSessionDetail()` / `formatDateTime()`
- `AgentChat.jsx` 完整 Streaming 聊天 UI：
  - Agent 選擇 → 發送訊息 → SSE 即時串流顯示 → 多輪對話（session_id 延續）
  - 支援中斷串流、新對話、從歷史繼續對話（URL 參數 `?session=xxx&agent=xxx`）
  - 打字指示器動畫 + 串流游標
- `ChatHistory.jsx` 完整對話歷史 UI：
  - Session 列表（分頁）+ Agent 篩選 + 搜尋
  - 點擊查看詳情（Modal 顯示所有訊息）
  - 繼續對話（跳轉到 AgentChat）
  - 刪除對話（含二次確認）

**Agent ACL 授權過濾：**
- 後端 `agent_api.py` 的 `GET /api/agents` 依 ACL 過濾：
  - `super_admin` / `platform_admin`（有 `access_all_agents` 權限）→ 看到所有已上架 Agent
  - 其他角色 → 透過 `_check_acl()` 檢查 `authorized_roles` / `authorized_users` / `exception_list`
- 後端 `PUT /api/agents/{id}/acl` — 更新 Agent 授權規則
- 前端 `AgentPermissions.jsx` — 管理頁面（上架/下架 Switch + 使用者指派 Transfer）

### ✅ Phase 4.8：圖書館館名獨立表

**新增 `local_library_catalog` 表：**
- 館名不再只是 `local_library` 表中文件的一個欄位，改為獨立的 `local_library_catalog` 表
- 館的生命週期由管理者手動控制，刪除館內所有文件後館名不會自動消失

**後端變更：**
- `models/local_models.py` 新增 `LocalLibraryCatalog` model（`catalog_id`, `library_name`, `description`, `created_at`）
- `models/schemas.py` 新增 `LibraryCatalogCreate` / `LibraryCatalogResponse` schema
- `api/library_api.py`：
  - 新增 `GET /api/library/catalogs` — 取得所有館名列表（含各館文件數量）
  - 新增 `POST /api/library/catalogs` — 手動建立新館（不需要同時上傳文件）
  - `POST /api/library/upload` 上傳時自動建立 catalog（如果不存在）
  - `DELETE /api/library/by-library/{name}` 改為刪除 catalog 記錄（僅限空館）
- `seed_data.py` 種子資料新增 catalog 記錄（先建 catalog 再建文件）

**前端變更：**
- `api.js` 新增 `libraryAPI.listCatalogs()` / `libraryAPI.createCatalog()`
- `adapters.js` 新增 `adaptCatalog()` / `adaptCatalogs()`
- `adaptLibraryDocs()` 改為接收可選的 `catalogs` 參數，確保空館也出現在分組中
- `LibrarySettings.jsx`：
  - `fetchLibrary()` 同時載入 catalogs + 文件（`Promise.all`）
  - 館名管理區塊改為從 catalog API 取得，空館顯示「0 個文件」
  - 新增館名改為呼叫後端 `POST /api/library/catalogs` API（不再只是前端 state）
  - Modal 中的館名選項改用 catalog API
- `Library.jsx` 的 `fetchLibrary()` 同時載入 catalogs，確保空館也顯示
- 5 個 i18n 翻譯檔新增 `addLibraryFailed` key
- **遷移腳本** `migrations/add_library_catalog.py`：自動建立 catalog 表 + 從現有 library 資料填充
- **Fallback 機制**：`fetchLibrary()` 在 catalog API 失敗或回傳空時，從文件資料中提取館名作為 fallback（`LibrarySettings.jsx` + `Library.jsx`）

## 10. 待完成的工作

### 🔲 Phase 5：外部服務整合
- [ ] **Azure Blob Storage**：將本地檔案儲存替換為 Blob Storage（目前使用 `services/storage_service.py` 本地儲存）
- [x] **Agent 服務串接**：~~AgentChat 的聊天功能需要串接實際的 AI Agent 服務~~ → 已完成 Agatha Public API 整合（Phase 4.7）
- [ ] **Email OTP**：設定 SMTP 讓 OTP 透過 email 發送（目前 dev 模式直接回傳，`auth_api.py` 第 84 行有 `# TODO: 實作 Email 寄送`）
- [x] **MongoDB 設定**：~~聊天歷史需要 MongoDB~~ → 已完成 Portal MongoDB 架構（Phase 4.7），需設定 `PORTAL_MONGO_URI` 環境變數即可啟用

### 🔲 Phase 5.5：會員資訊頁面
- [ ] **新增會員資訊頁面（Profile Page）**：目前 TopBar 的會員頭像（`TopBar.jsx` L70 `<Avatar>`）只是靜態圖示，沒有任何互動功能
  - 新增 `pages/Profile.jsx` — 顯示當前使用者資訊（姓名、Email、角色、國家、部門等）
  - `App.jsx` 新增 `/profile` 路由
  - `TopBar.jsx` 的 `<Avatar>` 加入 `onClick={() => navigate('/profile')}` 或改用 Dropdown（含「個人資訊」+「登出」選項）
  - 後端 `GET /api/auth/me` 已有回傳完整使用者資訊，前端只需新增頁面呈現
  - 可考慮未來擴充：修改顯示名稱、上傳頭像、變更密碼等

### 🔲 Phase 6：安全性與稽核
- [ ] Rate limiting（登入嘗試限制）
- [ ] HTTPS 強制
- [ ] 稽核日誌完善（目前僅認證相關操作寫入 GlobalAuditLog，CRUD 操作未記錄）
- [ ] JWT refresh token 機制
- [ ] CORS 設定收緊（目前允許 localhost）

### 🔲 Phase 7：測試與優化
- [ ] 前端單元測試
- [ ] 後端 API 測試
- [ ] 效能優化（code splitting、lazy loading — 目前 App.jsx 所有頁面直接 import，未使用 React.lazy）
- [ ] 錯誤處理統一化

### ✅ Bug 修復批次（2026-03-06）

1. **AgentPermissions ACL 儲存 Bug**
   - `handleAssignSave()` 原本只更新前端 state，未呼叫後端 API
   - 修復：改為 `async`，呼叫 `agentAPI.updateACL()` 後再更新前端 state + 重新載入
   - 影響檔案：`azure-portal/src/pages/settings/AgentPermissions.jsx`

2. **首頁 Agent 卡片點擊後未自動選擇 Agent**
   - `Home.jsx` 的 `navigate('/agent-store/chat')` 改為帶 `?agent=xxx` 參數
   - `AgentChat.jsx` 的 URL 參數處理增加「只有 `?agent` 沒有 `?session`」的分支
   - 影響檔案：`Home.jsx`, `AgentChat.jsx`

3. **首頁圖書館卡片點擊後未自動打開對應文件**
   - `Home.jsx` 的 `navigate('/library')` 改為帶 `?doc=xxx` 參數
   - `Library.jsx` 加入 `useSearchParams`，資料載入完成後自動找到對應文件並打開 Modal
   - 影響檔案：`Home.jsx`, `Library.jsx`

4. **PDF 預覽 Modal 溢出 viewport**
   - Modal body 高度改為 `calc(100vh - 40px - 55px)` + `display: flex; flex-direction: column; overflow: hidden`
   - iframe 改用 `flex: 1; min-height: 0` 取代 `height: 100%`
   - tabs 加 `flex-shrink: 0`
   - 影響檔案：`Home.jsx`, `Library.jsx`, `Home.css`, `Library.css`

5. **首頁公告欄無數量限制 + 缺少歷史公告入口**
   - 後端 `GET /api/announcements` 新增 `limit` query parameter
   - 前端首頁公告最多顯示 5 筆，超過顯示「還有 N 則公告...」連結
   - 新增「查看全部公告」按鈕 → 開啟 Modal 顯示完整公告列表（含搜尋、分頁）
   - 不再只過濾 `isNew`（7 天內），改為顯示所有已發布公告（按時間倒序）
   - 影響檔案：`announcement_api.py`, `api.js`, `Home.jsx`, `Home.css`, 5 個 i18n 翻譯檔

6. **Modal 捲軸 + 公告欄 UX 改進**
  - PDF 預覽 Modal 與全部公告 Modal 加入 `wrapClassName="no-scroll-modal"` + CSS `overflow: hidden` 禁止頁面級捲軸
  - 全部公告 Modal 加入 `centered`，body `overflow: hidden`，每頁 4 筆，列表項更緊湊
  - 公告欄底部「還有 N 條公告」改為「查看所有公告」連結，移除右上角重複的「查看所有公告」按鈕
  - 影響檔案：`Home.jsx`, `Home.css`, `Library.css`

### 🔲 已知問題 / Bug
- Vite build 產出 > 500KB 的 chunk（建議做 code splitting）
- ~~**圖書館館名消失問題**~~ → 已在 Phase 4.8 解決（館名改為獨立的 `local_library_catalog` 表）
- `super_admin` 不指定國家時，公告/圖書館預設顯示自己國家（TW）的資料，若要看全部國家需逐一切換

## 11. Git 歷史

```
(pending) feat: Phase 4.8 圖書館館名獨立表 — local_library_catalog + catalog API
(pending) fix: 5 個已知 Bug 修復（ACL 儲存、Agent 卡片、圖書館卡片、PDF Modal、公告欄）
(pending) feat: Agatha AI 串接 + Portal MongoDB 對話歷史 + Session API
(pending) feat: 檔案上傳實作 + 刪除使用者/館 + TopBar 國家選擇器
(pending) feat: 國家級資料隔離 — 各國獨立 Local DB + super_admin 跨國管理
(pending) fix: 權限提升漏洞修復 — 角色階層檢查 + UI 操作限制
59f9d7e fix: 路由權限守衛 — settings 頁面需要對應權限才能訪問
1070452 fix: AuthContext 定期刷新使用者資訊（偵測角色變更）
8f59f8e feat: Phase 4 完成 — 所有前端頁面改用後端 API
```

---

> **最後更新**：2026-03-06
