import type { Language } from '@/lib/landing-copy';
import type { Opportunity } from './types';

const OPPORTUNITIES_EN: Opportunity[] = [
  {
    id: 'signal-desk',
    name: 'Signal Desk',
    type: 'Agentic market intelligence',
    idealClient: 'B2B founders at pre-seed stage',
    problem: 'Hours lost tracking market signals, competitors, and launch timing.',
    offer: 'Daily brief with actionable opportunities, market alerts, and pitch-ready narrative.',
    agents: ['Scout', 'Analyst', 'Brief Writer'],
    monetizationSpeed: '2–4 weeks',
    difficulty: 'medium',
    score: 87,
    blueprint: {
      summary:
        'A market intelligence desk that turns public and private signals into product and go-to-market decisions for founders.',
      offer: 'Daily brief with actionable opportunities, market alerts, and pitch-ready narrative.',
      idealCustomer: 'B2B founders at pre-seed stage who need faster market reads.',
      steps: [
        'Connect data sources (RSS, LinkedIn, Crunchbase mock).',
        'Configure Scout and Analyst agents with your market thesis.',
        'Activate daily brief and alert channel for your team.',
      ],
      agents: ['Scout', 'Analyst', 'Brief Writer', 'Ops Coordinator'],
      risks: [
        'Signal quality depends on connected sources.',
        'Human review required before external-facing briefs.',
        'Initial setup takes 1–2 weeks of calibration.',
      ],
      deployCost: '$999 setup + $199/mo Operator',
    },
  },
  {
    id: 'clinic-flow',
    name: 'ClinicFlow',
    type: 'AI-operated clinic operations',
    idealClient: 'Boutique clinics and practices with 3–15 staff',
    problem: 'Scheduling, follow-up, and billing admin consume clinical team time.',
    offer: 'Agentic flow for appointments, reminders, summaries, and light billing.',
    agents: ['Scheduler', 'Patient Liaison', 'Billing Assistant'],
    monetizationSpeed: '4–6 weeks',
    difficulty: 'high',
    score: 79,
    blueprint: {
      summary:
        'An AI-operated operations layer for clinics — human-supervised agents handle admin without touching clinical judgment.',
      offer: 'Agentic flow for appointments, reminders, summaries, and light billing.',
      idealCustomer: 'Boutique clinics seeking operational relief without new headcount.',
      steps: [
        'Map patient journey and current friction points.',
        'Deploy Scheduler + Patient Liaison with approved templates.',
        'Integrate Billing Assistant with collection rules and weekly reports.',
      ],
      agents: ['Scheduler', 'Patient Liaison', 'Billing Assistant', 'Compliance Guard'],
      risks: [
        'Compliance review required per jurisdiction.',
        'Clinical decisions always require human oversight.',
        'Integration with existing EMR may add timeline.',
      ],
      deployCost: '$999 setup + $199/mo Operator',
    },
  },
  {
    id: 'creator-lab',
    name: 'Creator Lab',
    type: 'Agentic content studio',
    idealClient: 'Creators and micro content agencies',
    problem: 'Consistent publishing requires research, scripts, editing, and multi-channel distribution.',
    offer: 'Pipeline from ideas → script → assets → publishing with consistent brand voice.',
    agents: ['Researcher', 'Scriptwriter', 'Publisher'],
    monetizationSpeed: '1–3 weeks',
    difficulty: 'low',
    score: 92,
    blueprint: {
      summary:
        'A virtual studio that keeps your editorial calendar active with research, production, and assisted distribution.',
      offer: 'Pipeline from ideas → script → assets → publishing with consistent brand voice.',
      idealCustomer: 'Creators and micro agencies publishing 3+ times per week.',
      steps: [
        'Define brand voice and content pillars.',
        'Activate Researcher → Scriptwriter pipeline with human review gates.',
        'Schedule Publisher across priority channels.',
      ],
      agents: ['Researcher', 'Scriptwriter', 'Publisher', 'Brand Guardian'],
      risks: [
        'Brand voice calibration needs founder input in week one.',
        'Platform API changes may affect publishing automation.',
        'Human approval gate required before every publish.',
      ],
      deployCost: '$999 setup + $199/mo Operator',
    },
  },
];

