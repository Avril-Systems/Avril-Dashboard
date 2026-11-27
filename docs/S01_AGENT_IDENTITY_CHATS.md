# S01 — Identidad de agentes y conversaciones reales

Estado: **desplegado en el deployment dev `academic-chinchilla-476`** (schema + funciones
empujados con `npx convex dev --once --typecheck disable`). El flag de typecheck se desactiva
solo por los 25 errores preexistentes en `deployments.ts`, `founderGeneration.ts` y `summarize.ts`;
los archivos de S01 no tienen errores. No se tocó staging ni producción.

## 1. Problema

`OfficeAgentChat` aparentaba conversaciones por agente, pero:
- enviaba todo al `chatId` del fundador (`/api/chat/respond`),
- anteponía `[Directed to <nombre>]` al mensaje,
- y el backend seguía usando el system prompt de Avril arquitecta.

El historial "por agente" vivía solo en el estado del componente: se perdía al refrescar y al
cambiar de agente. No había identidad de conversación.

## 2. Decisión de diseño

Un agente se identifica por **`agentKey` dentro de una sesión de orquestación**
(`orchestrationAgents.agentKey`). Es la misma clave que ya usan los controles pause/stop, los
eventos y el worker. De ahí cuelgan:

| Pieza | Dónde vive |
|---|---|
| Identidad canónica (nombre, rol, arnés, capacidades) | `convex/serverAgentChats.ts` (validada en servidor) + `src/modules/agents/agentPersonas.ts` |
| Conversación 1:1 | `chats` con `kind='agent'`, `orchestrationSessionId`, `agentKey` |
| Mensajes | `messages` (tabla existente), `authorId` = `agentKey` en respuestas del agente |
| System prompt | `src/modules/agents/buildAgentSystemPrompt.ts` |

No se toca la tabla `agents` (registro de workers por chat) ni el chat del fundador
(`kind` undefined/`architect`). No se duplican tablas: se separan **tipos de hilo**.

## 3. Flujo

```text
Agent Office (/agents/office?sessionId=…)
  │
  ├─ GET /api/orchestration/agent-chat?sessionId&agentKey
  │     → serverAgentChats.getAgentChatServer (valida agente de la sesión)
  │     → { chatId | null, agent, messages[] }        (solo lectura)
  │
  └─ POST /api/chat/respond { sessionId, agentKey, message }
        → serverAgentChats.getOrCreateAgentChatServer (crea el hilo la 1ª vez)
        → system prompt = persona del agente (NO arquitecto)
        → bridge/OpenClaw o Venice
        → messages: usuario + respuesta (authorId = agentKey)
```

El cliente nunca elige el `chatId` del agente: lo resuelve el servidor y no puede inventar un
`agentKey` ajeno a la sesión.

## 4. Contrato de API

### `GET /api/orchestration/agent-chat`

- Query: `sessionId`, `agentKey` (ids seguros `[A-Za-z0-9_.:-]{1,128}`).
- Auth: sesión de Dashboard o `x-dashboard-token` (mismo guard que Swarmy).
- 200: `{ ok: true, sessionId, chatId: string | null, agent: { agentKey, name, role, meta }, messages: [] }`
- 400 `BAD_REQUEST`, 404 `AGENT_NOT_FOUND`, 503/500 con el resto.

### `POST /api/chat/respond`

Dos modos sobre el mismo endpoint:

| Modo | Body | Comportamiento |
|---|---|---|
| arquitecto (legacy) | `{ chatId, message, model? }` | Igual que antes: entrevista founder, `parseAvrilAssistantReply`, `chatIgnitionDrafts`. |
| agente (nuevo) | `{ sessionId, agentKey, message, model? }` | Hilo del agente, persona del arnés, sin payload de arquitecto ni ignición. |

Respuesta: `{ ok, mode, chatId, agentKey?, reply, architectPayload?, ignitionReady? }`.
En modo agente `architectPayload` nunca se envía y no se toca `chatIgnitionDrafts`.

## 5. Personas

`src/modules/agents/agentPersonas.ts` resuelve el arnés en este orden:
`meta.harnessType` → `meta.harness` → `agentKey` exacto → prefijo `support:`/`b2b-`/etc.
Si no hay arnés, el agente se trata como **orquestador** (sin herramientas inventadas).

Las capacidades se generan desde el catálogo real (`convex/lib/harnessActivities.ts`), y los
límites dejan explícito que:

- el agente **no ejecuta** nada en el chat;
- la ejecución se asigna en Runs y la corre `script/harness-worker.mjs`;
- pause/stop es solicitud, no confirmación;
- MOCK / REAL / sin origen no se maquilla.

## 6. Qué NO cambia (a propósito)

- Avril arquitecta: `/chats`, `AnimatedAIChat`, `/start/idea`, `chatIgnitionDrafts`.
- Swarmy/Runs: `SwarmyPanels`, `serverOrchestration`, `swarmyServer`, worker, adaptadores.
- Las duplicidades detectadas (`agents` vs `orchestrationAgents`, dos controles, dos alcances
  org vs tenant) **siguen intactas**: se resuelven en S04 con dependencias confirmadas.
- `script/swarmy-staging-worker.mjs` y `swarmy-mock-cycle.mjs` no se tocan todavía.

## 7. Cambios por archivo

