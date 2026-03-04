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
  list: () =>
    api.get('/announcements'),

  listAll: () =>
    api.get('/announcements/all'),

  create: (data) =>
    api.post('/announcements', data),

  update: (noticeId, data) =>
    api.put(`/announcements/${noticeId}`, data),

  delete: (noticeId) =>
    api.delete(`/announcements/${noticeId}`),
};

// ===== 圖書館 API =====
export const libraryAPI = {
  list: () =>
    api.get('/library'),

  listAll: () =>
    api.get('/library/all'),

  upload: (formData) =>
    api.post('/library/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  delete: (docId) =>
    api.delete(`/library/${docId}`),

  updateAuth: (docId, authData) =>
    api.put(`/library/${docId}/auth`, authData),

  download: (docId) =>
    api.get(`/library/${docId}/download`, { responseType: 'blob' }),
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

export default api;
