'use client';

import { MarketingNavbar } from './marketing-navbar';
import { MarketingHero } from './marketing-hero';
import { MarketingThreePillars } from './marketing-three-pillars';
import { MarketingFooter, MarketingFooterCTA } from './marketing-footer';
import { LanguageProvider } from './language-context';

export function LandingPage() {
  return (
    <LanguageProvider>
      <main className="min-h-screen bg-[var(--avril-canvas)] text-foreground">
        <MarketingNavbar />
        <MarketingHero />
        <MarketingThreePillars />
        <MarketingFooterCTA />
        <MarketingFooter />
      </main>
    </LanguageProvider>
  );
}
