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
  → experiencia: mensajes del chat + resultados reales de actividades, más antiguos primero (máx 12)
     · arnés: sus propias actividades (completed/failed/blocked)
     · orquestador: actividades de todos los arneses del tenant
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
- **Scheduler conectado al runtime existente:** el worker (`script/harness-worker.mjs`) consulta
  los objetivos habilitados y llama al endpoint cada `METACOGNITION_INTERVAL_MS` (default 1 h;
  la cadencia de 24 h por agente se aplica en el endpoint). También hace un pase al arrancar y
  en `--once`. Si faltan `METACOGNITION_APP_URL`/`NEXT_PUBLIC_APP_URL` o `DASHBOARD_APP_TOKEN`,
  el worker sigue operando y omite el scheduler.

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
| Experiencia con actividades | La consulta devuelve filas `activity` con `result` real (support: incident_triage; orquestador: los cuatro arneses). |
| Scheduler del worker | `--once` disparó support: `200 success`; el resto `not_due`; el ciclo quedó `success inf=1`. |
| Lecciones | Orquestador 3, soporte 3, marketing 2, b2b 1 (tras nueva experiencia); prospección 0 (éxito válido). |
| Sin experiencia nueva | `skipped: no_experience`, `inferenceCalls=0`. |
| Cadencia | Segundo disparo inmediato: `skipped: not_due`. |
| Concurrencia | Dos disparos simultáneos: uno `success`, otro `skipped: leased`; una sola inferencia/cycle. |
| Fallo local | Un ciclo falló por índice ausente antes de inferir (`failed`, 0 llamadas); sin reintento ni cambio de cursor. |
| Aislamiento | Cada agente ve solo sus lecciones; b2b/prospección vacíos no contaminan a soporte/marketing. |
| Independencia | Intenciones intactas (general + particulares) y ninguna actividad creada por el ciclo. |
| Persistencia | Lecciones y estados en Convex; sobreviven a reinicios del dev server. |

`typecheck` limpio, `metacognition:check` 9/9, `agents:check` 38/38, lint solo warnings
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


## Worker en producción (verificación)

Requisitos mínimos del proceso worker (fuera de Next):

| Variable | Uso |
|---|---|
| `CONVEX_URL` o `NEXT_PUBLIC_CONVEX_URL` | Deployment Convex real (no dev). |
| `CONVEX_SERVER_SECRET` | Igual al secreto configurado en Convex. |
| `SWARMY_TENANT_ID`, `SWARMY_WORKSPACE_ID` | Tenant/workspace reales. |
| `GITHUB_TOKEN` | Opcional; sin él la prospección usa el límite anónimo. |
| `NVIDIA_API_KEY`, `BRAVE_API_KEY`, `ANTHROPIC_API_KEY` | Según las actividades de marketing/B2B que se usen. |
| `HARNESS_PYTHON` o `.harness-venv/bin/python` | Intérprete con dependencias de los adapters originales. |
| `METACOGNITION_APP_URL` o `NEXT_PUBLIC_APP_URL` | URL pública del Dashboard para el scheduler. |
| `DASHBOARD_APP_TOKEN` | Token de operador para llamar al endpoint de metacognición. |
| `METACOGNITION_INTERVAL_MS` | Opcional; default 3600000. |

- Ejecutar desde la raíz del repo; el worker carga `.env.local` si existe, pero en producción se
  recomienda inyectar variables por el gestor de procesos (systemd/Docker/Secrets), no un archivo
  versionado.
- Un solo worker por conjunto de arneses es suficiente: el claim de actividades y el lease de
  metacognición son atómicos. Varias instancias pueden convivir; el claim evita duplicados.
- `npm run harness:worker` (daemon) o `--once` (drena cola + un pase de scheduler).
- Verificado en dev con `METACOGNITION_APP_URL=http://localhost:3001`: el worker conectó, disparó
  los cinco objetivos y solo ejecutó el que estaba due.

### Operadores

Swarmy exige token de operador (`DASHBOARD_APP_TOKEN`) o una sesión cuyo wallet esté en
`SWARMY_OPERATOR_WALLETS` (coma-separado). Sin allowlist, las sesiones reciben
`403 OPERATOR_REQUIRED`; el token de automatización sigue funcionando. Un `agentKey` no
registrado recibe `403 AGENT_NOT_AUTHORIZED` y no hereda tools de orquestador.
