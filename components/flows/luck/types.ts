export type FlowStep =
  | "hero"
  | "loading"
  | "loading-blueprint"
  | "opportunities"
  | "blueprint"
  | "deploy"
  | "creating"
  | "dashboard";

export type Difficulty = "low" | "medium" | "high";

/** Blueprint devuelto por el RAG: */
export type RagBlueprint = {
  markdown: string;
};

/** Blueprint estructurado emitido por el wizard / founder brief. */
export type StructuredBlueprint = {
  summary: string;
  offer: string;
  idealCustomer: string;
  steps: string[];
  agents: string[];
  risks: string[];
  deployCost: string;
};

export type Blueprint = RagBlueprint | StructuredBlueprint;

export function isMarkdownBlueprint(bp: Blueprint): bp is RagBlueprint {
  return "markdown" in bp;
}

export type Opportunity = {
  id: string;
  name: string;
  type: string;
  idealClient: string;
  problem: string;
  offer: string;
  agents: string[];
  monetizationSpeed: string;
  difficulty: Difficulty;
  score: number;
  blueprint?: Blueprint;
};
