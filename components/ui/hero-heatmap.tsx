'use client';

import * as React from 'react';
import type { SVGProps } from 'react';
import { Heatmap } from '@paper-design/shaders-react';
import { avrilColors, avrilHeatmapPalette, avrilTechStack } from '@/lib/avril-tokens';
import { cn } from '@/lib/utils';
import { useHeatmapPointerFollow } from '@/components/ui/use-heatmap-pointer-follow';

const MemoizedHeatmap = React.memo(Heatmap);

type HeatmapProps = React.ComponentProps<typeof Heatmap>;
type HeatmapIcon = React.ComponentType<SVGProps<SVGSVGElement>>;

export interface HeroHeatmapTechItem {
  name: string;
  version?: string;
  icon?: HeatmapIcon;
}

export interface HeroHeatmapCTAProps {
  label: React.ReactNode;
  href: string;
  target?: React.HTMLAttributeAnchorTarget;
  rel?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  className?: string;
}

export type HeroHeatmapShaderOverrides = Partial<
  Pick<
    HeatmapProps,
    | 'width'
    | 'height'
    | 'image'
    | 'colors'
    | 'colorBack'
    | 'contour'
    | 'angle'
    | 'noise'
    | 'innerGlow'
    | 'outerGlow'
    | 'speed'
    | 'scale'
  >
>;

export interface HeroHeatmapRootProps
  extends Omit<React.ComponentPropsWithoutRef<'section'>, 'title'>,
    HeroHeatmapShaderOverrides {
  srTitle?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  description?: React.ReactNode;
  showCta?: boolean;
  ctaProps?: Partial<HeroHeatmapCTAProps>;
  renderCta?: (defaultCta: React.ReactNode) => React.ReactNode;
  showBadges?: boolean;
  techStack?: HeroHeatmapTechItem[];
  renderBadge?: (
    tech: HeroHeatmapTechItem,
    index: number,
    defaultBadge: React.ReactNode,
  ) => React.ReactNode;
  desktopShaderProps?: Partial<HeatmapProps>;
  mobileShaderProps?: Partial<HeatmapProps>;
  /** Shift heatmap glow toward the pointer across the hero */
  followPointer?: boolean;
  pointerInfluence?: number;
}

export interface HeroHeatmapHeadingProps
  extends Omit<React.ComponentPropsWithoutRef<'div'>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headingClassName?: string;
}

export interface HeroHeatmapDescriptionProps extends React.ComponentPropsWithoutRef<'div'> {
  description?: React.ReactNode;
  descriptionClassName?: string;
}

export interface HeroHeatmapActionsProps extends React.ComponentPropsWithoutRef<'div'> {
  showCta?: boolean;
  ctaProps?: Partial<HeroHeatmapCTAProps>;
  renderCta?: (defaultCta: React.ReactNode) => React.ReactNode;
}

export interface HeroHeatmapBadgesProps extends React.ComponentPropsWithoutRef<'div'> {
  showBadges?: boolean;
  techStack?: HeroHeatmapTechItem[];
  renderBadge?: (
    tech: HeroHeatmapTechItem,
    index: number,
    defaultBadge: React.ReactNode,
  ) => React.ReactNode;
}

export interface HeroHeatmapVisualProps extends React.ComponentPropsWithoutRef<'div'> {
  desktopShaderProps?: Partial<HeatmapProps>;
  desktopClassName?: string;
}

export interface HeroHeatmapMobileVisualProps extends React.ComponentPropsWithoutRef<'div'> {
  mobileShaderProps?: Partial<HeatmapProps>;
}

interface HeroHeatmapContextValue {
  srTitle: string;
  title: React.ReactNode;
  subtitle: React.ReactNode;
  description: React.ReactNode;
  showCta: boolean;
  mergedCtaProps: HeroHeatmapCTAProps;
  renderCta?: (defaultCta: React.ReactNode) => React.ReactNode;
  showBadges: boolean;
  techStack: HeroHeatmapTechItem[];
  renderBadge?: HeroHeatmapBadgesProps['renderBadge'];
  mergedDesktopShaderProps: Partial<HeatmapProps>;
  mergedMobileShaderProps: Partial<HeatmapProps>;
}

type HeatmapPointerOffsets = ReturnType<typeof useHeatmapPointerFollow>;

const HeatmapPointerContext = React.createContext<HeatmapPointerOffsets>({
  offsetX: 0,
  offsetY: 0,
  angleDelta: 0,
  glowBoost: 0,
});

function useHeatmapPointerOffsets() {
  return React.useContext(HeatmapPointerContext);
}

