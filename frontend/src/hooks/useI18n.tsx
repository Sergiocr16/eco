import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { loadLang, persistLang, translate, type Lang } from '@/lib/i18n';

type I18nContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(loadLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    persistLang(l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(key, lang, vars),
    [lang],
  );

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be inside I18nProvider');
  return ctx;
}

export function useT() {
  return useI18n().t;
}
