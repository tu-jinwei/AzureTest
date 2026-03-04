import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, getToken, setToken, removeToken } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 啟動時自動檢查 localStorage 中的 token
  useEffect(() => {
    const initAuth = async () => {
      const token = getToken();
      if (token) {
        try {
          const response = await authAPI.getMe();
          setUser(response.data);
        } catch (error) {
          console.error('Token 驗證失敗:', error);
          removeToken();
          setUser(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  // 登入：儲存 token 並設定使用者
  const login = useCallback((token, userData) => {
    setToken(token);
    setUser(userData);
  }, []);

  // 登出：清除 token 和使用者狀態
  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      // 即使 API 呼叫失敗也要清除本地狀態
      console.error('登出 API 呼叫失敗:', error);
    } finally {
      removeToken();
      setUser(null);
    }
  }, []);

  // 檢查使用者是否有特定權限
  const hasPermission = useCallback(
    (permission) => {
      if (!user || !user.permissions) return false;
      return user.permissions.includes(permission);
    },
    [user]
  );

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