function applyPointerFollowShaderProps(
  base: Partial<HeatmapProps>,
  pointer: HeatmapPointerOffsets,
): Partial<HeatmapProps> {
  return {
    ...base,
    offsetX: (base.offsetX ?? 0) + pointer.offsetX,
    offsetY: (base.offsetY ?? 0) + pointer.offsetY,
    angle: (base.angle ?? 0) + pointer.angleDelta,
    innerGlow: Math.min(1, (base.innerGlow ?? 0.5) + pointer.glowBoost),
    outerGlow: Math.min(1, (base.outerGlow ?? 0.5) + pointer.glowBoost * 0.75),
  };
}

const defaultDesktopShaderProps: Partial<HeatmapProps> = {
  width: 1280,
  height: 720,
  image: '/Avril.png',
  colors: [...avrilHeatmapPalette],
  colorBack: avrilColors.heatmapBack,
  contour: 0.5,
  angle: 0,
  noise: 0,
  innerGlow: 0.5,
  outerGlow: 0.5,
  speed: 1,
  scale: 0.55,
};

const defaultMobileShaderProps: Partial<HeatmapProps> = {
  image: '/Avril.png',
  colors: [...avrilHeatmapPalette],
  colorBack: '#00000000',
  contour: 0.5,
  angle: 0,
  noise: 0,
  innerGlow: 0.4,
  outerGlow: 0.35,
  speed: 0.85,
  scale: 0.68,
  style: { height: '100%', width: '100%' },
};

const defaultCtaProps: HeroHeatmapCTAProps = {
  label: 'Get started',
  href: '/get-started',
};

const defaultTechStack: HeroHeatmapTechItem[] = [...avrilTechStack];

const HeroHeatmapContext = React.createContext<HeroHeatmapContextValue | undefined>(undefined);

function useHeroHeatmapContext() {
  const context = React.useContext(HeroHeatmapContext);
  if (!context) {
    throw new Error('HeroHeatmap components must be used within HeroHeatmapRoot');
  }
  return context;
}

export function useHeroHeatmap() {
  return useHeroHeatmapContext();
}

export const HeroHeatmapRoot = React.forwardRef<HTMLElement, HeroHeatmapRootProps>(
  (
    {
      className,
      children,
      srTitle = 'Avril',
      title,
      subtitle,
      description,
      showCta = true,
      ctaProps,
      renderCta,
      showBadges = true,
      techStack = defaultTechStack,
      renderBadge,
      desktopShaderProps,
      mobileShaderProps,
      width,
      height,
      image,
      colors,
      colorBack,
      contour,
      angle,
      noise,
      innerGlow,
      outerGlow,
      speed,
      scale,
      followPointer = true,
      pointerInfluence,
      ...props
    },
    ref,
  ) => {
    const rootRef = React.useRef<HTMLElement | null>(null);
    const pointerOffsets = useHeatmapPointerFollow(rootRef, {
      enabled: followPointer,
      influence: pointerInfluence,
    });

    const setRootRef = React.useCallback(
      (node: HTMLElement | null) => {
        rootRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLElement | null>).current = node;
        }
      },
      [ref],
    );

    const mergedCtaProps = React.useMemo(
      () => ({
        ...defaultCtaProps,
        ...ctaProps,
      }),
      [ctaProps],
    );

    const shaderOverrides = React.useMemo((): Partial<HeatmapProps> => {
      const overrides: Partial<HeatmapProps> = {};
      if (width !== undefined) overrides.width = width;
      if (height !== undefined) overrides.height = height;
      if (image !== undefined) overrides.image = image;
      if (colors !== undefined) overrides.colors = colors;
      if (colorBack !== undefined) overrides.colorBack = colorBack;
      if (contour !== undefined) overrides.contour = contour;
      if (angle !== undefined) overrides.angle = angle;
      if (noise !== undefined) overrides.noise = noise;
      if (innerGlow !== undefined) overrides.innerGlow = innerGlow;
      if (outerGlow !== undefined) overrides.outerGlow = outerGlow;
      if (speed !== undefined) overrides.speed = speed;
      if (scale !== undefined) overrides.scale = scale;
      return overrides;
    }, [width, height, image, colors, colorBack, contour, angle, noise, innerGlow, outerGlow, speed, scale]);

    const mergedDesktopShaderProps = React.useMemo(
      () => ({
        ...defaultDesktopShaderProps,
        ...shaderOverrides,
        ...desktopShaderProps,
      }),
      [shaderOverrides, desktopShaderProps],
    );

    const mergedMobileShaderProps = React.useMemo(
      () => ({
        ...defaultMobileShaderProps,
        ...shaderOverrides,
        ...mobileShaderProps,
        style: {
          ...(defaultMobileShaderProps.style as React.CSSProperties),
          ...(mobileShaderProps?.style as React.CSSProperties | undefined),
        },
      }),
      [shaderOverrides, mobileShaderProps],
    );

    const contextValue = React.useMemo<HeroHeatmapContextValue>(
      () => ({
        srTitle,
        title,
        subtitle,
        description,
        showCta,
        mergedCtaProps,
        renderCta,
        showBadges,
        techStack,
        renderBadge,
        mergedDesktopShaderProps,
        mergedMobileShaderProps,
      }),
      [
        srTitle,
        title,
        subtitle,
        description,
        showCta,
        mergedCtaProps,
        renderCta,
        showBadges,
        techStack,
        renderBadge,
        mergedDesktopShaderProps,
        mergedMobileShaderProps,
      ],
    );

    return (
      <HeroHeatmapContext.Provider value={contextValue}>
        <HeatmapPointerContext.Provider value={pointerOffsets}>
          <section
            className={cn('relative h-full w-full overflow-hidden', className)}
            data-slot="hero-heatmap-root"
            ref={setRootRef}
            {...props}
          >
            <h1 className="sr-only">{srTitle}</h1>
            {children}
          </section>
        </HeatmapPointerContext.Provider>
      </HeroHeatmapContext.Provider>
    );
  },
);
HeroHeatmapRoot.displayName = 'HeroHeatmapRoot';

