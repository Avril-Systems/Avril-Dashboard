export type LuckStep = 'hero' | 'loading' | 'opportunities' | 'blueprint';

export type Opportunity = {
  id: string;
  name: string;
  type: string;
  idealClient: string;
  problem: string;
  offer: string;
  agents: string[];
  monetizationSpeed: string;
  difficulty: 'Baja' | 'Media' | 'Alta';
  score: number;
  blueprint: {
    summary: string;
    steps: string[];
    agents: string[];
  };
};
