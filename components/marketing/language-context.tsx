'use client';

import { createContext, useContext, useState } from 'react';
import { copy, type Language, type LandingCopy } from '@/lib/landing-copy';

type LanguageContextValue = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: LandingCopy;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>('en');
  const t = copy[language];

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
