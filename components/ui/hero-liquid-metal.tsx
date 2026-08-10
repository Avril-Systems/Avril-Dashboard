'use client';

import * as React from 'react';
import type { SVGProps } from 'react';
import { LiquidMetal } from '@paper-design/shaders-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { avrilLiquidMetalDefaults, avrilTechStack } from '@/lib/avril-tokens';

const MemoizedLiquidMetal = React.memo(LiquidMetal);

type LiquidMetalProps = React.ComponentProps<typeof LiquidMetal>;
type LiquidMetalIcon = React.ComponentType<SVGProps<SVGSVGElement>>;

export interface HeroLiquidMetalTechItem {
  name: string;
  version?: string;
  icon?: LiquidMetalIcon;
}

export interface HeroLiquidMetalCTAProps {
  label: React.ReactNode;
  href: string;
  target?: React.HTMLAttributeAnchorTarget;
  rel?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  className?: string;
  buttonClassName?: string;
}

export type HeroLiquidMetalShaderOverrides = Partial<
  Pick<
    LiquidMetalProps,
    | 'width'
    | 'height'
    | 'image'
    | 'colorBack'
    | 'colorTint'
    | 'shape'
    | 'repetition'
    | 'softness'
    | 'shiftRed'
    | 'shiftBlue'
    | 'distortion'
    | 'contour'
    | 'angle'
    | 'speed'
    | 'frame'
    | 'scale'
    | 'rotation'
    | 'offsetX'
    | 'offsetY'
    | 'fit'
    | 'originX'
    | 'originY'
    | 'minPixelRatio'
    | 'maxPixelCount'
  >
>;

export interface HeroLiquidMetalRootProps
  extends Omit<React.ComponentPropsWithoutRef<'section'>, 'title'>,
    HeroLiquidMetalShaderOverrides {
  srTitle?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  description?: React.ReactNode;
  showCta?: boolean;
  ctaProps?: Partial<HeroLiquidMetalCTAProps>;
  renderCta?: (defaultCta: React.ReactNode) => React.ReactNode;
  showBadges?: boolean;
  techStack?: HeroLiquidMetalTechItem[];
  renderBadge?: (
    tech: HeroLiquidMetalTechItem,
    index: number,
    defaultBadge: React.ReactNode,
  ) => React.ReactNode;
  desktopShaderProps?: Partial<LiquidMetalProps>;
  mobileShaderProps?: Partial<LiquidMetalProps>;
}

export interface HeroLiquidMetalHeadingProps
  extends Omit<React.ComponentPropsWithoutRef<'div'>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headingClassName?: string;
}

export interface HeroLiquidMetalDescriptionProps extends React.ComponentPropsWithoutRef<'div'> {
  description?: React.ReactNode;
  descriptionClassName?: string;
}

export interface HeroLiquidMetalActionsProps extends React.ComponentPropsWithoutRef<'div'> {
  showCta?: boolean;
  ctaProps?: Partial<HeroLiquidMetalCTAProps>;
  renderCta?: (defaultCta: React.ReactNode) => React.ReactNode;
}

export interface HeroLiquidMetalBadgesProps extends React.ComponentPropsWithoutRef<'div'> {
  showBadges?: boolean;
  techStack?: HeroLiquidMetalTechItem[];
  renderBadge?: (
    tech: HeroLiquidMetalTechItem,
    index: number,
    defaultBadge: React.ReactNode,
  ) => React.ReactNode;
}

export interface HeroLiquidMetalVisualProps extends React.ComponentPropsWithoutRef<'div'> {
  desktopShaderProps?: Partial<LiquidMetalProps>;
  desktopClassName?: string;
}

export interface HeroLiquidMetalMobileVisualProps extends React.ComponentPropsWithoutRef<'div'> {
  mobileShaderProps?: Partial<LiquidMetalProps>;
  placement?: 'background' | 'inline';
}

