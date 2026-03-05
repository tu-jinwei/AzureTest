import axios from 'axios';

// ===== Token 管理 =====
const TOKEN_KEY = 'ctbc_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const removeToken = () => localStorage.removeItem(TOKEN_KEY);

// ===== Axios Instance =====
// 偵測是否在 /AzureTest/ 路徑下（Nginx 反向代理）
const BASE_PREFIX = window.location.pathname.startsWith('/AzureTest') ? '/AzureTest' : '';

const api = axios.create({
  baseURL: `${BASE_PREFIX}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor：自動附加 Authorization header
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor：401 時自動清除 token 並跳轉到 login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      removeToken();
      // 避免在 login 頁面重複跳轉
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/AzureTest/login';
      }
    }
    return Promise.reject(error);
  }
);

// ===== 認證 API =====
export const authAPI = {
  requestOTP: (email) =>
    api.post('/auth/request-otp', { email }),

  verifyOTP: (email, otpCode) =>
    api.post('/auth/verify-otp', { email, otp_code: otpCode }),

  getMe: () =>
    api.get('/auth/me'),

  logout: () =>
    api.post('/auth/logout'),
};

// ===== 使用者管理 API =====
export const userAPI = {
  list: (params) =>
    api.get('/users', { params }),

  create: (data) =>
    api.post('/users', data),

  update: (email, data) =>
    api.put(`/users/${encodeURIComponent(email)}`, data),

  updateStatus: (email, status) =>
    api.patch(`/users/${encodeURIComponent(email)}/status`, { status }),

  updateRole: (email, role) =>
    api.patch(`/users/${encodeURIComponent(email)}/role`, { role }),

  getAssignableRoles: () =>
    api.get('/users/assignable-roles'),

  delete: (email) =>
    api.delete(`/users/${encodeURIComponent(email)}`),
};

// ===== Agent API =====
export const agentAPI = {
  list: () =>
    api.get('/agents'),

  listAll: () =>
    api.get('/agents/all'),

  updatePublish: (agentId, isPublished) =>
    api.put(`/agents/${agentId}/publish`, { is_published: isPublished }),

  updateACL: (agentId, aclData) =>
    api.put(`/agents/${agentId}/acl`, aclData),
};

// ===== 公告 API =====
export const announcementAPI = {
  /** @param {string} [country] - 國家代碼（僅 super_admin 可跨國） */
  list: (country) =>
    api.get('/announcements', { params: country ? { country } : {} }),

  /** @param {string} [country] - 國家代碼（僅 super_admin 可跨國） */
  listAll: (country) =>
    api.get('/announcements/all', { params: country ? { country } : {} }),

  /** @param {string} [country] - 目標國家（僅 super_admin 可跨國建立） */
  create: (data, country) =>
    api.post('/announcements', data, { params: country ? { country } : {} }),

  /** @param {string} [country] - 目標國家（僅 super_admin 可跨國編輯） */
  update: (noticeId, data, country) =>
    api.put(`/announcements/${noticeId}`, data, { params: country ? { country } : {} }),

  /** @param {string} [country] - 目標國家（僅 super_admin 可跨國刪除） */
  delete: (noticeId, country) =>
    api.delete(`/announcements/${noticeId}`, { params: country ? { country } : {} }),

  /** 下載公告附件
   * @param {string} noticeId - 公告 ID
   * @param {string} [country] - 國家代碼
   * @param {string} [filename] - 指定下載的檔案名稱（多附件時使用）
   */
  download: (noticeId, country, filename) =>
    api.get(`/announcements/${noticeId}/download`, {
      responseType: 'blob',
      params: {
        ...(country ? { country } : {}),
        ...(filename ? { filename } : {}),
      },
    }),

  /** 預覽公告附件 PDF（回傳 blob）
   * @param {string} noticeId - 公告 ID
   * @param {string} [country] - 國家代碼
   * @param {string} [filename] - 指定預覽的檔案名稱（多附件時使用）
   */
  preview: (noticeId, country, filename) =>
    api.get(`/announcements/${noticeId}/preview`, {
      responseType: 'blob',
      params: {
        ...(country ? { country } : {}),
        ...(filename ? { filename } : {}),
      },
    }),

  /** 上傳公告附件（支援多檔案）
   * @param {string} noticeId - 公告 ID
   * @param {FormData} formData - 包含 file 的 FormData（可多個）
   * @param {string} [country] - 國家代碼（僅 super_admin 可跨國）
   */
  uploadFile: (noticeId, formData, country) =>
    api.post('/announcements/upload-file', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { notice_id: noticeId, ...(country ? { country } : {}) },
    }),

  /** 刪除公告的單一附件
   * @param {string} noticeId - 公告 ID
   * @param {string} filename - 要刪除的附件檔名
   * @param {string} [country] - 國家代碼（僅 super_admin 可跨國）
   */
  deleteFile: (noticeId, filename, country) =>
    api.delete(`/announcements/${noticeId}/file`, {
      params: { filename, ...(country ? { country } : {}) },
    }),
};

// ===== 圖書館 API =====
export const libraryAPI = {
  /** @param {string} [country] - 國家代碼（僅 super_admin 可跨國） */
  list: (country) =>
    api.get('/library', { params: country ? { country } : {} }),

  /** 取得最新的圖書館文件（首頁用，按建立時間倒序）
   * @param {string} [country] - 國家代碼
   * @param {number} [limit=4] - 回傳筆數
   */
  latest: (country, limit = 4) =>
    api.get('/library/latest', {
      params: {
        ...(country ? { country } : {}),
        limit,
      },
    }),

  /** @param {string} [country] - 國家代碼（僅 super_admin 可跨國） */
  listAll: (country) =>
    api.get('/library/all', { params: country ? { country } : {} }),

  upload: (formData, config = {}) =>
    api.post('/library/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      ...config,
    }),

  /** @param {object} [config] - axios config（可含 params.country） */
  delete: (docId, config = {}) =>
    api.delete(`/library/${docId}`, config),

  /** 編輯文件資訊（名稱、描述、館名）
   * @param {string} docId - 文件 ID
   * @param {object} data - { name?, description?, library_name? }
   * @param {string} [country] - 國家代碼（僅 super_admin 可跨國）
   */
  update: (docId, data, country) =>
    api.put(`/library/${docId}`, data, { params: country ? { country } : {} }),

  /** 刪除文件的單一附件
   * @param {string} docId - 文件 ID
   * @param {string} filename - 要刪除的附件檔名
   * @param {string} [country] - 國家代碼（僅 super_admin 可跨國）
   */
  deleteFile: (docId, filename, country) =>
    api.delete(`/library/${docId}/file`, {
      params: { filename, ...(country ? { country } : {}) },
    }),

  /** 追加上傳附件到已有文件（支援多檔案）
   * @param {string} docId - 文件 ID
   * @param {FormData} formData - 包含 file 的 FormData（可多個）
   * @param {string} [country] - 國家代碼（僅 super_admin 可跨國）
   */
  uploadFile: (docId, formData, country) =>
    api.post(`/library/${docId}/upload-file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: country ? { country } : {},
    }),

  /** @param {string} [country] - 國家代碼（僅 super_admin 可跨國） */
  updateAuth: (docId, authData, country) =>
    api.put(`/library/${docId}/auth`, authData, { params: country ? { country } : {} }),

  /** 下載文件
   * @param {string} docId - 文件 ID
   * @param {string} [country] - 國家代碼（僅 super_admin 可跨國）
   * @param {string} [filename] - 指定下載的檔案名稱（多檔案時使用）
   */
  download: (docId, country, filename) =>
    api.get(`/library/${docId}/download`, {
      responseType: 'blob',
      params: {
        ...(country ? { country } : {}),
        ...(filename ? { filename } : {}),
      },
    }),

  /** 預覽 PDF（回傳 blob）
   * @param {string} docId - 文件 ID
   * @param {string} [country] - 國家代碼（僅 super_admin 可跨國）
   * @param {string} [filename] - 指定預覽的檔案名稱（多檔案時使用）
   */
  preview: (docId, country, filename) =>
    api.get(`/library/${docId}/preview`, {
      responseType: 'blob',
      params: {
        ...(country ? { country } : {}),
        ...(filename ? { filename } : {}),
      },
    }),

  /** 刪除整個館（僅限空館）
   * @param {string} libraryName - 館名
   * @param {string} [country] - 國家代碼（僅 super_admin 可跨國）
   */
  deleteLibrary: (libraryName, country) =>
    api.delete(`/library/by-library/${encodeURIComponent(libraryName)}`, {
      params: country ? { country } : {},
    }),
};

// ===== 對話 API（暫時保留，等 MongoDB）=====
export const chatAPI = {
  send: (data) =>
    api.post('/chat', data),

  history: () =>
    api.get('/chat/history'),

  detail: (chatId) =>
    api.get(`/chat/${chatId}`),
};

// ===== 國家 API =====
export const countryAPI = {
  /** 取得已設定 Local DB 的國家列表 */
  list: () =>
    api.get('/countries'),
};

export default api;
