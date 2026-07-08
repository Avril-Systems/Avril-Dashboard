import type { Opportunity } from './types';

export const LOADING_MESSAGES = [
  'Analizando señales de mercado…',
  'Detectando oportunidades…',
  'Armando blueprint inicial…',
] as const;

export const MOCK_OPPORTUNITIES: Opportunity[] = [
  {
    id: 'signal-desk',
    name: 'Signal Desk',
    type: 'Inteligencia de mercado agéntica',
    idealClient: 'Founders B2B en etapa pre-seed',
    problem: 'Pierden horas rastreando señales de mercado, competidores y timing de lanzamiento.',
    offer: 'Brief diario con oportunidades accionables, alertas de mercado y narrativa lista para pitch.',
    agents: ['Scout', 'Analyst', 'Brief Writer'],
    monetizationSpeed: '2–4 semanas',
    difficulty: 'Media',
    score: 87,
    blueprint: {
      summary:
        'Una mesa de inteligencia que convierte señales públicas y privadas en decisiones de producto y go-to-market para founders.',
      steps: [
        'Conectar fuentes de datos (RSS, LinkedIn, Crunchbase mock).',
        'Configurar agentes Scout y Analyst con tu tesis de mercado.',
        'Activar brief diario y canal de alertas para tu equipo.',
      ],
      agents: ['Scout', 'Analyst', 'Brief Writer', 'Ops Coordinator'],
    },
  },
  {
    id: 'clinic-flow',
    name: 'ClinicFlow',
    type: 'Operaciones clínicas autónomas',
    idealClient: 'Clínicas boutique y consultorios de 3–15 personas',
    problem: 'La agenda, seguimiento post-consulta y cobros administrativos consumen al equipo clínico.',
    offer: 'Flujo agéntico de citas, recordatorios, resúmenes clínicos y cobranza ligera.',
    agents: ['Scheduler', 'Patient Liaison', 'Billing Assistant'],
    monetizationSpeed: '4–6 semanas',
    difficulty: 'Alta',
    score: 79,
    blueprint: {
      summary:
        'Sistema agéntico que automatiza la capa operativa de una clínica sin tocar el juicio clínico del médico.',
      steps: [
        'Mapear journey del paciente y puntos de fricción actuales.',
        'Desplegar Scheduler + Patient Liaison con plantillas aprobadas.',
        'Integrar Billing Assistant con reglas de cobro y reportes semanales.',
      ],
      agents: ['Scheduler', 'Patient Liaison', 'Billing Assistant', 'Compliance Guard'],
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
    difficulty: 'Baja',
    score: 92,
    blueprint: {
      summary:
        'Un estudio virtual que mantiene tu calendario editorial vivo con investigación, producción y distribución asistida.',
      steps: [
        'Definir voz de marca y pilares de contenido.',
        'Activar pipeline Researcher → Scriptwriter con revisiones humanas.',
        'Programar Publisher en tus canales prioritarios.',
      ],
      agents: ['Researcher', 'Scriptwriter', 'Publisher', 'Brand Guardian'],
    },
  },
];