export interface HeroLiquidMetalProps extends HeroLiquidMetalRootProps {
  containerClassName?: string;
  contentClassName?: string;
  headingWrapClassName?: string;
  headingClassName?: string;
  descriptionWrapClassName?: string;
  descriptionClassName?: string;
  ctaWrapClassName?: string;
  badgesWrapClassName?: string;
  visualClassName?: string;
  mobileVisualClassName?: string;
}

interface HeroLiquidMetalContextValue {
  srTitle: string;
  title: React.ReactNode;
  subtitle: React.ReactNode;
  description: React.ReactNode;
  showCta: boolean;
  mergedCtaProps: HeroLiquidMetalCTAProps;
  renderCta?: (defaultCta: React.ReactNode) => React.ReactNode;
  showBadges: boolean;
  techStack: HeroLiquidMetalTechItem[];
  renderBadge?: HeroLiquidMetalBadgesProps['renderBadge'];
  mergedDesktopShaderProps: Partial<LiquidMetalProps>;
  mergedMobileShaderProps: Partial<LiquidMetalProps>;
}

const defaultDesktopShaderProps: Partial<LiquidMetalProps> = {
  width: 1280,
  height: 720,
  image: avrilLiquidMetalDefaults.image,
  colorBack: avrilLiquidMetalDefaults.colorBack,
  colorTint: avrilLiquidMetalDefaults.colorTint,
  shape: undefined,
  repetition: avrilLiquidMetalDefaults.repetition,
  softness: avrilLiquidMetalDefaults.softness,
  shiftRed: avrilLiquidMetalDefaults.shiftRed,
  shiftBlue: avrilLiquidMetalDefaults.shiftBlue,
  distortion: avrilLiquidMetalDefaults.distortion,
  contour: avrilLiquidMetalDefaults.contour,
  angle: avrilLiquidMetalDefaults.angle,
  fit: avrilLiquidMetalDefaults.fit,
  ...avrilLiquidMetalDefaults.desktop,
};

const defaultMobileShaderProps: Partial<LiquidMetalProps> = {
  image: avrilLiquidMetalDefaults.image,
  colorBack: avrilLiquidMetalDefaults.colorBack,
  colorTint: avrilLiquidMetalDefaults.colorTint,
  shape: undefined,
  repetition: avrilLiquidMetalDefaults.repetition,
  softness: avrilLiquidMetalDefaults.softness,
  shiftRed: avrilLiquidMetalDefaults.shiftRed,
  shiftBlue: avrilLiquidMetalDefaults.shiftBlue,
  distortion: avrilLiquidMetalDefaults.distortion,
  contour: avrilLiquidMetalDefaults.contour,
  angle: avrilLiquidMetalDefaults.angle,
  fit: avrilLiquidMetalDefaults.fit,
  style: { height: '100%', width: '100%' },
  ...avrilLiquidMetalDefaults.mobile,
};

const defaultCtaProps: HeroLiquidMetalCTAProps = {
  label: 'Get started',
  href: '/get-started',
  target: undefined,
  rel: undefined,
};

const defaultTechStack: HeroLiquidMetalTechItem[] = [...avrilTechStack];

const HeroLiquidMetalContext = React.createContext<HeroLiquidMetalContextValue | undefined>(
  undefined,
);

function useHeroLiquidMetalContext() {
  const context = React.useContext(HeroLiquidMetalContext);
  if (!context) {
    throw new Error('HeroLiquidMetal components must be used within HeroLiquidMetalRoot');
  }
  return context;
}

export function useHeroLiquidMetal() {
  return useHeroLiquidMetalContext();
}