export function HeroHeatmapContainer({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'container relative z-10 mx-auto grid max-w-7xl gap-6 px-6 pb-16 sm:gap-8 sm:pb-20 lg:grid-cols-[1fr_minmax(300px,500px)] lg:items-center lg:gap-12 lg:pb-24 xl:grid-cols-[1fr_1fr]',
        className,
      )}
      data-slot="hero-heatmap-container"
      {...props}
    />
  );
}

export function HeroHeatmapContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-col justify-center gap-4 text-balance sm:gap-5 lg:gap-6 lg:pr-0',
        className,
      )}
      data-slot="hero-heatmap-content"
      {...props}
    />
  );
}

export function HeroHeatmapHeading({
  className,
  title,
  subtitle,
  headingClassName,
  children,
  ...props
}: HeroHeatmapHeadingProps) {
  const context = useHeroHeatmapContext();
  const resolvedTitle = title ?? context.title;
  const resolvedSubtitle = subtitle ?? context.subtitle;

  return (
    <div
      className={cn('pt-4 text-center sm:pt-6 lg:pt-0 lg:text-left', className)}
      data-slot="hero-heatmap-heading-wrap"
      {...props}
    >
      {children ?? (
        <div className="relative">
          <h2
            className={cn(
              'font-heading relative mb-0 text-balance text-3xl font-medium tracking-tight sm:text-4xl md:text-5xl lg:tracking-tight xl:text-6xl 2xl:text-7xl',
              headingClassName,
            )}
            data-slot="hero-heatmap-heading"
          >
            {resolvedTitle} <br />
            {resolvedSubtitle}
          </h2>
        </div>
      )}
    </div>
  );
}

export function HeroHeatmapDescription({
  className,
  description,
  descriptionClassName,
  children,
  ...props
}: HeroHeatmapDescriptionProps) {
  const context = useHeroHeatmapContext();
  const resolvedDescription = description ?? context.description;

  return (
    <div
      className={cn(
        'mx-auto max-w-xl pb-2 text-center sm:pb-4 lg:mx-0 lg:max-w-none lg:pb-0 lg:text-left',
        className,
      )}
      data-slot="hero-heatmap-description-wrap"
      {...props}
    >
      {children ?? (
        <p
          className={cn(
            'mt-0 mb-0 text-sm text-foreground/70 sm:text-base md:text-foreground/80 lg:text-lg xl:text-xl',
            descriptionClassName,
          )}
          data-slot="hero-heatmap-description"
        >
          {resolvedDescription}
        </p>
      )}
    </div>
  );
}

export function HeroHeatmapActions({
  className,
  showCta,
  ctaProps,
  renderCta,
  children,
  ...props
}: HeroHeatmapActionsProps) {
  const context = useHeroHeatmapContext();
  const shouldShowCta = showCta ?? context.showCta;
  const resolvedCtaProps = { ...context.mergedCtaProps, ...ctaProps };
  const resolvedRenderCta = renderCta ?? context.renderCta;

  if (!shouldShowCta) {
    return null;
  }

  const defaultCta = <HeroHeatmapCTA {...resolvedCtaProps} />;

  return (
    <div
      className={cn('flex justify-center lg:justify-start', className)}
      data-slot="hero-heatmap-cta-wrap"
      {...props}
    >
      {children ?? (resolvedRenderCta ? resolvedRenderCta(defaultCta) : defaultCta)}
    </div>
  );
}

