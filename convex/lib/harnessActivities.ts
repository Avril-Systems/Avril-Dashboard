/**
 * Catálogo compartido de los 4 arneses y sus actividades ejecutables.
 *
 * Lo usan: la UI (formulario de asignación), la API (validación) y Convex
 * (validación del lado servidor). Sin imports de Node/React/Convex para que
 * pueda viajar en el bundle del cliente y en el runtime de Convex.
 *
 * Cada arnés conserva:
 *   - una actividad ORIGINAL (código vendorizado de los estudiantes), y
 *   - las actividades ADICIONALES que ya funcionaban en el Dashboard.
 *
 * Regla: una actividad solo existe aquí si existe un ejecutor real en
 * `script/harness-activity-adapters.mjs`. Nada de actividades decorativas.
 */

export const HARNESS_TYPES = ['support', 'b2b', 'prospecting', 'marketing'] as const;
export type HarnessType = (typeof HARNESS_TYPES)[number];

export const ACTIVITY_KEYS = [
  // Originales (código de los estudiantes, vendorizado en harness/original/)
  'support_ticket_triage',
  'b2b_intake_original',
  'github_discovery_original',
  'marketing_campaign',
  // Adicionales (las que ya funcionaban en el Dashboard)
  'incident_triage',
  'account_qualification',
  'github_discovery',
  'site_audit',
] as const;
export type ActivityKey = (typeof ACTIVITY_KEYS)[number];

export type InputFieldType = 'text' | 'url' | 'number' | 'textarea' | 'select';

export type InputOption = { value: string; label: string };

export type InputField = {
  key: string;
  label: string;
  type: InputFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  defaultValue?: string | number;
  min?: number;
  max?: number;
  options?: InputOption[];
  rows?: number;
};

export type ActivityDef = {
  key: ActivityKey;
  label: string;
  description: string;
  defaultTitle: string;
  /** `original` = código del estudiante; `additional` = capacidad ya existente del Dashboard. */
  origin: 'original' | 'additional';
  sourceUrl?: string;
  inputFields: InputField[];
};

export type HarnessDef = {
  key: HarnessType;
  label: string;
  description: string;
  activities: ActivityDef[];
};

/**
 * Ticket de ejemplo para el arnés de soporte. Es sintético y no contiene datos
 * reales; el humano puede reemplazarlo por un `SupportTicketRecord` anonimizado.
 */
const DEFAULT_SUPPORT_TICKET = JSON.stringify(
  {
    scope: 'avril.lab.support_ticket',
    ticketId: 'LAB-20261125-A001',
    createdAt: '2026-11-25T12:00:00.000Z',
    email: 'buyer@example.com',
    category: 'not_ready',
    message: 'Pagué el trial hace 40 minutos y sigue en espera, no está listo mi agente.',
    stripeSessionId: 'cs_test_example',
    labSlug: null,
    locale: 'es',
    clientIp: '203.0.113.10',
  },
  null,
  2
);