| Archivo | Cambio |
|---|---|
| `convex/schema.ts` | `chats`: `kind`, `orchestrationSessionId`, `agentKey` + índice `by_session_agent`. |
| `convex/serverAgentChats.ts` | **Nuevo.** `getAgentChatServer`, `getOrCreateAgentChatServer`. |
| `convex/serverChats.ts`, `convex/chats.ts` | Los hilos `kind='agent'` se excluyen del listado de `/chats`. |
| `src/lib/convexServer.ts` | Wrappers `getAgentChat`, `getOrCreateAgentChat`. |
| `src/modules/agents/agentPersonas.ts` | **Nuevo.** Identidad + persona por arnés. |
| `src/modules/agents/buildAgentSystemPrompt.ts` | **Nuevo.** System prompt del agente + augment de idioma. |
| `app/api/chat/respond/route.ts` | Modo `agent`; el modo arquitecto queda igual. |
| `app/api/orchestration/agent-chat/route.ts` | **Nuevo.** Lectura del hilo por agente. |
| `src/components/office/OfficeAgentChat.tsx` | Historial persistido por agente; sin prefijo `[Directed to …]`. |
| `app/(app)/agents/office/page.tsx` | Pasa `sessionId` en vez del `chatId` del fundador. |

## 8. Verificación manual

1. Push de Convex: **hecho en dev**. Para volver a empujar mientras sigan los 25 errores
   preexistentes, usar `npx convex dev --once --typecheck disable`.
2. `/agents/office?sessionId=…` con una sesión que tenga agentes.
3. Enviar mensaje a `Soporte`, luego a `Marketing`: cada uno conserva su propio hilo.
4. Refrescar la página: los mensajes siguen ahí (vienen de Convex).
5. Comprobar que el chat del fundador en `/chats` no muestra los hilos de agentes.
6. Si el bridge/Venice no está configurado, se ve el error real; el mensaje del usuario queda
   persistido y no se inventa respuesta.

Automatizable a futuro (no incluido en S01): tests del `resolveHarnessType`/prompt y del
contrato de `respond`. El repo ya tiene `swarmy:check` y `typecheck` para la parte existente.

## 9. Cómo probar en local (estado 2026-11-27)

Hallazgo del primer intento real en `localhost:3001` (sesión `ConectaOrgánico`,
`m978te6dv9rej40rnt9t39pccn8cqcfg`): los mensajes del usuario **sí** se persistieron en el hilo
del agente (`swarm-strategy`), pero no hubo respuesta porque:

| Backend | Estado observado |
|---|---|
| Bridge `https://openclaw.agents.motusdao.org` | sin respuesta (HTTP 000) |
| Venice (`VENICE_INFERENCE_KEY` / `VENICE_ADMIN_KEY`) | `401 Authentication failed` |

El modo agente usa el bridge por defecto (`model` ausente ⇒ `codex`). Para poder validar S01 sin
esos backends, el chat del agente ahora tiene selector de modelo y existe un modo **`mock`**
solo-dev, solo en modo agente, que **nunca** se presenta como respuesta real:

- UI: selector `Venice / Codex (bridge) / Opus (bridge) / Mock (solo dev)`; la elección se guarda
  en `localStorage` (`avril-dashboard:agent-model`).
- API: `POST /api/chat/respond` con `model: "mock"`; en producción responde 400.
- La respuesta simulada empieza con `[MOCK · respuesta simulada, sin modelo real]` e incluye
  agente, agentKey, arnés y número de mensajes previos.

Prueba mínima (navegador, con la sesión de wallet activa; las cookies van solas):

```js
const sid = new URL(location.href).searchParams.get('sessionId');

// 1) ¿Existe el agente y su hilo?
await (await fetch(`/api/orchestration/agent-chat?sessionId=${sid}&agentKey=sw1-research`)).json();

// 2) Enviar en modo mock (crea el hilo si no existe)
await (await fetch('/api/chat/respond', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId: sid, agentKey: 'sw1-research', message: 'ping', model: 'mock' }),
})).json();

// 3) Releer: debe haber mensaje humano + respuesta con authorId = agentKey
await (await fetch(`/api/orchestration/agent-chat?sessionId=${sid}&agentKey=sw1-research`)).json();
```

También se puede verificar por CLI (sin secretos): `npx convex data chats`, `npx convex data messages`.

Cuando Venice o el bridge vuelvan a estar disponibles, cambiar el selector a `Venice`/`Codex` y
repetir el paso 2 sin `model: "mock"`; ese es el camino real.

### Verificación de cierre (2026-11-27)

- Hilo `swarm-strategy` en la sesión `ConectaOrgánico`: 3 mensajes del usuario + respuesta real
  de Venice persistida con `authorId: swarm-strategy` ("Hey! How can I assist you today?").
- Hilo independiente `sw1-research` (chat distinto, misma sesión) con su propia respuesta.
- `/api/chat/state` lista 17 chats del fundador y 0 hilos de agente: sin contaminación.
- El bridge sigue caído (`HTTP 000`), así que réplicas reales por ahora solo con Venice.

## 10. Siguiente

- **S02**: orquestador con herramientas reales (routing y capacidades ejecutables).
- **S03**: conectar el orquestador con Swarmy (eventos/actividades por conversación).
- **S04**: retirar duplicidades confirmadas y simplificar la UI.
