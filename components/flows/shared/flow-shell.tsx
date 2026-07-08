'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LanguageToggle } from '@/components/marketing/language-toggle';
import { useLanguage } from '@/components/marketing/language-context';
import { SectionBackdrop } from '@/components/patterns/section-backdrop';

type FlowShellProps = {
  children: React.ReactNode;
};

export function FlowShell({ children }: FlowShellProps) {
  const { t } = useLanguage();

  return (
    <SectionBackdrop variant="hero" className="avril-marketing min-h-screen bg-[var(--avril-canvas)] font-sans text-foreground antialiased">
      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 md:py-12">
        <header className="mb-10 flex items-center justify-between gap-4 md:mb-14">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={16} />
            {t.flow.backHome}
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] uppercase tracking-[0.2em] text-muted-foreground/80 sm:inline">
              {t.flow.flowLabel}
            </span>
            <LanguageToggle />
          </div>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center pb-12">{children}</main>
      </div>
    </SectionBackdrop>
  );
}
