export type FlowStep = 'hero' | 'loading' | 'opportunities' | 'blueprint' | 'deploy' | 'creating' | 'dashboard';

export type Difficulty = 'low' | 'medium' | 'high';

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
  blueprint: {
    summary: string;
    offer: string;
    idealCustomer: string;
    steps: string[];
    agents: string[];
    risks: string[];
    deployCost: string;
  };
};
