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
| 聊天 DB | MongoDB（**尚未設定**，聊天功能 graceful degradation） | — |
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
├── local_library                ← 圖書館文件（各國獨立）
└── file_lifecycle               ← 檔案生命週期
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
contexts/CountryContext.jsx          # 全域國家狀態管理（TopBar 國家選擇器）
components/ProtectedRoute.jsx    # 路由守衛（支援 requiredPermission prop）
components/Layout.jsx            # 主版面（Sidebar + TopBar + Outlet）
components/Sidebar.jsx           # 側邊欄（根據權限動態顯示選單）
components/TopBar.jsx            # 頂部欄
services/api.js                  # axios instance + 所有 API 函式（含 countryAPI）
utils/adapters.js                # 後端↔前端欄位名稱轉換（15 個函式）
data/mockData.js                 # 靜態假資料（fallback 用）
pages/Home.jsx                   # 首頁（公告 + Agent 列表）
pages/Login.jsx                  # OTP 登入頁
pages/AgentChat.jsx              # Agent 對話（Agent 列表 API，聊天 mock）
pages/ChatHistory.jsx            # 對話歷史（嘗試 API，fallback mock）
pages/Library.jsx                # 圖書館瀏覽
pages/settings/AnnouncementSettings.jsx  # 公告 CRUD（super_admin 國家切換）
pages/settings/AgentPermissions.jsx      # Agent 權限管理
pages/settings/LibrarySettings.jsx       # 圖書館管理（super_admin 國家切換）
pages/settings/UserManagement.jsx        # 使用者管理（國家隔離 + super_admin 國家篩選）
```

### 後端 (`Azure/backend/`)
```
main.py                          # FastAPI 入口 + 靜態檔案 serve
config.py                        # Pydantic Settings（讀 .env，含 LOCAL_DB_CONFIG）
seed_data.py                     # 種子資料（10 使用者 + 5 Agent + 各國公告/圖書館）
start.sh                         # systemd 啟動腳本
api/auth_api.py                  # 認證 API（OTP + JWT + /me）
api/user_api.py                  # 使用者 CRUD API（國家隔離）
api/agent_api.py                 # Agent 管理 API（全球共用）
api/announcement_api.py          # 公告 CRUD API（國家隔離 + super_admin 跨國）
api/library_api.py               # 圖書館管理 API（國家隔離 + super_admin 跨國，存 Local DB）
api/country_api.py               # 國家列表 API（GET /api/countries）
api/chat_api.py                  # 對話 API（需 MongoDB）
core/database.py                 # Global DB（PostgreSQL）連線
core/local_database.py           # Local DB 工廠（PG + MongoDB，管理各國連線池）
core/data_router.py              # DataRouter（根據 country_code 路由到正確的 Local DB）
core/permissions.py              # 角色權限定義 + require_permission dependency
core/security.py                 # JWT 編解碼 + OTP 雜湊
models/global_models.py          # Global DB ORM（UserRouteMap, AgentMaster, AgentACL, GlobalLibrary, GlobalAuditLog）
models/local_models.py           # Local DB ORM（OTPVault, LoginAudit, LocalNotice, LocalLibrary, FileLifecycle）
models/schemas.py                # Pydantic Request/Response schemas
services/storage_service.py           # 本地檔案儲存服務（uploads/ 目錄管理）
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
| Agent | `/api/agents` | GET | 已發布 Agent 列表 | ❌ 全球共用 |
| | `/api/agents/all` | GET | 全部 Agent（管理用） | ❌ 全球共用 |
| | `/api/agents/{id}/publish` | PUT | 更新發布狀態 | ❌ 全球共用 |
| | `/api/agents/{id}/acl` | PUT | 更新存取控制 | ❌ 全球共用 |
| 公告 | `/api/announcements` | GET | 已發布公告 | ✅ `?country=XX` |
| | `/api/announcements/all` | GET | 全部公告（管理用） | ✅ `?country=XX` |
| | `/api/announcements` | POST | 新增公告 | ✅ `?country=XX` |
| | `/api/announcements/{id}` | PUT | 更新公告 | ✅ `?country=XX` |
| | `/api/announcements/{id}` | DELETE | 刪除公告 | ✅ `?country=XX` |
| | `/api/announcements/upload-file` | POST | 上傳公告附件 | ✅ `?country=XX` |
| | `/api/announcements/{id}/download` | GET | 下載公告附件 | ✅ `?country=XX` |
| 圖書館 | `/api/library` | GET | 使用者可見文件 | ✅ `?country=XX` |
| | `/api/library/all` | GET | 全部文件（管理用） | ✅ `?country=XX` |
| | `/api/library/upload` | POST | 上傳文件（multipart） | ✅ `?country=XX` |
| | `/api/library/{id}` | DELETE | 刪除文件 | ✅ `?country=XX` |
| | `/api/library/{id}/auth` | PUT | 更新文件權限 | ✅ `?country=XX` |
| | `/api/library/{id}/download` | GET | 下載文件 | ✅ `?country=XX` |
| | `/api/library/by-library/{library_name}` | DELETE | 刪除空館 | ✅ `?country=XX` |
| 國家 | `/api/countries` | GET | 已設定的國家列表 | — |
| 對話 | `/api/chat` | POST | 發送訊息（需 MongoDB） | — |
| | `/api/chat/history` | GET | 對話歷史（需 MongoDB） | — |
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
- 建立 `adapters.js`（15 個轉換函式）
- 所有頁面從 mockData 改為呼叫後端 API（失敗時 fallback 到 mock）
- `api.js` 完整的 axios instance + interceptors

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
- `POST /api/library/upload` — 實際儲存檔案到本地磁碟
- `GET /api/library/{doc_id}/download` — FileResponse 串流下載
- `DELETE /api/library/{doc_id}` — 同步刪除 DB 記錄 + 實體檔案

