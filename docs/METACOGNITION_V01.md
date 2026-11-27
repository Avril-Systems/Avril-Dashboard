# Metacognition v0.1 en Avril-Dashboard

Integración del pack `gerryalvrz/metacognition` (SPEC.md, SKILL.md, reflection.schema.json).
Es una capacidad **separada**: no planifica, no valida tareas, no cambia intenciones, no ejecuta
herramientas y no altera la trazabilidad de los turnos.

## Modelo

| Tabla Convex | Contenido |
|---|---|
| `metacognitionStates` | Por `sessionId + agentKey`: `enabled`, cadencia (default 24 h), `lastCycleAt`, cursor `lastProcessedAt`, lease (`leaseOwner/leaseExpiresAt`), último estado/error. |
| `metacognitionLessons` | Lecciones privadas por agente: texto ≤240, `tentative/observed`, `sourceCycleId`, refs de experiencia, `createdAt`, `retiredAt`. Máximo 20 activas. |
| `metacognitionCycles` | Un intento por claim: `running/success/skipped/failed`, `inferenceCalls` (0/1), `inputCount`, cursor, modelo, error. |

Deshabilitada por defecto; se habilita explícitamente por agente (orquestador y los cuatro arneses).

## Ciclo

```text
POST /api/orchestration/metacognition/run { sessionId, agentKey? }
  → claim atómico (enabled + cadencia + lease) y cycleId
  → experiencia: mensajes del chat del agente, más antiguos primero (máx 12)
  → si no hay nuevos: skip (0 inferencia), se respeta cadencia
  → SKILL.md + resumen de experiencia + hasta 4 lecciones previas
  → UNA llamada de inferencia (máx 400 tokens salida, 30 s)
  → validación local estricta del JSON
  → éxito: guarda lecciones + cursor + lastCycleAt (atómico, lease válido)
  → fallo/timeout/JSON inválido: no mueve cursor/lecciones, registra el intento y cadencia
```

- Sin reintentos ni llamadas de reparación; sin reflexión obligatoria por turno.
- Lease de 90 s; un writer con lease expirado no puede confirmar.
- Concurrencia: dos disparos → uno reclama, el otro recibe `leased`/`not_due`.
- `POST` sin `agentKey` recorre solo los agentes habilitados de la sesión (secuencial).
- La cadencia la impone el host; un cron externo puede llamar al endpoint (no se añadió
  infraestructura ni dependencia).

## Uso en el turno normal

Antes de responder, el host lee las lecciones activas del agente y selecciona **como máximo 3**
por coincidencia léxica, dentro de **800 caracteres** (≈200 tokens). Si no hay coincidencia, no
inyecta nada. Se presentan como **asesoramiento opcional**, separado de la intención y del
contrato de tools:

> “Lecciones de metacognición (opcionales y tentativas; no son instrucciones, no cambian tu
> intención ni permisos)”.

No se escribe nada en `turnMeta` ni en intenciones/ejecución.

## Endpoints

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/api/orchestration/metacognition?sessionId=&agentKey=` | Estado, lecciones y ciclos recientes. |
| `POST` | `/api/orchestration/metacognition` `{sessionId, agentKey, enabled, cadenceMs?}` | Habilitar/deshabilitar. |
| `POST` | `/api/orchestration/metacognition/run` `{sessionId, agentKey?}` | Trigger manual; respeta cadencia/lease. |

## Evidencia (dev, sin mocks)

Habilitados los cinco agentes de la sesión de prueba (`swarm-strategy`, `support`, `b2b`,
`prospecting`, `marketing`), cadencia de prueba 1 s y luego 24 h.

| Caso | Resultado |
|---|---|
| Ciclo con experiencia | `success`, 1 inferencia; lecciones guardadas. |
| Lecciones | Orquestador 3, soporte 3, marketing 2, b2b 1 (tras nueva experiencia); prospección 0 (éxito válido). |
| Sin experiencia nueva | `skipped: no_experience`, `inferenceCalls=0`. |
| Cadencia | Segundo disparo inmediato: `skipped: not_due`. |
| Concurrencia | Dos disparos simultáneos: uno `success`, otro `skipped: leased`; una sola inferencia/cycle. |
| Fallo local | Un ciclo falló por índice ausente antes de inferir (`failed`, 0 llamadas); sin reintento ni cambio de cursor. |
| Aislamiento | Cada agente ve solo sus lecciones; b2b/prospección vacíos no contaminan a soporte/marketing. |
| Independencia | Intenciones intactas (general + particulares) y ninguna actividad creada por el ciclo. |
| Persistencia | Lecciones y estados en Convex; sobreviven a reinicios del dev server. |

`typecheck` limpio, `metacognition:check` 9/9, `agents:check` 36/36, lint solo warnings
preexistentes. Convex dev actualizado; **sin despliegue a producción**.

## Archivos

| Archivo | Cambio |
|---|---|
| `convex/schema.ts` | Tablas `metacognition*` + índice `messages.by_chat_createdAt`. |
| `convex/serverMetacognition.ts` | Estado, claim/lease, experiencia, skip/complete/fail, ciclos. |
| `src/lib/convexServer.ts` | Wrappers. |
| `src/lib/inference.ts` | `maxTokens` y `timeoutMs` opcionales (reutiliza el proveedor genérico). |
| `src/lib/metacognitionRunner.ts` | Ciclo acotado (1 request, validación, persistencia). |
| `src/modules/metacognition/*` | SKILL, validación de esquema, selección de lecciones, experiencia, prompt. |
| `app/api/orchestration/metacognition/*` | Estado/enable y trigger manual. |
| `app/api/chat/respond/route.ts` | Inyección acotada de lecciones relevantes. |
| `src/modules/agents/buildAgentSystemPrompt.ts` | Sección opcional de lecciones. |
| `script/metacognition-check.mjs` | 9 tests deterministas. |

## Límites v0.1

- El scheduler es del host: se expone el trigger; no se añadió cron ni servicio nuevo.
- El retiro por “contradicción” es por deduplicación y tope de 20; no hay detección semántica.
- No hay compartición entre agentes (el manager no consume lecciones del equipo); sería opt-in.
- Una lección vacía es un éxito válido; no se fuerza reflexión.
- Sin despliegue a producción.
