'use client';

import Image from 'next/image';
import { useLanguage } from './language-context';
import { Eyebrow } from '@/components/patterns/eyebrow';
import { SectionBackdrop } from '@/components/patterns/section-backdrop';
import { MarketingBrandButton } from './marketing-brand-button';
import { CosmicButton } from '@/components/ui/cosmic-button';

export function MarketingFooterCTA() {
  const { t } = useLanguage();
  const c = t.footerCta;

  return (
    <SectionBackdrop variant="footer" className="border-t border-border py-24" id="contact">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 text-center">
        <Eyebrow>{c.eyebrow}</Eyebrow>
        <h2 className="text-balance text-3xl leading-tight tracking-tight md:text-4xl lg:text-5xl">
          {c.title}
        </h2>
        <p className="max-w-lg text-pretty text-lg leading-relaxed text-muted-foreground">{c.description}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <MarketingBrandButton label={c.ctaSecondary} href="/start/idea" />
          <CosmicButton href="/get-started">
            {c.ctaPrimary}
          </CosmicButton>
        </div>
      </div>
    </SectionBackdrop>
  );
}

export function MarketingFooter() {
  const { t } = useLanguage();
  const f = t.footer;

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="mb-4 flex items-center gap-3">
              <Image src="/Avril.png" alt="Avril logo" width={64} height={40} className="h-8 w-auto object-contain" />
              <span className="text-sm font-semibold text-foreground">{t.brand}</span>
            </div>
            <p className="max-w-[240px] text-xs leading-relaxed text-muted-foreground">{f.tagline}</p>
          </div>

          {f.groups.map((group) => (
            <div key={group.title}>
              <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-foreground">{group.title}</div>
              <ul className="flex flex-col gap-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} {f.copyright}</p>
        </div>
      </div>
    </footer>
  );
}
