 import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { countryAPI } from '../services/api';
import { useAuth } from './AuthContext';

const CountryContext = createContext(null);

const STORAGE_KEY = 'ctbc_selected_country';

export const CountryProvider = ({ children }) => {
  const { user } = useAuth();
  // root / admin 角色可跨國查看
  const isSuperAdmin = user?.role === 'root' || user?.role === 'admin';
  // 用 ref 避免 useCallback closure 讀到舊值
  const isSuperAdminRef = useRef(isSuperAdmin);
  useEffect(() => { isSuperAdminRef.current = isSuperAdmin; }, [isSuperAdmin]);

  // 追蹤 user 是否曾經登入過（區分「初始化中」和「真正登出」）
  const wasLoggedInRef = useRef(false);

  const [countries, setCountries] = useState([]);
  // 初始值直接從 localStorage 讀取，避免重整後閃回預設國家
  const [selectedCountry, setSelectedCountry] = useState(
    () => localStorage.getItem(STORAGE_KEY) || undefined
  );
  // selectedCountry:
  //   undefined = 尚未初始化
  //   'TW'/'SG'/... = 當前選擇的國家

  // 載入國家列表
  const refreshCountries = useCallback(() => {
    if (user) {
      countryAPI.list().then((res) => {
        setCountries(res.data || []);
      }).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    refreshCountries();
  }, [refreshCountries]);

  // 使用者登入時設定預設國家，登出時重置
  useEffect(() => {
    if (user) {
      // 標記曾經登入
      wasLoggedInRef.current = true;
      if (isSuperAdmin && selectedCountry === undefined) {
        // root / admin：localStorage 無記錄時，預設自己的國家
        setSelectedCountry(user.country || 'TW');
      }
    } else if (wasLoggedInRef.current) {
      // 只有曾經登入後才清除（真正登出），避免初始化時 user 還沒載入就清除
      localStorage.removeItem(STORAGE_KEY);
      setSelectedCountry(undefined);
      wasLoggedInRef.current = false;
    }
    // user 是 undefined/null 且 wasLoggedInRef 是 false = 初始化中，不做任何事
  }, [user, isSuperAdmin]);

  // 取得當前有效的國家代碼（用於 API 呼叫）
  const effectiveCountry = isSuperAdmin ? selectedCountry : undefined;
  // 非 root/admin: undefined 表示不傳 country 參數（後端會用使用者自己的國家）

  // 取得顯示用的國家代碼
  const displayCountry = selectedCountry || user?.country || 'TW';

  const handleCountryChange = useCallback((value) => {
    if (!isSuperAdminRef.current) return;
    const newValue = value || undefined;
    setSelectedCountry(newValue);
    // 持久化到 localStorage，重整後恢復
    if (newValue) {
      localStorage.setItem(STORAGE_KEY, newValue);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []); // 不依賴 isSuperAdmin，改用 ref 讀取最新值

  return (
    <CountryContext.Provider value={{
      countries,
      selectedCountry,
      effectiveCountry,
      displayCountry,
      isSuperAdmin,
      setSelectedCountry: handleCountryChange,
      refreshCountries,
    }}>
      {children}
    </CountryContext.Provider>
  );
};

export const useCountry = () => {
  const context = useContext(CountryContext);
  if (!context) {
    throw new Error('useCountry must be used within a CountryProvider');
  }
  return context;
};
