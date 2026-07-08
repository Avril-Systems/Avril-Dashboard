'use client';

import Image from 'next/image';
import { useLanguage } from './language-context';
import { Eyebrow } from '@/components/patterns/eyebrow';
import { SectionBackdrop } from '@/components/patterns/section-backdrop';
import { MarketingBrandButton } from './marketing-brand-button';
import { CosmicButton } from '@/components/ui/cosmic-button';
import { avrilColors } from '@/lib/avril-tokens';

export function MarketingHero() {
  const { t } = useLanguage();
  const h = t.hero;

  return (
    <SectionBackdrop variant="hero" className="pb-20 bg-[var(--avril-canvas)]">
      <div className="relative z-10 mx-auto max-w-7xl px-6 pt-28 md:pt-32">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="text-center lg:text-left">
            <div className="mb-5 flex justify-center lg:justify-start">
              <Eyebrow>{h.eyebrow}</Eyebrow>
            </div>
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl xl:text-7xl">
              {h.headline}
              <br />
              <span className="text-brand">{h.focus}</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg lg:mx-0">
              {h.description}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <MarketingBrandButton label={h.cta} href="/home" />
              <CosmicButton href="/get-started" className="[&>span:nth-child(3)]:bg-black [&>span:nth-child(3)_span]:text-white">
                {h.ctaLucky}
              </CosmicButton>
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-2 lg:justify-start">
              {h.techStack.map((item) => (
                <span
                  key={item.name}
                  className="rounded-full border border-border/70 bg-surface/60 px-3 py-1 text-xs text-muted-foreground"
                >
                  {item.name} · {item.version}
                </span>
              ))}
            </div>
          </div>

          <div className="relative mx-auto flex max-w-md items-center justify-center lg:max-w-none">
            <div
              aria-hidden
              className="absolute inset-0 rounded-full opacity-40 blur-3xl"
              style={{
                background: `radial-gradient(circle, ${avrilColors.brandGlow} 0%, transparent 70%)`,
              }}
            />
            <Image
              src="/Avril.png"
              alt={h.srTitle}
              width={480}
              height={300}
              className="relative h-auto w-full max-w-sm object-contain"
              priority
            />
          </div>
        </div>
      </div>
    </SectionBackdrop>
  );
}
