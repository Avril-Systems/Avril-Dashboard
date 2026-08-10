import type { StructuredBlueprint } from '@/components/flows/luck/types';

/** Cap de seguridad para el markdown del documento de identidad (RAG). */
export const BLUEPRINT_MAX_CHARS = 60_000;

export function structuredBlueprintToMarkdown(bp: StructuredBlueprint): string {
  return [
    '## Blueprint summary',
    bp.summary,
    '',
    '## Offer',
    bp.offer,
    '',
    '## Ideal customer',
    bp.idealCustomer,
    '',
    '## First steps',
    ...(bp.steps ?? []).map((s, i) => `${i + 1}. ${s}`),
    '',
    '## Agents',
    ...(bp.agents ?? []).map((a) => `- ${a}`),
    '',
    '## Risks',
    ...(bp.risks ?? []).map((r) => `- ${r}`),
    '',
    '## Deploy cost',
    bp.deployCost,
  ].join('\n');
}
