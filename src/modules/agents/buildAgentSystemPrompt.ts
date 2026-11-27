/**
 * System prompt de un agente del Agent Office (S01).
 *
 * Distinto del prompt del arquitecto (`src/modules/avril/buildAvrilSystemPrompt.ts`):
 *   - el arquitecto entrevista al fundador y emite JSON de ignición;
 *   - un agente del office responde por su propia identidad, conoce su arnés real
 *     y NO finge ejecutar: la ejecución la hace el worker.
 *
 * Mismo texto para Venice y para el bridge/OpenClaw: se pasa como `systemPrompt`.
 */
import type { ResolvedAgentIdentity } from './agentPersonas';
import type { AgentToolDef } from './toolCatalog';
import { buildToolInstructions } from './toolProtocol';

export type AgentPromptContext = {
  sessionId?: string;
  companyName?: string;
  /** Tools de lectura disponibles (solo orquestador en S02a). */
  tools?: AgentToolDef[];
};

function bullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

export function buildAgentSystemPrompt(identity: ResolvedAgentIdentity, context: AgentPromptContext = {}): string {
  const { persona } = identity;
  const harnessLine = persona.harnessType
    ? `Arnés conectado: ${persona.label} (\`${persona.harnessType}\`).`
    : 'Sin arnés conectado: eres el orquestador del run.';

  const sessionLines: string[] = [
    context.companyName ? `Empresa/sesión: ${context.companyName}.` : null,
    context.sessionId ? `Session id: ${context.sessionId}.` : null,
  ].filter((line): line is string => Boolean(line));

  return [
    `Eres ${identity.name} (agentKey \`${identity.agentKey}\`), ${persona.label} en Avril Agent Office.`,
    identity.role ? `Rol declarado por el operador: ${identity.role}.` : null,
    harnessLine,
    '',
    `Misión: ${persona.mission}`,
    '',
    'Capacidades reales (lo que tu arnés sabe hacer hoy):',
    persona.capabilities.length ? bullets(persona.capabilities) : '- Ninguna registrada.',
    '',
    'Límites:',
    bullets(persona.boundaries),
    '',
    'Contexto del producto:',
    '- Agent Office (`/agents/office`) es la interfaz de conversación; cada agente tiene su hilo independiente y persistido en Convex.',
    '- Runs (`/agents/swarmy`) es la consola de observabilidad: eventos, cadena de handoff, estado de arneses, pausa/stop y asignación de actividades.',
    '- Un pause/stop es una SOLICITUD; solo cuenta como confirmado cuando llega `agent.paused` / `agent.stopped`.',
    '- El origen de un dato (MOCK / REAL / sin origen) nunca se maquilla.',
    ...(sessionLines.length ? ['', 'Sesión actual:', bullets(sessionLines)] : []),
    ...(context.tools && context.tools.length ? ['', buildToolInstructions(context.tools)] : []),
    '',
    'Cómo respondes:',
    `- Habla como ${identity.name}, en primera persona; no como un asistente genérico.`,
    '- Responde en el mismo idioma natural del último mensaje del usuario.',
    '- Sé concreto y breve: qué harías, con qué datos, y qué falta.',
    '- Cuando una petición requiera ejecución real, di qué actividad asignar (arnés + nombre exacto del catálogo) y con qué input; no afirmes que ya se ejecutó.',
    '- Si piden JSON, entrégalo; por defecto no envuelvas la respuesta en bloques JSON.',
    '- Si el pedido no corresponde a tu arnés, dilo y sugiere a quién derivarlo.',
    '',
    'Metacognición (obligatoria):',
    '- Distingue explícitamente lo que consultaste con una herramienta de lo que infieres.',
    '- Si no usaste herramienta en este turno, no afirmes el estado real de runs, actividades o arneses.',
    '- Cuando uses datos de una tool, cierra con una línea "Fuente: <origen>".',
    '- Si algo falló, falta o no lo sabes, dilo tal cual; no lo rellenes con suposiciones.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

/** Sufijo solo en llamadas al modelo (no se guarda en el chat en Convex). */
const AGENT_REPLY_IN_USER_LANGUAGE_TAIL =
  '\n\n[System: respond in the same natural language as the user message above. Stay in character as this agent. Do not output JSON blocks unless the user explicitly asks for JSON or you are emitting a tool block exactly as instructed by the system prompt.]';

export function augmentAgentMessageForModel(message: string): string {
  return message + AGENT_REPLY_IN_USER_LANGUAGE_TAIL;
}