export const HeroLiquidMetalRoot = React.forwardRef<HTMLElement, HeroLiquidMetalRootProps>(
  (
    {
      className,
      children,
      srTitle = 'Avril — Vibe Founding OS',
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
      colorBack,
      colorTint,
      shape,
      repetition,
      softness,
      shiftRed,
      shiftBlue,
      distortion,
      contour,
      angle,
      speed,
      frame,
      scale,
      rotation,
      offsetX,
      offsetY,
      fit,
      originX,
      originY,
      minPixelRatio,
      maxPixelCount,
      ...props
    },
    ref,
  ) => {
    const mergedCtaProps = React.useMemo(
      () => ({
        ...defaultCtaProps,
        ...ctaProps,
      }),
      [ctaProps],
    );

    const shaderOverrides = React.useMemo((): Partial<LiquidMetalProps> => {
      const overrides: Partial<LiquidMetalProps> = {};
      if (width !== undefined) overrides.width = width;
      if (height !== undefined) overrides.height = height;
      if (image !== undefined) overrides.image = image;
      if (colorBack !== undefined) overrides.colorBack = colorBack;
      if (colorTint !== undefined) overrides.colorTint = colorTint;
      if (shape !== undefined) overrides.shape = shape;
      if (repetition !== undefined) overrides.repetition = repetition;
      if (softness !== undefined) overrides.softness = softness;
      if (shiftRed !== undefined) overrides.shiftRed = shiftRed;
      if (shiftBlue !== undefined) overrides.shiftBlue = shiftBlue;
      if (distortion !== undefined) overrides.distortion = distortion;
      if (contour !== undefined) overrides.contour = contour;
      if (angle !== undefined) overrides.angle = angle;
      if (speed !== undefined) overrides.speed = speed;
      if (frame !== undefined) overrides.frame = frame;
      if (scale !== undefined) overrides.scale = scale;
      if (rotation !== undefined) overrides.rotation = rotation;
      if (offsetX !== undefined) overrides.offsetX = offsetX;
      if (offsetY !== undefined) overrides.offsetY = offsetY;
      if (fit !== undefined) overrides.fit = fit;
      if (originX !== undefined) overrides.originX = originX;
      if (originY !== undefined) overrides.originY = originY;
      if (minPixelRatio !== undefined) overrides.minPixelRatio = minPixelRatio;
      if (maxPixelCount !== undefined) overrides.maxPixelCount = maxPixelCount;
      return overrides;
    }, [
      width,
      height,
      image,
      colorBack,
      colorTint,
      shape,
      repetition,
      softness,
      shiftRed,
      shiftBlue,
      distortion,
      contour,
      angle,
      speed,
      frame,
      scale,
      rotation,
      offsetX,
      offsetY,
      fit,
      originX,
      originY,
      minPixelRatio,
      maxPixelCount,
    ]);

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

    const contextValue = React.useMemo<HeroLiquidMetalContextValue>(
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
      <HeroLiquidMetalContext.Provider value={contextValue}>
        <section
          className={cn('relative h-full w-full overflow-hidden', className)}
          data-slot="hero-liquid-metal-root"
          ref={ref}
          {...props}
        >
          <h1 className="sr-only">{srTitle}</h1>
          {children}
        </section>
      </HeroLiquidMetalContext.Provider>
    );
  },
);
HeroLiquidMetalRoot.displayName = 'HeroLiquidMetalRoot';

export function HeroLiquidMetalContainer({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'container relative z-10 grid gap-6 pb-16 sm:gap-8 sm:pb-20 lg:grid-cols-[1fr_minmax(300px,500px)] lg:items-center lg:gap-12 lg:pb-24 xl:grid-cols-[1fr_1fr]',
        className,
      )}
      data-slot="hero-liquid-metal-container"
      {...props}
    />
  );
}

export function HeroLiquidMetalContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-col justify-center gap-4 text-balance sm:gap-5 sm:px-4 md:px-8 lg:gap-6 lg:pr-0 lg:pl-4 xl:pl-8 2xl:pl-0',
        className,
      )}
      data-slot="hero-liquid-metal-content"
      {...props}
    />
  );
}

