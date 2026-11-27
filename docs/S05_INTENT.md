> **Nota (punto 5):** este router determinista por regex fue **retirado**. El LLM decide las
> herramientas y la intención estratégica vive en `intentions` (ver
> `docs/STRATEGIC_INTENTION.md`). Este documento queda como histórico.

# S05 — Intención: el orquestador actúa sin depender del modelo

Estado: implementado y verificado en local. Cierra la dependencia de que Venice emita (o no)
el bloque ```tool```.

## 1. Problema

En S02/S03 comprobamos que Venice:

- no soporta function calling (`tool_calls: null`),
- a veces ignora el protocolo de bloque y responde texto,
- y al resumir datos mezcla estados de mensajes anteriores.

Resultado: el operador pedía “¿cuántas actividades hay?” y podía recibir una respuesta de
contexto viejo o ninguna tool.

## 2. Solución: router determinista de intención

`src/modules/agents/intent.ts` (puro, probado) clasifica el mensaje antes de llamar al modelo:

| Orden | Intención | Señales | Resultado |
|---|---|---|---|
| 1 | `control` | verbo pause/kill + `run_*` + `agentKey` explícito (backticks o `agentKey=`) | propuesta `request_control` (confirmación) |
| 2 | `proposal` | verbo asignar/encolar/lanzar + arnés + actividad identificable | propuesta `assign_activity` (confirmación) |
| 3 | `read` | tool explícita, o verbo de datos + (actividades/arneses/agentes/run) | ejecuta la tool y responde determinista |
| 4 | `none` | cualquier otra cosa | flujo normal del modelo |

Reglas de seguridad:
- **Ante la duda, `none`.** No se adivinan args ni se ejecuta una acción ambigua.
- Las actividades con input obligatorio (ticket, calificación de cuentas, auditoría de sitio)
  **no** se auto-proponen: sin input fallarían al confirmar.
- `control` exige run + agentKey explícitos; un “pausa el run” sin agente devuelve `none`.
- Las escrituras siguen pasando por la tarjeta de confirmación (S02b): el router solo propone.

## 3. Respuesta

La API añade `intent` (informativo y testeable):

```json
{ "kind": "read", "tool": "list_activities", "reason": "pregunta por actividades" }
{ "kind": "proposal", "tool": "assign_activity", "reason": "asignar incident_triage a support" }
{ "kind": "control", "tool": "request_control", "reason": "control pause de swarm-strategy" }
```

Las lecturas por intención también se registran en `agentToolCalls` (S03), así que la traza y
el enlace al run siguen funcionando.

## 4. Verificación (2026-11-27, dev)

- `¿Cuántas actividades hay y en qué estados?` → `intent.kind=read`, sin llamada al modelo,
  respuesta determinista: **20 (18 completed, 2 failed)** + últimos 5 con su `runId`.
- `Asigna la actividad incident_triage al arnés support con lookbackHours 24` →
  `intent.kind=proposal`, `requiresConfirmation: true`, args
  `{ harnessType: "support", activity: "incident_triage", input: { lookbackHours: 24 } }`,
  sin ejecutar nada.
- `npm run agents:check`: **26/26** (14 protocolo + 12 intención).
- `typecheck` limpio; `lint` solo warnings preexistentes.

## 5. Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/agents/intent.ts` | **Nuevo.** Router puro (control/proposal/read/none). |
| `app/api/chat/respond/route.ts` | Ejecuta la intención antes del modelo; devuelve `intent`. |
| `script/agent-intent-check.mjs` | **Nuevo.** 12 tests de intención. |
| `package.json` | `agents:check` incluye protocolo + intención. |

## 6. Límites

- Es un router por reglas, no semántico: frases muy creativas caen en `none` y usan el modelo.
  Eso es deliberado (preferimos no adivinar).
- No sustituye al modelo para conversación normal, explicaciones ni redacción.
- `request_control` por intención solo propone; la confirmación y el estado “solicitud ≠
  confirmación” siguen igual que en S02b.
- S06 (metacognición) puede usar `intent` y la traza para que el orquestador explique qué hizo
  y por qué, sin inventar.