const OPPORTUNITIES_ES: Opportunity[] = [
  {
    id: 'signal-desk',
    name: 'Signal Desk',
    type: 'Inteligencia de mercado agéntica',
    idealClient: 'Founders B2B en etapa pre-seed',
    problem: 'Pierden horas rastreando señales de mercado, competidores y timing de lanzamiento.',
    offer: 'Brief diario con oportunidades accionables, alertas de mercado y narrativa lista para pitch.',
    agents: ['Scout', 'Analyst', 'Brief Writer'],
    monetizationSpeed: '2–4 semanas',
    difficulty: 'medium',
    score: 87,
    blueprint: {
      summary:
        'Una mesa de inteligencia que convierte señales públicas y privadas en decisiones de producto y go-to-market para founders.',
      offer: 'Brief diario con oportunidades accionables, alertas de mercado y narrativa lista para pitch.',
      idealCustomer: 'Founders B2B en pre-seed que necesitan lecturas de mercado más rápidas.',
      steps: [
        'Conectar fuentes de datos (RSS, LinkedIn, Crunchbase mock).',
        'Configurar agentes Scout y Analyst con tu tesis de mercado.',
        'Activar brief diario y canal de alertas para tu equipo.',
      ],
      agents: ['Scout', 'Analyst', 'Brief Writer', 'Ops Coordinator'],
      risks: [
        'La calidad de señales depende de las fuentes conectadas.',
        'Revisión humana requerida antes de briefs externos.',
        'La calibración inicial toma 1–2 semanas.',
      ],
      deployCost: '$999 setup + $199/mes Operator',
    },
  },
  {
    id: 'clinic-flow',
    name: 'ClinicFlow',
    type: 'Operaciones clínicas operadas por IA',
    idealClient: 'Clínicas boutique y consultorios de 3–15 personas',
    problem: 'La agenda, seguimiento post-consulta y cobros administrativos consumen al equipo clínico.',
    offer: 'Flujo agéntico de citas, recordatorios, resúmenes clínicos y cobranza ligera.',
    agents: ['Scheduler', 'Patient Liaison', 'Billing Assistant'],
    monetizationSpeed: '4–6 semanas',
    difficulty: 'high',
    score: 79,
    blueprint: {
      summary:
        'Capa operativa operada por IA para clínicas — agentes supervisados por humanos sin tocar el juicio clínico.',
      offer: 'Flujo agéntico de citas, recordatorios, resúmenes clínicos y cobranza ligera.',
      idealCustomer: 'Clínicas boutique que buscan alivio operativo sin nuevas contrataciones.',
      steps: [
        'Mapear journey del paciente y puntos de fricción actuales.',
        'Desplegar Scheduler + Patient Liaison con plantillas aprobadas.',
        'Integrar Billing Assistant con reglas de cobro y reportes semanales.',
      ],
      agents: ['Scheduler', 'Patient Liaison', 'Billing Assistant', 'Compliance Guard'],
      risks: [
        'Revisión de compliance requerida según jurisdicción.',
        'Decisiones clínicas siempre requieren supervisión humana.',
        'Integración con EMR existente puede extender timeline.',
      ],
      deployCost: '$999 setup + $199/mes Operator',
    },
  },
  {
    id: 'creator-lab',
    name: 'Creator Lab',
    type: 'Estudio de contenido agéntico',
    idealClient: 'Creators y micro-agencias de contenido',
    problem: 'Publicar con consistencia exige investigación, guiones, edición y distribución multi-canal.',
    offer: 'Pipeline de ideas → guion → assets → publicación con voz de marca consistente.',
    agents: ['Researcher', 'Scriptwriter', 'Publisher'],
    monetizationSpeed: '1–3 semanas',
    difficulty: 'low',
    score: 92,
    blueprint: {
      summary:
        'Un estudio virtual que mantiene tu calendario editorial vivo con investigación, producción y distribución asistida.',
      offer: 'Pipeline de ideas → guion → assets → publicación con voz de marca consistente.',
      idealCustomer: 'Creators y micro-agencias que publican 3+ veces por semana.',
      steps: [
        'Definir voz de marca y pilares de contenido.',
        'Activar pipeline Researcher → Scriptwriter con approval gates humanos.',
        'Programar Publisher en tus canales prioritarios.',
      ],
      agents: ['Researcher', 'Scriptwriter', 'Publisher', 'Brand Guardian'],
      risks: [
        'Calibración de voz de marca requiere input del founder en semana uno.',
        'Cambios en APIs de plataformas pueden afectar publicación.',
        'Approval gate humano requerido antes de cada publicación.',
      ],
      deployCost: '$999 setup + $199/mes Operator',
    },
  },
];