export function HeroLiquidMetalHeading({
  className,
  title,
  subtitle,
  headingClassName,
  children,
  ...props
}: HeroLiquidMetalHeadingProps) {
  const context = useHeroLiquidMetalContext();
  const resolvedTitle = title ?? context.title;
  const resolvedSubtitle = subtitle ?? context.subtitle;

  return (
    <div
      className={cn('pt-4 text-center sm:pt-6 lg:pt-0 lg:text-left', className)}
      data-slot="hero-liquid-metal-heading-wrap"
      {...props}
    >
      {children ?? (
        <div className="relative">
          <h2
            className={cn(
              'font-heading relative mb-0 text-balance font-medium text-3xl tracking-[-0.04em] sm:text-4xl md:text-5xl lg:tracking-[-0.06em] xl:text-6xl 2xl:text-7xl',
              headingClassName,
            )}
            data-slot="hero-liquid-metal-heading"
          >
            {resolvedTitle} <br />
            {resolvedSubtitle}
          </h2>
        </div>
      )}
    </div>
  );
}

export function HeroLiquidMetalDescription({
  className,
  description,
  descriptionClassName,
  children,
  ...props
}: HeroLiquidMetalDescriptionProps) {
  const context = useHeroLiquidMetalContext();
  const resolvedDescription = description ?? context.description;

  return (
    <div
      className={cn(
        'mx-auto max-w-xl pb-2 text-center sm:pb-4 lg:mx-0 lg:max-w-none lg:pb-0 lg:text-left',
        className,
      )}
      data-slot="hero-liquid-metal-description-wrap"
      {...props}
    >
      {children ?? (
        <p
          className={cn(
            'mt-0 mb-0 font-sans text-sm text-foreground/70 sm:text-base md:text-foreground/80 lg:text-lg xl:text-xl',
            descriptionClassName,
          )}
          data-slot="hero-liquid-metal-description"
        >
          {resolvedDescription}
        </p>
      )}
    </div>
  );
}

export function HeroLiquidMetalActions({
  className,
  showCta,
  ctaProps,
  renderCta,
  children,
  ...props
}: HeroLiquidMetalActionsProps) {
  const context = useHeroLiquidMetalContext();
  const shouldShowCta = showCta ?? context.showCta;
  const resolvedCtaProps = { ...context.mergedCtaProps, ...ctaProps };
  const resolvedRenderCta = renderCta ?? context.renderCta;

  if (!shouldShowCta) {
    return null;
  }

  const defaultCta = <HeroLiquidMetalCTA {...resolvedCtaProps} />;

  return (
    <div
      className={cn('flex justify-center lg:justify-start', className)}
      data-slot="hero-liquid-metal-cta-wrap"
      {...props}
    >
      {children ?? (resolvedRenderCta ? resolvedRenderCta(defaultCta) : defaultCta)}
    </div>
  );
}

export function HeroLiquidMetalCTA({
  label,
  href,
  target,
  rel,
  onClick,
  className,
  buttonClassName,
}: HeroLiquidMetalCTAProps) {
  return (
    <div
      className={cn('flex items-center justify-center gap-4 pb-4 md:pb-0', className)}
      data-slot="hero-liquid-metal-cta"
    >
      <Button asChild className={cn('', buttonClassName)} size="lg">
        <a href={href} onClick={onClick} rel={rel} target={target}>
          {label}
        </a>
      </Button>
    </div>
  );
}