**公告附件上傳/下載：**
- 新增 `POST /api/announcements/upload-file` — 上傳公告附件
- 新增 `GET /api/announcements/{notice_id}/download` — 下載公告附件
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

## 10. 待完成的工作

### 🔲 Phase 5：外部服務整合
- [ ] **Azure Blob Storage**：將本地檔案儲存替換為 Blob Storage（目前使用 `services/storage_service.py` 本地儲存）
- [ ] **Agent 服務串接**：AgentChat 的聊天功能需要串接實際的 AI Agent 服務
- [ ] **Email OTP**：設定 SMTP 讓 OTP 透過 email 發送（目前 dev 模式直接回傳）
- [ ] **MongoDB 設定**：聊天歷史需要 MongoDB（目前 graceful degradation）

### 🔲 Phase 6：安全性與稽核
- [ ] Rate limiting（登入嘗試限制）
- [ ] HTTPS 強制
- [ ] 稽核日誌完善（GlobalAuditLog 寫入）
- [ ] JWT refresh token 機制
- [ ] CORS 設定收緊（目前允許 localhost）

### 🔲 Phase 7：測試與優化
- [ ] 前端單元測試
- [ ] 後端 API 測試
- [ ] 效能優化（code splitting、lazy loading）
- [ ] 錯誤處理統一化

### 🔲 已知問題
- Vite build 產出 > 500KB 的 chunk（建議做 code splitting）
- `ReadWritePaths` 在 service 檔案中只允許 backend 目錄，但 build 需要寫入 `backend/static`（目前可運作因為 static 在 backend 下）
- `super_admin` 不指定國家時，公告/圖書館預設顯示自己國家（TW）的資料，若要看全部國家需逐一切換

## 11. Git 歷史

```
(pending) feat: 檔案上傳實作 + 刪除使用者/館 + TopBar 國家選擇器
(pending) feat: 國家級資料隔離 — 各國獨立 Local DB + super_admin 跨國管理
(pending) fix: 權限提升漏洞修復 — 角色階層檢查 + UI 操作限制
59f9d7e fix: 路由權限守衛 — settings 頁面需要對應權限才能訪問
1070452 fix: AuthContext 定期刷新使用者資訊（偵測角色變更）
8f59f8e feat: Phase 4 完成 — 所有前端頁面改用後端 API
```

---

> **最後更新**：2026-03-04
