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
| 資料庫 | PostgreSQL（Global + Local TW） | `10.0.0.138:5432/azuretestDB` |
| 聊天 DB | MongoDB（**尚未設定**，聊天功能 graceful degradation） | — |
| 服務管理 | systemd `ctbc-backend.service` | port 8079 |
| 反向代理 | Nginx `/AzureTest/` → `http://10.0.2.83:8079` | — |

## 3. 部署流程

```bash
# 1. 前端 build（輸出到 backend/static）
cd Azure/azure-portal && npm run build

# 2. 重啟後端（start.sh 會自動 build + 啟動 uvicorn）
sudo systemctl restart ctbc-backend

# 3. 檢查狀態
sudo systemctl status ctbc-backend --no-pager
```

**關鍵設定：**
- `vite.config.js`: `base: '/AzureTest/'`, `outDir: '../backend/static'`
- `backend/main.py`: FastAPI 同時 serve API (`/api/*`) 和前端靜態檔案（SPA fallback）
- `.env`: `APP_PORT=8079`, `APP_ENV=development`（dev 模式 OTP 會在 API response 的 `dev_otp` 欄位回傳）

## 4. 認證流程

1. 使用者輸入 email → `POST /api/auth/request-otp` → 回傳 `dev_otp`（dev 模式）
2. 輸入 OTP → `POST /api/auth/verify-otp` → 回傳 JWT `access_token` + `user` 物件
3. 前端存 token 到 `localStorage`，axios interceptor 自動附加 `Authorization: Bearer <token>`
4. `AuthContext` 每 60 秒呼叫 `GET /api/auth/me` 刷新使用者資訊（偵測角色變更）
5. 頁面切回時（visibilitychange）也會立即刷新

## 5. 角色與權限系統

| 角色 | 權限 |
|------|------|
| `super_admin` | 全部權限 + `cross_country_logs` |
| `platform_admin` | 全部權限（不含跨國日誌） |
| `user_manager` | 基本權限 + `manage_users` |
| `library_manager` | 基本權限 + `manage_library` |
| `user` | `view_announcements`, `use_agents`, `view_library`, `chat_history` |

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
components/ProtectedRoute.jsx    # 路由守衛（支援 requiredPermission prop）
components/Layout.jsx            # 主版面（Sidebar + TopBar + Outlet）
components/Sidebar.jsx           # 側邊欄（根據權限動態顯示選單）
components/TopBar.jsx            # 頂部欄
services/api.js                  # axios instance + 所有 API 函式
utils/adapters.js                # 後端↔前端欄位名稱轉換（15 個函式）
data/mockData.js                 # 靜態假資料（fallback 用）
pages/Home.jsx                   # 首頁（公告 + Agent 列表）
pages/Login.jsx                  # OTP 登入頁
pages/AgentChat.jsx              # Agent 對話（Agent 列表 API，聊天 mock）
pages/ChatHistory.jsx            # 對話歷史（嘗試 API，fallback mock）
pages/Library.jsx                # 圖書館瀏覽
pages/settings/AnnouncementSettings.jsx  # 公告 CRUD
pages/settings/AgentPermissions.jsx      # Agent 權限管理
pages/settings/LibrarySettings.jsx       # 圖書館管理
pages/settings/UserManagement.jsx        # 使用者管理
```

### 後端 (`Azure/backend/`)
```
main.py                          # FastAPI 入口 + 靜態檔案 serve
config.py                        # Pydantic Settings（讀 .env）
seed_data.py                     # 種子資料（5 使用者 + 3 Agent + 3 公告 + 4 文件）
start.sh                         # systemd 啟動腳本
api/auth_api.py                  # 認證 API（OTP + JWT + /me）
api/user_api.py                  # 使用者 CRUD API
api/agent_api.py                 # Agent 管理 API
api/announcement_api.py          # 公告 CRUD API
api/library_api.py               # 圖書館管理 API
api/chat_api.py                  # 對話 API（需 MongoDB）
core/database.py                 # Global DB（PostgreSQL）連線
core/local_database.py           # Local DB 工廠（PG + MongoDB）
core/permissions.py              # 角色權限定義 + require_permission dependency
core/security.py                 # JWT 編解碼 + OTP 雜湊
models/global_models.py          # Global DB ORM（UserRouteMap, AgentMaster, AgentACL, GlobalLibrary, GlobalAuditLog）
models/local_models.py           # Local DB ORM（OTPVault, LoginAudit, LocalNotice, FileLifecycle）
models/schemas.py                # Pydantic Request/Response schemas
```

## 7. API 端點總覽

| 模組 | 端點 | 方法 | 說明 |
|------|------|------|------|
| 認證 | `/api/auth/request-otp` | POST | 請求 OTP |
| | `/api/auth/verify-otp` | POST | 驗證 OTP，回傳 JWT |
| | `/api/auth/me` | GET | 取得當前使用者（從 DB 讀取） |
| | `/api/auth/logout` | POST | 登出 |
| 使用者 | `/api/users` | GET | 列表（支援 search, role, status 篩選） |
| | `/api/users` | POST | 新增使用者 |
| | `/api/users/{email}` | PUT | 更新使用者 |
| | `/api/users/{email}/status` | PATCH | 更新狀態 |
| | `/api/users/{email}/role` | PATCH | 更新角色 |
| Agent | `/api/agents` | GET | 已發布 Agent 列表 |
| | `/api/agents/all` | GET | 全部 Agent（管理用） |
| | `/api/agents/{id}/publish` | PUT | 更新發布狀態 |
| | `/api/agents/{id}/acl` | PUT | 更新存取控制 |
| 公告 | `/api/announcements` | GET | 已發布公告 |
| | `/api/announcements/all` | GET | 全部公告（管理用） |
| | `/api/announcements` | POST | 新增公告 |
| | `/api/announcements/{id}` | PUT | 更新公告 |
| | `/api/announcements/{id}` | DELETE | 刪除公告 |
| 圖書館 | `/api/library` | GET | 使用者可見文件 |
| | `/api/library/all` | GET | 全部文件（管理用） |
| | `/api/library/upload` | POST | 上傳文件（multipart） |
| | `/api/library/{id}` | DELETE | 刪除文件 |
| | `/api/library/{id}/auth` | PUT | 更新文件權限 |
| 對話 | `/api/chat` | POST | 發送訊息（需 MongoDB） |
| | `/api/chat/history` | GET | 對話歷史（需 MongoDB） |
| 系統 | `/api/health` | GET | 健康檢查 |

## 8. 種子資料帳號

| Email | 角色 | 密碼 |
|-------|------|------|
| `tina@ctbc.com` | super_admin | OTP（dev 模式從 API 回傳） |
| `alice@ctbc.com` | platform_admin | OTP |
| `bob@ctbc.com` | user_manager | OTP |
| `carol@ctbc.com` | library_manager | OTP |
| `dave@ctbc.com` | user | OTP |

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

## 10. 待完成的工作

### 🔲 Phase 5：外部服務整合
- [ ] **Azure Blob Storage**：檔案上傳改為存到 Blob Storage（目前 library upload 只存 metadata 到 DB）
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

## 11. Git 歷史

```
(pending) fix: 權限提升漏洞修復 — 角色階層檢查 + UI 操作限制
59f9d7e fix: 路由權限守衛 — settings 頁面需要對應權限才能訪問
1070452 fix: AuthContext 定期刷新使用者資訊（偵測角色變更）
8f59f8e feat: Phase 4 完成 — 所有前端頁面改用後端 API
```

---

> **最後更新**：2026-03-04
