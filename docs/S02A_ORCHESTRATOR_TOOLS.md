# S02a — Orquestador con herramientas de lectura (reales)

Estado: implementado y probado en local contra el deployment dev `academic-chinchilla-476`.
Solo lectura: no asigna actividades ni pausa/detiene agentes (eso es S02b).

## 1. Problema

El "orquestador" del Agent Office era un chat con persona: no podía consultar el estado real
de un run, la cola de actividades ni la salud de los arneses. Cualquier cifra que diera era
del modelo, no del backend.

## 2. Decisión: protocolo de acción propio

Venice **no soporta function calling nativo**: probado con `tools` + `tool_choice:auto`, responde
HTTP 200 con `tool_calls: null`. Por eso el contrato es un bloque explícito que el servidor
parsea y valida antes de ejecutar nada:

````text
```tool
{"tool":"run_overview","arguments":{"runId":"run_marketing_..."}}
```
````

- Una herramienta por turno, sin texto antes ni después.
- El servidor valida nombre, argumentos obligatorios y tipos; si el bloque es inválido **no se
  ejecuta** y el error se muestra tal cual.
- Tras ejecutar, el resultado real se resume de forma **determinista en servidor** (sin segunda
  llamada al modelo). Así no se mezclan estados de mensajes anteriores ni se inventan cifras.
  El bloque de herramienta nunca se persiste en el hilo.
- Límite de una ronda de herramienta por mensaje (sin bucles).

## 3. Herramientas (solo lectura)

| Tool | Args | Fuente real |
|---|---|---|
| `run_overview` | `runId` (obligatorio) | `orchestratorEvents` + `harnessActivities` del tenant Swarmy |
| `list_activities` | `runId?`, `harnessType?`, `status?`, `limit?` | `harnessActivities` (cola durable) |
| `harness_health` | — | `orchestratorConnections` (heartbeats, stale > 60 s) |
| `list_agents` | — | `orchestrationAgents` de **la sesión del chat** (no se puede pedir otra) |

Reglas de alcance:
- El tenant/workspace de Swarmy siempre salen del servidor (`SWARMY_TENANT_ID` / `SWARMY_WORKSPACE_ID`).
- `list_agents` ignora cualquier `sessionId` del modelo: usa el de la conversación, validado por
  `serverAgentChats`.
- Si falta configuración de Swarmy o el backend falla, la tool devuelve un error explícito
  (`CONFIG_MISSING` incluido) y el modelo debe decirlo; no se inventan datos.

## 4. Flujo

```text
POST /api/chat/respond { sessionId, agentKey, message, model }
  → persona del agente (solo el orquestador recibe tools; agentes con arnés no)
  → modelo responde texto o bloque ```tool```
  → parseToolCall(valida nombre + args)
  → executeAgentTool (Swarmy/Convex, server-only)
  → resumen determinista del resultado real (sin segunda llamada al modelo)
  → se persiste la respuesta; la API devuelve `toolCalls[]` con ok/error
```

## 5. Archivos

| Archivo | Rol |
|---|---|
| `src/modules/agents/toolCatalog.ts` | Catálogo puro de tools y argumentos. |
| `src/modules/agents/toolProtocol.ts` | Parser/validador del bloque, stripping y prompt de tools. |
| `src/modules/agents/executeAgentTool.ts` | Ejecución server-only contra Swarmy/Convex + resumen de fallback. |
| `src/modules/agents/buildAgentSystemPrompt.ts` | Inyecta las tools al prompt del orquestador. |
| `app/api/chat/respond/route.ts` | Ronda de tool (1), resumen determinista y `toolCalls` en la respuesta. |
| `src/components/office/OfficeAgentChat.tsx` | Señal visual transitoria (`🔧 Herramienta: …`). |
| `script/agent-tool-protocol-check.mjs` | 8 tests puros del protocolo (`npm run agents:check`). |

## 6. Verificación (2026-11-27, dev)

- Mensaje real al orquestador (`swarm-strategy`, sesión `m978…`) pidiendo `list_activities`.
- La API devolvió `toolCalls: [{ tool: "list_activities", args: {}, ok: true }]`.
- La query exacta de la tool (mismo tenant `AVRIL_STAGING_TENANT`, mismo secreto) devolvió
  **19 actividades: 17 completed, 2 failed**; la respuesta del modelo reflejó esos datos.
- `npm run agents:check`: 8/8. `npm run typecheck`: limpio. `npm run lint`: solo warnings preexistentes.

## 7. Límites conocidos

- Solo el orquestador (agente sin arnés) recibe tools; los agentes de arnés aún no.
- No hay persistencia/auditoría de la tool call en el hilo: la señal visual es transitoria.
  Queda para S02c (evento/registro) y S03 (conexión con Swarmy).
- La respuesta de lectura es determinista (no la redacta el modelo); S05 (intención) puede
  añadir redacción natural sin perder la fuente de verdad.
- En el preview de Vercel no funciona todavía: ese build apunta a
  `outstanding-swordfish-684.convex.cloud`, donde no está el schema/funciones de S01/S02.
