'use client';

import { MarketingNavbar } from './marketing-navbar';
import { MarketingHero } from './marketing-hero';
import { MarketingThreePillars } from './marketing-three-pillars';
import { MarketingPricing } from './marketing-pricing';
import { MarketingFooter, MarketingFooterCTA } from './marketing-footer';

export function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--avril-canvas)] text-foreground">
      <MarketingNavbar />
      <MarketingHero />
      <MarketingThreePillars />
      <MarketingPricing />
      <MarketingFooterCTA />
      <MarketingFooter />
    </main>
  );
}
