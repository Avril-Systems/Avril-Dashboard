'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { LanguageToggle } from './language-toggle';
import { useLanguage } from './language-context';
import { MarketingBrandButton } from './marketing-brand-button';

export function MarketingNavbar() {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  const navLinks = [
    { label: t.nav.generate, href: '#pillars' },
    { label: t.nav.launch, href: '#pillars' },
    { label: t.nav.supervise, href: '#pillars' },
  ];

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image src="/Avril.png" alt="Avril logo" width={96} height={60} className="h-10 w-auto object-contain" priority />
          <span className="hidden text-sm font-semibold tracking-tight text-foreground sm:inline">{t.brand}</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <a key={link.label} href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <LanguageToggle />
          <MarketingBrandButton label={t.nav.cta} href="/home" />
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <LanguageToggle />
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-4 border-t border-border bg-background px-6 py-4 md:hidden">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-2 flex justify-center">
            <MarketingBrandButton label={t.nav.cta} href="/home" onClick={() => setOpen(false)} />
          </div>
        </div>
      )}
    </header>
  );
}
