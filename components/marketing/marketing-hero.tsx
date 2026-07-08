'use client';

import { useLanguage } from './language-context';
import { Eyebrow } from '@/components/patterns/eyebrow';
import { SectionBackdrop } from '@/components/patterns/section-backdrop';
import { MarketingBrandButton } from './marketing-brand-button';
import { CosmicButton } from '@/components/ui/cosmic-button';
import {
  HeroHeatmapActions,
  HeroHeatmapBadges,
  HeroHeatmapContainer,
  HeroHeatmapContent,
  HeroHeatmapDescription,
  HeroHeatmapHeading,
  HeroHeatmapMobileVisual,
  HeroHeatmapRoot,
  HeroHeatmapVisual,
} from '@/components/ui/hero-heatmap';
import { avrilHeatmapPalette, avrilShaderDefaults } from '@/lib/avril-tokens';

export function MarketingHero() {
  const { t } = useLanguage();
  const h = t.hero;

  return (
    <SectionBackdrop variant="hero" className="pb-20 bg-[var(--avril-canvas)]">
      <HeroHeatmapRoot
        className="relative z-10 pt-28 md:pt-32"
        srTitle={h.srTitle}
        image="/Avril.png"
        colors={[...avrilHeatmapPalette]}
        colorBack={avrilShaderDefaults.colorBack}
        contour={avrilShaderDefaults.contour}
        angle={avrilShaderDefaults.angle}
        noise={avrilShaderDefaults.noise}
        innerGlow={avrilShaderDefaults.innerGlow}
        outerGlow={avrilShaderDefaults.outerGlow}
        speed={avrilShaderDefaults.speed}
        scale={avrilShaderDefaults.scale}
        desktopShaderProps={avrilShaderDefaults.desktop}
        mobileShaderProps={avrilShaderDefaults.mobile}
        showCta
        renderCta={() => (
          <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <MarketingBrandButton label={h.ctaSecondary} href="/start/idea" motion="calm" />
            <CosmicButton href="/get-started">{h.ctaPrimary}</CosmicButton>
          </div>
        )}
        showBadges
        techStack={[...h.techStack]}
      >
        <HeroHeatmapContainer>
          <HeroHeatmapContent>
            <HeroHeatmapHeading>
              <div className="mb-5 flex justify-center lg:justify-start">
                <Eyebrow>{h.eyebrow}</Eyebrow>
              </div>
              <h2 className="font-heading relative mb-0 text-balance text-4xl leading-[1.05] tracking-tight sm:text-5xl md:text-6xl xl:text-6xl">
                {h.title}
              </h2>
            </HeroHeatmapHeading>

            <HeroHeatmapDescription
              description={h.subtitle}
              descriptionClassName="text-pretty leading-relaxed"
            />

            <HeroHeatmapMobileVisual
              placement="inline"
              mobileShaderProps={{ scale: 0.62, innerGlow: 0.5, outerGlow: 0.4 }}
            />

            <HeroHeatmapActions className="relative z-20" />

            <div
              className="hidden justify-center lg:flex lg:justify-start"
              data-slot="hero-heatmap-badges-wrap"
            >
              <HeroHeatmapBadges techStack={[...h.techStack]} />
            </div>
          </HeroHeatmapContent>

          <HeroHeatmapVisual desktopClassName="rounded-full" className="xl:h-[520px]" />
        </HeroHeatmapContainer>
      </HeroHeatmapRoot>
    </SectionBackdrop>
  );
}
