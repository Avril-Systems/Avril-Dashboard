# S02b — Orquestador con acciones reales (confirmación explícita)

Estado: implementado y verificado en local contra el deployment dev `academic-chinchilla-476`.
S02a (lectura) sigue igual; esto agrega escritura **con confirmación humana**.

## 1. Regla

Una tool de escritura **nunca** se ejecuta en el turno del modelo. El flujo es de dos fases:

```text
1) Usuario pide una acción
   → el modelo emite ```tool {"tool":"assign_activity", ...}```
   → el servidor lo valida y devuelve una PROPUESTA (no ejecuta nada)
   → se persiste en el hilo: "Propongo ejecutar ... No se ha ejecutado nada."

2) El operador pulsa Confirmar (o Cancelar)
   → POST /api/chat/respond { sessionId, agentKey, confirmTool: { tool, arguments } }
   → el servidor REVALIDA args y ejecuta la acción real una sola vez
   → se persiste "Confirmo: ..." + el resultado determinista
```

La confirmación no llama al modelo: el resultado se redacta de forma determinista para no
depender de otra llamada (y no poder “adornar” lo ocurrido).

## 2. Tools de escritura

| Tool | Args | Acción real | Validación |
|---|---|---|---|
| `assign_activity` | `harnessType`, `activity`, `input?`, `title?` | `assignHarnessActivity` → fila `queued` en `harnessActivities` + evento `activity.assigned` (run nuevo) | `normalizeActivityInput` (arnés/actividad del catálogo, defaults, URLs públicas, tamaños) |
| `request_control` | `runId`, `agentKey`, `command` (`pause`\|`kill`) | `sendRunCommand` → evento `agent.command.sent` | `isSafeId` + command permitido |

`request_control` es **solicitud**, no confirmación: el hilo y la UI lo dicen explícitamente
(“no cuenta como confirmada hasta `agent.paused` / `agent.stopped`”).

## 3. Defensas

- `executeAgentTool` (lectura) rechaza tools de escritura.
- `executeConfirmedAgentTool` rechaza tools de lectura y revalida `harnessType`/`activity`/`input`.
- La ruta de confirmación exige `sessionId + agentKey` y resuelve el chat/agente en el servidor
  (`getOrCreateAgentChatServer`): no se puede confirmar contra otra sesión.
- El input de una actividad nunca acepta secretos; `normalizeActivityInput` es la misma puerta que
  usa la UI de Runs.
- Si la ejecución funciona pero falla la persistencia del mensaje, la respuesta incluye
  `warning` en lugar de fingir que no pasó nada.

## 4. Contrato de API

`POST /api/chat/respond` (modo agente) ahora acepta:

```json
{ "sessionId": "…", "agentKey": "…", "confirmTool": { "tool": "assign_activity", "arguments": { … } } }
```

- Propuesta (turno normal): `{ ok, requiresConfirmation: true, proposal: { tool, arguments, summary }, reply }`.
- Confirmación: `{ ok, mode: "agent", chatId, agentKey, reply, toolCalls: [{ tool, args, ok, error? }] }`.
- Errores de validación: 400; agente/sesión desconocidos: 404 `AGENT_NOT_FOUND`.

## 5. UI

`OfficeAgentChat` muestra una tarjeta ámbar “Acción pendiente de confirmación” con el resumen
determinista y botones **Confirmar / Cancelar**. Mientras hay propuesta, el mensaje ya persistido
deja claro que no se ejecutó nada. La tarjeta es estado local: si se recarga la página se pierde
(el mensaje de propuesta queda en el hilo). Persistir la propuesta queda para S02c.

## 6. Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/agents/toolCatalog.ts` | `kind: read\|write`, `assign_activity`, `request_control`, `isWriteTool`. |
| `src/modules/agents/toolProtocol.ts` | Instrucciones separadas lectura/escritura + `describeToolProposal`. |
| `src/modules/agents/executeAgentTool.ts` | Guard de lectura + `executeConfirmedAgentTool` + `summarizeConfirmedToolOutcome`. |
| `app/api/chat/respond/route.ts` | Propuesta en el turno, rama `confirmTool`, `requiresConfirmation/proposal`, `warning`. |
| `src/components/office/OfficeAgentChat.tsx` | Tarjeta de confirmación y confirm/cancel. |
| `script/agent-tool-protocol-check.mjs` | 14 tests del protocolo (incluye write tools y summaries). |

## 7. Verificación (2026-11-27, dev)

1. `POST` al orquestador pidiendo `incident_triage` (arnés `support`, `lookbackHours: 24`).
2. Respuesta: `requiresConfirmation: true`, `proposal` con el resumen, **sin** `toolCalls`; en el hilo
   quedó “Propongo ejecutar… No se ha ejecutado nada.”
3. `POST` con `confirmTool` (mismos args) → `toolCalls: [{ tool: "assign_activity", ok: true }]`,
   `activityId act_mwynb77p_walgel`, `runId run_support_mwynb77p_walgel`.
4. Convex: la actividad aparece en el run y el worker la ejecutó (`completed`).
5. Hilo: “Confirmo: …” + “Actividad encolada… Queda en cola hasta que el worker la reclame”.
6. `npm run agents:check` 14/14, `typecheck` limpio, `lint` solo warnings preexistentes.

## 8. Límites conocidos

- La propuesta no sobrevive a un reload (estado local) → S02c.
- No se puede cancelar una actividad `running` (requiere cooperación del worker; ya documentado en Swarmy).
- `request_control` no se probó contra un agente real (evita mandar comandos sin necesidad); su
  ejecución usa el mismo endpoint ya existente y probado de Swarmy.
- En producción (`app.avril.life`) todavía no aplica: el Convex de Vercel
  (`outstanding-swordfish-684`) no tiene el schema/funciones de S01/S02.
