import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { locales, DEFAULT_LANGUAGE, getLanguageByCountry, translate } from '../i18n';
import { useCountry } from './CountryContext';
import { useAuth } from './AuthContext';

const LanguageContext = createContext(null);

/**
 * LanguageProvider
 *
 * 目前固定使用繁體中文 (zh-TW)。
 * 未來如需恢復自動語言切換，取消下方註解即可。
 *
 * 原始邏輯（根據員工所在國家自動決定顯示語言）：
 * - 使用 user.country 作為語言來源
 * - super_admin 切換國家時，語言也會跟著切換
 */
export const LanguageProvider = ({ children }) => {
  const { user } = useAuth();
  const { displayCountry } = useCountry();

  // ===== 固定使用繁體中文 =====
  const language = 'zh-TW';

  // ===== 原始自動切換邏輯（未來恢復時取消註解） =====
  // const language = useMemo(() => {
  //   const country = displayCountry || user?.country || 'TW';
  //   return getLanguageByCountry(country);
  // }, [displayCountry, user?.country]);

  // 取得當前語言包
  const translations = useMemo(() => {
    return locales[language] || locales[DEFAULT_LANGUAGE];
  }, [language]);

  // t() 翻譯函數
  const t = useCallback(
    (key, params) => {
      return translate(translations, key, params);
    },
    [translations]
  );

  const value = useMemo(
    () => ({
      language,
      translations,
      t,
    }),
    [language, translations, t]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

/**
 * useLanguage hook
 * @returns {{ language: string, translations: object, t: (key: string, params?: object) => string }}
 */
export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