export function getMockOpportunities(language: Language): Opportunity[] {
  return language === 'es' ? OPPORTUNITIES_ES : OPPORTUNITIES_EN;
}

export function buildIdeaOpportunity(
  language: Language,
  input: { companyName: string; rawIdea: string; targetCustomer: string; problem: string }
): Opportunity {
  const name = input.companyName.trim() || (language === 'es' ? 'Mi Empresa' : 'My Company');
  const isEs = language === 'es';

  return {
    id: 'founder-idea',
    name,
    type: isEs ? 'Blueprint desde founder brief' : 'Blueprint from founder brief',
    idealClient: input.targetCustomer.trim() || (isEs ? 'Por definir' : 'TBD'),
    problem: input.problem.trim() || input.rawIdea.trim(),
    offer: input.rawIdea.trim(),
    agents: ['Researcher', 'Ops Coordinator', 'Publisher'],
    monetizationSpeed: isEs ? '2–4 semanas' : '2–4 weeks',
    difficulty: 'medium',
    score: 84,
    blueprint: {
      summary: isEs
        ? `Blueprint generado desde tu founder brief para ${name}. Oferta, audiencia y plan de lanzamiento listos para deploy gestionado.`
        : `Blueprint generated from your founder brief for ${name}. Offer, audience, and launch plan ready for managed deploy.`,
      offer: input.rawIdea.trim(),
      idealCustomer: input.targetCustomer.trim() || (isEs ? 'Audiencia por definir en semana 1' : 'Audience to refine in week 1'),
      steps: isEs
        ? [
            'Validar oferta y cliente ideal con Avril.',
            'Configurar agentes supervisados y approval gates.',
            'Lanzar primer workflow operado por IA con monitoreo.',
          ]
        : [
            'Validate offer and ideal customer with Avril.',
            'Configure human-supervised agents and approval gates.',
            'Launch first AI-operated workflow with monitoring.',
          ],
      agents: ['Researcher', 'Ops Coordinator', 'Publisher', 'Brand Guardian'],
      risks: isEs
        ? [
            'La oferta requiere validación con clientes reales.',
            'Deploy inicial necesita aprobación humana en cada paso crítico.',
            'Costos de cloud dependen del volumen de workflows.',
          ]
        : [
            'Offer requires validation with real customers.',
            'Initial deploy needs human approval at each critical step.',
            'Cloud costs depend on workflow volume.',
          ],
      deployCost: isEs ? '$999 setup + $199/mes Operator' : '$999 setup + $199/mo Operator',
    },
  };
}