export const HARNESS_CATALOG: Record<HarnessType, HarnessDef> = {
  prospecting: {
    key: 'prospecting',
    label: 'Prospección',
    description: 'Descubre perfiles en GitHub, verifica su actividad y prioriza compradores con evidencia.',
    activities: [
      {
        key: 'github_discovery_original',
        label: 'Pipeline original de prospección',
        description:
          'Ejecuta el prototipo original de Alejandro: 7 búsquedas, gate HTTP, ≥3 repos, log de rechazos y salidas raw/verificados/top 5/histórico. Tarda ~2–3 min con GITHUB_TOKEN.',
        defaultTitle: 'Prospección original (GitHub)',
        origin: 'original',
        sourceUrl: 'https://github.com/alevarlaz65-afk/agente-de-proespectos-prototipo-corregido',
        inputFields: [],
      },
      {
        key: 'github_discovery',
        label: 'Descubrimiento rápido (adicional)',
        description:
          'Consulta la API de GitHub, descarta perfiles inactivos y guarda todos los verificados con top 5 marcado. Capa adicional del Dashboard.',
        defaultTitle: 'Prospección GitHub',
        origin: 'additional',
        inputFields: [
          {
            key: 'queries',
            label: 'Búsquedas de GitHub (opcional)',
            type: 'textarea',
            placeholder: 'topic:mcp-server fork:false\nagent workflow location:mexico fork:false',
            help: 'Una por línea. Si se deja vacío se usan las búsquedas por defecto del arnés.',
            rows: 3,
          },
          {
            key: 'maxCandidates',
            label: 'Máximo de candidatos a verificar',
            type: 'number',
            defaultValue: 20,
            min: 5,
            max: 40,
            help: 'Cada candidato consume llamadas a la API de GitHub. Sin GITHUB_TOKEN se limita solo.',
          },
        ],
      },
    ],
  },
  b2b: {
    key: 'b2b',
    label: 'B2B',
    description: 'Captación y seguimiento de solicitudes B2B, además de calificación de cuentas.',
    activities: [
      {
        key: 'b2b_intake_original',
        label: 'Captación B2B original',
        description:
          'Ejecuta el arnés original de Valeria: clasifica solicitudes, detecta datos faltantes, genera preguntas y borradores sin enviar, y escribe el CRM JSON/CSV.',
        defaultTitle: 'Captación B2B original',
        origin: 'original',
        sourceUrl: 'https://github.com/valrami-hue/arnes-b2b-avril',
        inputFields: [
          {
            key: 'solicitudes',
            label: 'Solicitudes (JSON, opcional)',
            type: 'textarea',
            placeholder: '[{"id":"S01","mensaje":"Necesito limpieza de oficinas en Pachuca…","remitente":{"nombre":"Ana","email":"ana@ejemplo.test"}}]',
            help: 'Si se deja vacío se usan las 10 solicitudes sintéticas originales. Acepta un arreglo JSON.',
            rows: 4,
          },
          {
            key: 'sector',
            label: 'Configuración de sector (JSON, opcional)',
            type: 'textarea',
            placeholder: '{"sector":"limpieza de oficinas","campos_obligatorios":[…]}',
            help: 'Si se deja vacío se usa config/sector.json original (LimpioMax).',
            rows: 3,
          },
          {
            key: 'modo',
            label: 'Modo',
            type: 'select',
            defaultValue: 'reglas',
            options: [
              { value: 'reglas', label: 'Reglas (por defecto, sin llaves)' },
              { value: 'modelo', label: 'Modelo (requiere ANTHROPIC_API_KEY)' },
            ],
            help: 'El modo modelo usa el cliente Anthropic original; si falta la llave, la actividad queda bloqueada.',
          },
        ],
      },
      {
        key: 'account_qualification',
        label: 'Calificar cuentas B2B (adicional)',
        description:
          'Hace una petición real a cada sitio, extrae título, descripción, señales técnicas y contacto; puntúa el encaje con la oferta B2B.',
        defaultTitle: 'Calificación B2B',
        origin: 'additional',
        inputFields: [
          {
            key: 'targets',
            label: 'Dominios o URLs (una por línea)',
            type: 'textarea',
            required: true,
            placeholder: 'https://acme.com\nsupabase.com',
            help: 'Máximo 20. Solo sitios públicos http(s); no se aceptan hosts privados.',
            rows: 3,
          },
        ],
      },
    ],
  },
  marketing: {
    key: 'marketing',
    label: 'Marketing',
    description: 'Campañas de contenido con el pipeline original de Iván, además de auditoría de páginas.',
    activities: [
      {
        key: 'marketing_campaign',
        label: 'Campaña de marketing original',
        description:
          'Ejecuta el arnés original de Iván: briefing → investigación web → copy → fact-check → materiales Markdown + reporte. No publica nada. Requiere NVIDIA_API_KEY (~30 s por pieza).',
        defaultTitle: 'Campaña de marketing original',
        origin: 'original',
        sourceUrl: 'https://github.com/ivancontreras-m/Asistente',
        inputFields: [
          {
            key: 'briefing',
            label: 'Briefing (JSON, opcional)',
            type: 'textarea',
            placeholder: '{"piezas":[{"tipo_pieza":"post","tema":"…","audiencia":"…","oferta":"…","cta":"…"}]}',
            help: 'Si se deja vacío se usa briefing_ejemplo.json original (3 piezas). Acepta una pieza o un arreglo "piezas".',
            rows: 5,
          },
          {
            key: 'modelo',
            label: 'Modelo LLM (opcional)',
            type: 'text',
            placeholder: 'nvidia/nemotron-3.5-lightning-30b-a3b',
            help: 'Si se omite se usa MODELO_LLM del entorno (default original: nemotron-3-ultra-550b).',
          },
        ],
      },
      {
        key: 'site_audit',
        label: 'Auditar página pública (adicional)',
        description:
          'Descarga la página, revisa title/meta/encabezados/CTAs y devuelve un diagnóstico con evidencia de la URL consultada.',
        defaultTitle: 'Auditoría de página',
        origin: 'additional',
        inputFields: [
          {
            key: 'url',
            label: 'URL a auditar',
            type: 'url',
            required: true,
            defaultValue: 'https://avril.systems',
            placeholder: 'https://avril.systems',
          },
          {
            key: 'keywords',
            label: 'Palabras clave (opcional)',
            type: 'text',
            placeholder: 'agentes, automatización, b2b',
            help: 'Separadas por coma. Solo se usan para contrastar el contenido visible.',
          },
        ],
      },
    ],
  },
  support: {
    key: 'support',
    label: 'Soporte',
    description: 'Triaje de tickets reales de Avril Lab con el arnés original, además de triaje de incidentes del tenant.',
    activities: [
      {
        key: 'support_ticket_triage',
        label: 'Triaje de ticket de soporte (original)',
        description:
          'Ejecuta el arnés original de Kevin: clasifica un SupportTicketRecord, redacta secretos/PII, decide si escalar y genera handoff/dev y borrador FAQ sin enviar.',
        defaultTitle: 'Triaje de soporte (ticket)',
        origin: 'original',
        sourceUrl: 'https://github.com/Kevin-vk1614/avril-support-harness',
        inputFields: [
          {
            key: 'ticket',
            label: 'Ticket (SupportTicketRecord JSON)',
            type: 'textarea',
            required: true,
            defaultValue: DEFAULT_SUPPORT_TICKET,
            help: 'Objeto o arreglo. Usa tickets anonimizados; el arnés enmascara email/clientIp y secretos.',
            rows: 10,
          },
        ],
      },
      {
        key: 'incident_triage',
        label: 'Triar incidentes del tenant (adicional)',
        description:
          'Lee los eventos y actividades reales del tenant, agrupa errores por paso y arnés, y propone el siguiente paso. No inventa tickets.',
        defaultTitle: 'Triaje de soporte',
        origin: 'additional',
        inputFields: [
          {
            key: 'lookbackHours',
            label: 'Ventana en horas',
            type: 'number',
            defaultValue: 24,
            min: 1,
            max: 168,
          },
          {
            key: 'severity',
            label: 'Severidad (opcional)',
            type: 'text',
            placeholder: 'high',
            help: 'Filtra por el campo severity del payload cuando exista.',
          },
        ],
      },
    ],
  },
};

export function isHarnessType(value: unknown): value is HarnessType {
  return typeof value === 'string' && (HARNESS_TYPES as readonly string[]).includes(value);
}

export function isActivityKey(value: unknown): value is ActivityKey {
  return typeof value === 'string' && (ACTIVITY_KEYS as readonly string[]).includes(value);
}

/** Devuelve la actividad solicitada o la primera (original) del arnés. */
export function getActivityDef(harnessType: HarnessType, activity?: string): ActivityDef {
  const harness = HARNESS_CATALOG[harnessType];
  if (!activity) return harness.activities[0];
  const hit = harness.activities.find((a) => a.key === activity);
  if (!hit) throw new Error(`La actividad '${activity}' no existe para el arnés '${harnessType}'.`);
  return hit;
}

/** Cada arnés declara una o más actividades; esta valida el par exacto. */
export function isActivityForHarness(harnessType: unknown, activity: unknown): boolean {
  if (!isHarnessType(harnessType)) return false;
  return HARNESS_CATALOG[harnessType].activities.some((a) => a.key === activity);
}

export function getDefaultActivity(harnessType: HarnessType): ActivityDef {
  return HARNESS_CATALOG[harnessType].activities[0];
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
