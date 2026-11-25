/**
 * Catálogo compartido de los 4 arneses y sus actividades ejecutables.
 *
 * Lo usan: la UI (formulario de asignación), la API (validación) y Convex
 * (validación del lado servidor). Sin imports de Node/React/Convex para que
 * pueda viajar en el bundle del cliente y en el runtime de Convex.
 *
 * Regla: una actividad solo existe aquí si existe un ejecutor real en
 * `script/harness-adapters.mjs`. Nada de actividades decorativas.
 */

export const HARNESS_TYPES = ['support', 'b2b', 'prospecting', 'marketing'] as const;
export type HarnessType = (typeof HARNESS_TYPES)[number];

export const ACTIVITY_KEYS = [
  'github_discovery',
  'account_qualification',
  'site_audit',
  'incident_triage',
] as const;
export type ActivityKey = (typeof ACTIVITY_KEYS)[number];

export type InputFieldType = 'text' | 'url' | 'number' | 'textarea';

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
};

export type ActivityDef = {
  key: ActivityKey;
  label: string;
  description: string;
  defaultTitle: string;
  inputFields: InputField[];
};

export type HarnessDef = {
  key: HarnessType;
  label: string;
  description: string;
  activity: ActivityDef;
};

export const HARNESS_CATALOG: Record<HarnessType, HarnessDef> = {
  prospecting: {
    key: 'prospecting',
    label: 'Prospección',
    description: 'Descubre perfiles en GitHub, verifica su actividad y prioriza compradores con evidencia.',
    activity: {
      key: 'github_discovery',
      label: 'Descubrir y verificar prospectos',
      description:
        'Consulta la API pública de GitHub, descarta perfiles inactivos y guarda hasta 5 prospectos verificados con cita y URL de evidencia.',
      defaultTitle: 'Prospección GitHub',
      inputFields: [
        {
          key: 'queries',
          label: 'Búsquedas de GitHub (opcional)',
          type: 'textarea',
          placeholder: 'topic:mcp-server fork:false\nagent workflow location:mexico fork:false',
          help: 'Una por línea. Si se deja vacío se usan las búsquedas por defecto del arnés.',
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
  },
  b2b: {
    key: 'b2b',
    label: 'B2B',
    description: 'Califica cuentas reales a partir de su sitio público y detecta señales de automatización.',
    activity: {
      key: 'account_qualification',
      label: 'Calificar cuentas B2B',
      description:
        'Hace una petición real a cada sitio, extrae título, descripción, señales técnicas y contacto; puntúa el encaje con la oferta B2B.',
      defaultTitle: 'Calificación B2B',
      inputFields: [
        {
          key: 'targets',
          label: 'Dominios o URLs (una por línea)',
          type: 'textarea',
          required: true,
          placeholder: 'https://acme.com\nsupabase.com',
          help: 'Máximo 20. Solo sitios públicos http(s); no se aceptan hosts privados.',
        },
      ],
    },
  },
  marketing: {
    key: 'marketing',
    label: 'Marketing',
    description: 'Audita una página pública real y devuelve hallazgos accionables de contenido y SEO.',
    activity: {
      key: 'site_audit',
      label: 'Auditar página pública',
      description:
        'Descarga la página, revisa title/meta/encabezados/CTAs y devuelve un diagnóstico con evidencia de la URL consultada.',
      defaultTitle: 'Auditoría de página',
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
  },
  support: {
    key: 'support',
    label: 'Soporte',
    description: 'Triaje real sobre los errores y actividades fallidas persistidos en el tenant.',
    activity: {
      key: 'incident_triage',
      label: 'Triar incidentes del tenant',
      description:
        'Lee los eventos y actividades reales del tenant, agrupa errores por paso y arnés, y propone el siguiente paso. No inventa tickets.',
      defaultTitle: 'Triaje de soporte',
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
  },
};

export function isHarnessType(value: unknown): value is HarnessType {
  return typeof value === 'string' && (HARNESS_TYPES as readonly string[]).includes(value);
}

export function isActivityKey(value: unknown): value is ActivityKey {
  return typeof value === 'string' && (ACTIVITY_KEYS as readonly string[]).includes(value);
}

/** Cada arnés declara una única actividad ejecutable; si se agregan más, se valida aquí. */
export function isActivityForHarness(harnessType: unknown, activity: unknown): boolean {
  if (!isHarnessType(harnessType)) return false;
  return HARNESS_CATALOG[harnessType].activity.key === activity;
}

export function getActivityDef(harnessType: HarnessType): ActivityDef {
  return HARNESS_CATALOG[harnessType].activity;
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
