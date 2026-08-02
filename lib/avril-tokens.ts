export const avrilColors = {
  brand: '#0099af',
  brandDim: '#007a8c',
  brandGlow: 'rgba(0, 153, 175, 0.6)',
  /** Hot-zone lime from the Avril logo heatmap — shader / Cosmic accents only */
  accentLime: '#adfa1e',
  accentViolet: '#8b5cf6',
  accentMagenta: '#ed40b3',
  shaderDeep: '#0a1628',
  shaderNavy: '#112069',
  shaderBlue: '#1f3ca3',
  shaderTeal: '#367c66',
  canvas: '#0a0a0a',
  /** Heatmap shader fill outside the logo — semi-transparent so hero grid shows through */
  heatmapBack: '#0a0a0a59',
} as const;

/** Official Avril heatmap palette — lime is the logo hot zone */
export const avrilHeatmapPalette = [
  avrilColors.shaderDeep,
  avrilColors.brand,
  avrilColors.shaderNavy,
  avrilColors.shaderBlue,
  avrilColors.shaderTeal,
  avrilColors.accentLime,
  avrilColors.accentMagenta,
] as const;

export const avrilTechStack = [
  { name: 'OpenClaw', version: 'Live' },
  { name: 'Human.tech', version: 'Identity' },
  { name: '3-Swarm', version: 'Guardrails' },
] as const;

export const avrilShaderDefaults = {
  colorBack: avrilColors.heatmapBack,
  contour: 0.55,
  angle: 45,
  noise: 0.08,
  innerGlow: 0.55,
  outerGlow: 0.45,
  speed: 0.9,
  scale: 0.75,
  desktop: { scale: 0.78, speed: 0.75, innerGlow: 0.6, outerGlow: 0.4 },
  mobile: { speed: 0.65, scale: 0.68 },
} as const;

/** LiquidMetal hero shader defaults — Avril logo + brand tint */
export const avrilLiquidMetalDefaults = {
  image: '/Avril.png',
  colorBack: '#ffffff00',
  colorTint: avrilColors.brand,
  repetition: 6,
  softness: 0.8,
  shiftRed: 1,
  shiftBlue: -1,
  distortion: 0.4,
  contour: 0.4,
  angle: 0,
  speed: 0.9,
  scale: 0.75,
  fit: 'contain' as const,
  desktop: { scale: 0.78, speed: 0.75 },
  mobile: { speed: 0.65, scale: 0.68 },
} as const;

/** Jura-forward typography scale — matches dashboard `font-heading` usage */
export const avrilTypography = {
  display: 'font-heading text-balance font-medium tracking-tight',
  section: 'font-heading font-semibold tracking-tight',
  card: 'font-heading font-semibold tracking-tight',
  kicker: 'font-heading text-xs font-medium uppercase tracking-[0.14em]',
  wordmark: 'font-heading font-semibold tracking-tight',
  cta: 'font-heading text-sm font-medium tracking-wide',
  stat: 'font-heading text-2xl font-semibold tabular-nums tracking-tight',
  price: 'font-heading text-2xl font-semibold tracking-tight',
} as const;
