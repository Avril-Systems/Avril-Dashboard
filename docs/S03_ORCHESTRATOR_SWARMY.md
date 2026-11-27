# S03 — Orquestador conectado a Swarmy (traza, runs y datos deterministas)

Estado: implementado y verificado en local contra `academic-chinchilla-476` (tabla
`agentToolCalls` empujada). Producción (`app.avril.life`) sigue pendiente de su propio deploy.

## 1. Qué conecta

S02a/S02b ya ejecutaban lecturas y acciones contra Swarmy. S03 cierra el circuito visible:

1. **Traza persistida**: cada tool ejecutada (lectura o escritura confirmada) queda en
   `agentToolCalls` con args, ok/error, `runId` y `activityId`.
2. **Enlace al run**: la conversación muestra un acceso directo a
   `/agents/swarmy?runId=…` para el run creado/consultado.
3. **Respuestas de datos deterministas**: las tools de lectura ya no pasan por una segunda
   llamada al modelo. El servidor resume el resultado real; así no se repiten estados viejos
   ni se inventan cifras.

## 2. Modelo de datos

```ts
agentToolCalls: {
  chatId, sessionId, agentKey, tool, args, ok, error?, runId?, activityId?, createdAt
}
  .index('by_chat', ['chatId'])
  .index('by_session', ['sessionId'])
```

Escritura server-only (`recordAgentToolCallServer`) con dos comprobaciones:
- el secreto de servidor,
- que el chat sea `kind='agent'` y pertenezca a la misma `sessionId`.

Lectura (`listAgentToolCallsServer`) devuelve las últimas 20 por chat.

## 3. Flujo

```text
POST /api/chat/respond (agente)
  → tool de LECTURA: se ejecuta, se resume en servidor y se registra en agentToolCalls
  → tool de ESCRITURA: propuesta (sin ejecutar) — no se registra como ejecutada
  → confirmTool: se ejecuta, se registra con runId/activityId y se persiste el resultado

GET /api/orchestration/agent-chat
  → { messages, toolCalls[] }   (la traza sobrevive a la recarga)
```

UI (`OfficeAgentChat`): bloque plegable **“Traza del orquestador · N”** con tool, ok/error,
hora y enlace **Ver run** cuando hay `runId`.

## 4. Por qué las lecturas son deterministas

En la prueba, Venice respondió “20 actividades en la cola” cuando el dato real era
**20 total: 18 completed, 2 failed, 0 queued**. Mezclaba el resultado de la tool con mensajes
anteriores del hilo. La corrección:

- `summarizeToolOutcome` construye el texto desde el JSON real (conteos por estado, items
  recientes, salud de arneses, agentes).
- No hay segunda llamada al modelo para lecturas.
- El prompt del orquestador sigue permitiendo texto normal cuando no hay tool.

Resultado verificado:

```text
Actividades encontradas: 20 (18 completed, 2 failed).

Más recientes:
- support/incident_triage · completed · run run_support_mwynb77p_walgel
- prospecting/github_discovery_original · completed · run run_prospecting_mwwtuq3n_0emqm3
...
```

## 5. Evidencia

- `POST` con tool de lectura → `toolCalls: [{ tool: "list_activities", ok: true }]` y respuesta
  determinista con los 20/18/2 reales.
- Confirmación de `assign_activity` (`incident_triage`, `support`, `lookbackHours: 24`) →
  `activityId act_mwynghan_rpwlie`, `runId run_support_mwynghan_rpwlie`.
- `GET /api/orchestration/agent-chat` devolvió **4** entradas de traza (1 assign con run,
  3 lecturas) tras recargar; el vínculo al run se pinta en la UI.
- Worker real: la actividad anterior (`act_mwynb77p_walgel`) quedó `completed`.
- `npm run agents:check` 14/14, `typecheck` limpio, `lint` solo warnings preexistentes.

## 6. Archivos

| Archivo | Cambio |
|---|---|
| `convex/schema.ts` | Tabla `agentToolCalls` + índices. |
| `convex/serverAgentChats.ts` | `recordAgentToolCallServer`, `listAgentToolCallsServer`. |
| `src/lib/convexServer.ts` | Wrappers `recordAgentToolCall`, `listAgentToolCalls`. |
| `app/api/chat/respond/route.ts` | Registro de traza (lectura y confirmación); resumen determinista; sin segunda llamada. |
| `app/api/orchestration/agent-chat/route.ts` | Devuelve `toolCalls`. |
| `src/components/office/OfficeAgentChat.tsx` | Traza plegable con enlace al run. |
| `src/modules/agents/executeAgentTool.ts` | `summarizeToolOutcome` detallado (conteos, items, arneses, agentes). |

## 7. Límites conocidos

- La **propuesta** de escritura no se persiste como fila de traza (sí el mensaje en el hilo);
  si se recarga, se pierde el botón de confirmar. Persistirla requiere un estado de propuesta
  explícito; queda para S04/S05 si hace falta.
- Que el modelo emita el bloque de herramienta depende del prompt (Venice no tiene function
  calling). Si no lo emite, responde texto: no se ejecuta nada. El enrutado determinista por
  intención es **S05**.
- Producción (`app.avril.life`) apunta a `outstanding-swordfish-684`, donde todavía no están
  el schema/funciones de S01–S03.
