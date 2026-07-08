'use client';

import { useLanguage } from './language-context';

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="inline-flex rounded-full border border-border/70 bg-surface/60 p-0.5 text-xs">
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`rounded-full px-2.5 py-1 transition-colors ${
          language === 'en' ? 'bg-brand/20 text-brand' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage('es')}
        className={`rounded-full px-2.5 py-1 transition-colors ${
          language === 'es' ? 'bg-brand/20 text-brand' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        ES
      </button>
    </div>
  );
}