export function HeroHeatmapCTA({ label, href, target, rel, onClick, className }: HeroHeatmapCTAProps) {
  return (
    <div className={cn('flex items-center justify-center gap-4 pb-4 md:pb-0', className)} data-slot="hero-heatmap-cta">
      <a
        href={href}
        onClick={onClick}
        rel={rel}
        target={target}
        className="inline-flex items-center justify-center rounded-xl bg-brand px-5 py-2.5 font-heading text-sm font-medium tracking-wide text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
      >
        {label}
      </a>
    </div>
  );
}

export function HeroHeatmapBadges({
  className,
  showBadges,
  techStack,
  renderBadge,
  ...props
}: HeroHeatmapBadgesProps) {
  const context = useHeroHeatmapContext();
  const shouldShowBadges = showBadges ?? context.showBadges;
  const resolvedTechStack = techStack ?? context.techStack;
  const resolvedRenderBadge = renderBadge ?? context.renderBadge;

  if (!shouldShowBadges) {
    return null;
  }

  return (
    <div
      className={cn('flex flex-wrap items-center justify-center gap-2.5', className)}
      data-slot="hero-heatmap-badges"
      {...props}
    >
      {resolvedTechStack.map((tech, index) => {
        const Icon = tech.icon;
        const defaultBadge = (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-surface/80 px-3.5 py-1.5 font-heading text-xs font-medium text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-all duration-150 hover:-translate-y-px',
            )}
            data-slot="hero-heatmap-badge"
            key={tech.name}
          >
            {Icon ? <Icon className="size-3.5 opacity-80" /> : null}
            <span className="font-semibold tracking-tight">{tech.name}</span>
            {tech.version ? <span className="font-mono text-[10px] opacity-50">{tech.version}</span> : null}
          </span>
        );

        if (resolvedRenderBadge) {
          return (
            <React.Fragment key={tech.name}>
              {resolvedRenderBadge(tech, index, defaultBadge)}
            </React.Fragment>
          );
        }

        return defaultBadge;
      })}
    </div>
  );
}

export function HeroHeatmapVisual({
  className,
  desktopClassName,
  desktopShaderProps,
  ...props
}: HeroHeatmapVisualProps) {
  const context = useHeroHeatmapContext();
  const pointerOffsets = useHeatmapPointerOffsets();
  const resolvedDesktopShaderProps = applyPointerFollowShaderProps(
    {
      ...context.mergedDesktopShaderProps,
      ...desktopShaderProps,
    },
    pointerOffsets,
  );

  return (
    <div
      className={cn('relative hidden h-[350px] lg:block lg:h-[400px] xl:h-[500px]', className)}
      data-slot="hero-heatmap-visual"
      {...props}
    >
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center overflow-hidden rounded-full',
          desktopClassName,
        )}
        data-slot="hero-heatmap-desktop"
      >
        <MemoizedHeatmap
          {...resolvedDesktopShaderProps}
          image={resolvedDesktopShaderProps.image ?? (defaultDesktopShaderProps.image as string)}
        />
      </div>
    </div>
  );
}

export function HeroHeatmapMobileVisual({
  className,
  mobileShaderProps,
  ...props
}: HeroHeatmapMobileVisualProps) {
  const context = useHeroHeatmapContext();
  const pointerOffsets = useHeatmapPointerOffsets();
  const resolvedMobileShaderProps = applyPointerFollowShaderProps(
    {
      ...context.mergedMobileShaderProps,
      ...mobileShaderProps,
      style: {
        ...(context.mergedMobileShaderProps.style as React.CSSProperties),
        ...(mobileShaderProps?.style as React.CSSProperties | undefined),
      },
    },
    pointerOffsets,
  );

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 -bottom-24 -z-10 h-[360px] overflow-hidden lg:hidden',
        className,
      )}
      data-slot="hero-heatmap-mobile"
      {...props}
    >
      <div className="absolute inset-x-0 top-0 z-10 h-56 bg-gradient-to-b from-[var(--avril-canvas)] via-[var(--avril-canvas)]/95 to-transparent" />
      <MemoizedHeatmap
        {...resolvedMobileShaderProps}
        image={resolvedMobileShaderProps.image ?? (defaultMobileShaderProps.image as string)}
      />
    </div>
  );
}