/** Richer blueprint from the branded Founder Wizard (Build from my idea → Form). */
export function buildOpportunityFromWizard(
  language: Language,
  answers: {
    companyName: string;
    rawIdea: string;
    problem: string;
    targetUser: string;
    founderName: string;
    monetization: string;
    businessModel: string;
    riskTolerance: string;
    automationLevel: string;
    channels: string;
    country: string;
    language: string;
  },
  options?: { summaryOverride?: string }
): Opportunity {
  const isEs = language === 'es';
  const idea = answers.rawIdea.trim();
  const explicitName = answers.companyName.trim();
  const nameFromIdea = idea
    .replace(
      /^(?:i\s+(?:want|would like)\s+to\s+(?:build|create|make|start|launch)|we(?:'re| are)\s+building|building|my idea is|idea:)\s+/i,
      ''
    )
    .split(/[.!?\n]/)[0]
    ?.trim()
    .slice(0, 48);
  const name =
    explicitName ||
    nameFromIdea ||
    (answers.founderName.trim()
      ? `${answers.founderName.trim()}${isEs ? ' · Empresa' : ' · Company'}`
      : isEs
        ? 'Mi Empresa'
        : 'My Company');

  const posture = (answers.riskTolerance || 'balanced').toLowerCase();
  const agents =
    posture === 'ambitious'
      ? ['Scout', 'Growth Operator', 'Publisher', 'Brand Guardian']
      : posture === 'conservative'
        ? ['Researcher', 'Compliance Guard', 'Ops Coordinator', 'Brand Guardian']
        : ['Researcher', 'Ops Coordinator', 'Publisher', 'Brand Guardian'];

  const offerBits = [idea, answers.monetization.trim(), answers.businessModel.trim()].filter(Boolean);
  const offer = offerBits.join(' · ') || idea;
  const idealCustomer =
    answers.targetUser.trim() ||
    (isEs ? 'Audiencia por definir en semana 1' : 'Audience to refine in week 1');
  const problem = answers.problem.trim() || idea;
  const channels = answers.channels.trim();

  const summary =
    options?.summaryOverride?.trim() ||
    (isEs
      ? `Blueprint generado desde tu founder brief para ${name}. ${problem ? `Resuelve: ${problem.slice(0, 160)}` : ''}`.trim()
      : `Blueprint generated from your founder brief for ${name}. ${problem ? `Solves: ${problem.slice(0, 160)}` : ''}`.trim());

  const steps = isEs
    ? [
        'Validar oferta y cliente ideal con Avril.',
        answers.automationLevel.trim()
          ? `Configurar agentes con nivel de automatización: ${answers.automationLevel.trim()}.`
          : 'Configurar agentes supervisados y approval gates.',
        channels
          ? `Lanzar primer workflow en canales: ${channels}.`
          : 'Lanzar primer workflow operado por IA con monitoreo.',
      ]
    : [
        'Validate offer and ideal customer with Avril.',
        answers.automationLevel.trim()
          ? `Configure agents with automation level: ${answers.automationLevel.trim()}.`
          : 'Configure human-supervised agents and approval gates.',
        channels
          ? `Launch first AI-operated workflow on: ${channels}.`
          : 'Launch first AI-operated workflow with monitoring.',
      ];

  const market = [answers.country.trim(), answers.language.trim()].filter(Boolean).join(' · ');

  return {
    id: `founder-wizard-${Date.now()}`,
    name,
    type: isEs ? 'Blueprint desde founder brief' : 'Blueprint from founder brief',
    idealClient: idealCustomer,
    problem,
    offer,
    agents: agents.slice(0, 3),
    monetizationSpeed: isEs ? '2–4 semanas' : '2–4 weeks',
    difficulty: posture === 'ambitious' ? 'high' : posture === 'conservative' ? 'low' : 'medium',
    score: posture === 'ambitious' ? 90 : posture === 'conservative' ? 78 : 84,
    blueprint: {
      summary,
      offer,
      idealCustomer: market ? `${idealCustomer} (${market})` : idealCustomer,
      steps,
      agents,
      risks: isEs
        ? [
            'La oferta requiere validación con clientes reales.',
            'Deploy inicial necesita aprobación humana en cada paso crítico.',
            posture === 'ambitious'
              ? 'Ritmo ambicioso aumenta varianza de costos y scope.'
              : 'Costos de cloud dependen del volumen de workflows.',
          ]
        : [
            'Offer requires validation with real customers.',
            'Initial deploy needs human approval at each critical step.',
            posture === 'ambitious'
              ? 'Ambitious pace increases cost and scope variance.'
              : 'Cloud costs depend on workflow volume.',
          ],
      deployCost: isEs ? '$999 setup + $199/mes Operator' : '$999 setup + $199/mo Operator',
    },
  };
}
