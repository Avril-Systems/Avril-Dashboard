# Runbook — Backend de Orquestación Swarmy (Convex)

## 1. Arquitectura y Contrato (`v1.0`)
- **Esquema (`convex/schema.ts`):**
  - `orchestratorEvents`: Contrato versionado (`v1.0`), aislado por `tenantId`, con índice compuesto `by_tenant_idempotency` para deduplicación y `by_tenant_run` para consultas por ejecución.
  - `orchestratorConnections`: Registro *stateless* de latidos (*heartbeats*) por `tenantId` y `connectionId` (`support`, `b2b`, `prospecting`, `marketing`) con ventana activa de 60 segundos.
- **Autenticación y Aislamiento (`convex/serverOrchestration.ts`):**
  - Todas las mutaciones (`ingestEvent`, `pingConnection`) y consultas (`getEventsByRun`, `listEventsByTenant`, `getActiveConnections`) exigen `serverSecret` validado contra `CONVEX_SERVER_SECRET` y filtran obligatoriamente por `tenantId`.

## 2. Configuración del Entorno (Local / Staging)
1. Copia `.env.example` a `.env.local` y configura la URL de tu deployment de Convex (`NEXT_PUBLIC_CONVEX_URL` / `CONVEX_URL`).
2. Configura el secreto del servidor en Convex (nunca lo subas al repositorio):
   ```bash
   npx convex env set CONVEX_SERVER_SECRET "<tu-secreto-seguro>"
## 3. Actividades por arnés (cola durable)
- **Tabla:** `harnessActivities` con `activityId`, `runId`, `harnessType`, `activity`, `input`, `status`
  (`queued/running/completed/failed/blocked/cancelled`) y `result`.
- **Mutaciones:** `assignHarnessActivity`, `claimNextHarnessActivity` (claim atómico por tenant+arnés),
  `completeHarnessActivity`.
- **Consultas:** `listHarnessActivities` (con `includeResult` opcional), `getHarnessActivity`.
- **Eventos:** `activity.assigned`, `activity.started`, `activity.completed`, `activity.failed`,
  `activity.blocked` y `prospecto.verificado`.
- **Ejecución:** `script/harness-worker.mjs` (proceso aparte) reclama y ejecuta con
  `script/harness-adapters.mjs`. Sin worker, la actividad queda `queued`.

Contrato, variables y evidencia real: [`SWARMY_ACTIVITIES.md`](./SWARMY_ACTIVITIES.md).


## 4. Operadores y worker en producción

- **Acceso Swarmy:** `DASHBOARD_APP_TOKEN` (automatización/ops) o sesión cuyo wallet esté en
  `SWARMY_OPERATOR_WALLETS` (coma-separado). Sin allowlist, las sesiones no son operadoras y
  reciben `403 OPERATOR_REQUIRED`. No se permite el bypass de demo.
- **Worker:** ejecutar `npm run harness:worker` desde la raíz con `CONVEX_URL`,
  `CONVEX_SERVER_SECRET`, `SWARMY_TENANT_ID`, `SWARMY_WORKSPACE_ID`, `GITHUB_TOKEN` (opcional) y
  las claves de los adapters que se usen (`NVIDIA_API_KEY`, `BRAVE_API_KEY`, `ANTHROPIC_API_KEY`).
  El intérprete Python sale de `HARNESS_PYTHON` o `.harness-venv/bin/python`.
- **Scheduler de metacognición:** el mismo worker llama a
  `${NEXT_PUBLIC_APP_URL|METACOGNITION_APP_URL}/api/orchestration/metacognition/run` con
  `DASHBOARD_APP_TOKEN`, cada `METACOGNITION_INTERVAL_MS` (default 1 h; cadencia por agente 24 h).
  Si faltan URL/token, el worker sigue ejecutando actividades y solo omite el scheduler.
- **Convex:** `CONVEX_SERVER_SECRET` debe coincidir con el deployment de producción; no usar el
  de dev. `npx convex deploy` es un paso aparte y no se ejecutó en esta rama.