export function HeroLiquidMetalBadges({
  className,
  showBadges,
  techStack,
  renderBadge,
  ...props
}: HeroLiquidMetalBadgesProps) {
  const context = useHeroLiquidMetalContext();
  const shouldShowBadges = showBadges ?? context.showBadges;
  const resolvedTechStack = techStack ?? context.techStack;
  const resolvedRenderBadge = renderBadge ?? context.renderBadge;

  if (!shouldShowBadges) {
    return null;
  }

  return (
    <div
      className={cn('flex flex-wrap items-center justify-center gap-2.5', className)}
      data-slot="hero-liquid-metal-badges"
      {...props}
    >
      {resolvedTechStack.map((tech, index) => {
        const Icon = tech.icon;
        const defaultBadge = (
          <Badge
            className={cn(
              'group relative px-3.5 py-1.5 font-heading font-medium transition-all duration-150',
              'border border-border/50 bg-card text-card-foreground',
              'shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]',
              'hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.4)]',
            )}
            data-slot="hero-liquid-metal-badge"
            key={tech.name}
            variant="outline"
          >
            {Icon ? <Icon className="mr-1 size-3.5 opacity-80" /> : null}
            <span className="font-semibold tracking-tight">{tech.name}</span>
            {tech.version ? (
              <span className="font-mono text-xs opacity-50">{tech.version}</span>
            ) : null}
          </Badge>
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

export function HeroLiquidMetalVisual({
  className,
  desktopClassName,
  desktopShaderProps,
  ...props
}: HeroLiquidMetalVisualProps) {
  const context = useHeroLiquidMetalContext();
  const resolvedDesktopShaderProps = {
    ...context.mergedDesktopShaderProps,
    ...desktopShaderProps,
  };

  return (
    <div
      className={cn('relative hidden h-[350px] lg:block lg:h-[400px] xl:h-[500px]', className)}
      data-slot="hero-liquid-metal-visual"
      {...props}
    >
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center overflow-hidden rounded-full',
          desktopClassName,
        )}
        data-slot="hero-liquid-metal-desktop"
      >
        <MemoizedLiquidMetal
          {...resolvedDesktopShaderProps}
          image={
            resolvedDesktopShaderProps.image ?? (defaultDesktopShaderProps.image as string)
          }
        />
      </div>
    </div>
  );
}

export function HeroLiquidMetalMobileVisual({
  className,
  mobileShaderProps,
  placement = 'background',
  ...props
}: HeroLiquidMetalMobileVisualProps) {
  const context = useHeroLiquidMetalContext();
  const resolvedMobileShaderProps = {
    ...context.mergedMobileShaderProps,
    ...mobileShaderProps,
    style: {
      ...(context.mergedMobileShaderProps.style as React.CSSProperties),
      ...(mobileShaderProps?.style as React.CSSProperties | undefined),
    },
  };

  const isInline = placement === 'inline';

  return (
    <div
      className={cn(
        'pointer-events-none lg:hidden',
        isInline
          ? 'relative z-10 mx-auto my-1 h-[min(200px,48vw)] w-[min(240px,62vw)] overflow-hidden rounded-full'
          : 'absolute inset-x-0 -bottom-24 -z-10 h-[360px] overflow-hidden',
        className,
      )}
      data-slot="hero-liquid-metal-mobile"
      {...props}
    >
      {!isInline ? (
        <div className="absolute inset-x-0 top-0 z-10 h-56 bg-gradient-to-b from-[var(--avril-canvas)] via-[var(--avril-canvas)]/95 to-transparent" />
      ) : null}
      <MemoizedLiquidMetal
        {...resolvedMobileShaderProps}
        image={resolvedMobileShaderProps.image ?? (defaultMobileShaderProps.image as string)}
      />
    </div>
  );
}

export function HeroLiquidMetal({
  containerClassName,
  contentClassName,
  headingWrapClassName,
  headingClassName,
  descriptionWrapClassName,
  descriptionClassName,
  ctaWrapClassName,
  badgesWrapClassName,
  visualClassName,
  mobileVisualClassName,
  ...props
}: HeroLiquidMetalProps) {
  return (
    <HeroLiquidMetalRoot {...props}>
      <HeroLiquidMetalContainer className={containerClassName}>
        <HeroLiquidMetalContent className={contentClassName}>
          <HeroLiquidMetalHeading
            className={headingWrapClassName}
            headingClassName={headingClassName}
          />
          <HeroLiquidMetalDescription
            className={descriptionWrapClassName}
            descriptionClassName={descriptionClassName}
          />
          <HeroLiquidMetalActions className={ctaWrapClassName} />
          <div
            className={cn('hidden justify-center lg:flex lg:justify-start', badgesWrapClassName)}
            data-slot="hero-liquid-metal-badges-wrap"
          >
            <HeroLiquidMetalBadges />
          </div>
        </HeroLiquidMetalContent>
        <HeroLiquidMetalVisual className={visualClassName} />
      </HeroLiquidMetalContainer>
      <HeroLiquidMetalMobileVisual className={mobileVisualClassName} />
    </HeroLiquidMetalRoot>
  );
}

export default HeroLiquidMetal;
