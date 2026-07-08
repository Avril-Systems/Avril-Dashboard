import type { Opportunity } from '@/components/flows/luck/types';

const RISK_MAP: Record<Opportunity['difficulty'], string> = {
  low: 'balanced',
  medium: 'balanced',
  high: 'ambitious',
};

export function opportunityToIntake(opportunity: Opportunity) {
  const { blueprint } = opportunity;
  const ideaText = [
    `[Luck flow] ${opportunity.type}`,
    blueprint.summary,
    '',
    'Launch steps:',
    ...blueprint.steps.map((step, i) => `${i + 1}. ${step}`),
    '',
    `Agents: ${blueprint.agents.join(', ')}`,
    `Score: ${opportunity.score}`,
    `Source opportunity id: ${opportunity.id}`,
  ].join('\n');

  return {
    title: opportunity.name,
    rawIdea: ideaText,
    targetUser: opportunity.idealClient,
    problem: opportunity.problem,
    monetizationPreference: opportunity.monetizationSpeed,
    businessModelPreference: opportunity.type,
    desiredAutomationLevel: 'Human-supervised AI-operated company from blueprint',
    channelPreferences: ['luck-flow'],
    riskTolerance: RISK_MAP[opportunity.difficulty],
    luckOpportunityId: opportunity.id,
    luckBlueprint: blueprint,
    luckScore: opportunity.score,
  };
}

export const LUCK_SELECTION_KEY = 'avril_luck_selection';

export function persistLuckSelection(opportunity: Opportunity) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(LUCK_SELECTION_KEY, JSON.stringify(opportunity));
}

export function readPersistedLuckSelection(): Opportunity | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(LUCK_SELECTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Opportunity;
  } catch {
    return null;
  }
}

export function clearPersistedLuckSelection() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(LUCK_SELECTION_KEY);
}
