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