import type { Difficulty, Opportunity } from '@/components/flows/luck/types';
import type { RagBlueprintRaw } from './ragClient';

/**
 * Heurística temporal: el RAG no expone monetizationSpeed ni difficulty hoy.
 * Se derivan desde el score hasta que el pipeline del RAG los entregue.
 * TODO: quitar esta heurística cuando el RAG exponga estos campos directamente.
 */
function deriveDifficulty(score: number): Difficulty {
  if (score >= 85) return 'low';
  if (score >= 70) return 'medium';
  return 'high';
}

function deriveMonetizationSpeed(score: number): string {
  if (score >= 85) return '2–4 semanas';
  if (score >= 70) return '4–6 semanas';
  return '6–8 semanas';
}

/** Paso 1: mapea la respuesta de /random a Opportunity (sin blueprint todavía). */
export function mapRagBlueprintToOpportunity(raw: RagBlueprintRaw): Opportunity {
  return {
    id: raw.id,
    name: raw.nombre_empresa,
    type: raw.categoria,
    idealClient: raw.cliente_ideal,
    problem: raw.problema,
    offer: raw.oferta_inicial,
    agents: raw.agentes_necesarios,
    monetizationSpeed: deriveMonetizationSpeed(raw.score),
    difficulty: deriveDifficulty(raw.score),
    score: raw.score,
    // Se llena en el Paso 3 al elegir la tarjeta, vía /api/opportunities/[id]/blueprint
    blueprint: undefined,
  };
}