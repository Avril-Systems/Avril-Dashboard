# Swarmy S00 — Dashboard de runs y agentes (W46 P0)

Responsable: Kevin Muñoz · Rama: `feat/swarmy-s00-kevin` → PR #4 hacia `feat/swarmy-s00`
SDD: `docs/Specs/AVRIL-SWARMY-S00.md`

Qué es: una consola para ver, desde el Dashboard, los runs de Swarmy (workspace → run → pasos y agentes),
con estados, origen (mock/real), cadena de handoff y control pause/stop. **No ejecuta nada por sí misma**:
solo lee eventos de Convex y registra solicitudes de control.

> Regla de la tarjeta: ninguna UI mock cuenta como ejecución real. Lo que no se pudo verificar está marcado
> como PENDIENTE o BLOCKED en la sección "Estado de la evidencia".

## 1. Qué contiene

| Pieza | Ruta | Para qué |
|---|---|---|
| Lógica de cadena y control | `src/lib/handoffChain.ts` | Deriva la cadena soporte→handoff→ACK→diagnóstico→PR→aprobación→resultado y el estado de pause/stop. Pura, sin red. |
| Lógica de harnesses | `src/lib/harnessStatus.ts` | Registrado / conectado / ejecutando / stale de los 4 harnesses. `null` = desconocido, nunca se inventa. |
| Estados y origen | `src/lib/statusBadge.ts` | Único mapeo estado de backend → badge de UI, y etiqueta MOCK / REAL / SIN ORIGEN. |
| Aliases de eventos | `src/lib/eventAliases.ts` | Acepta los nombres de evento del SDD y los del contrato de Alejandro. |
| Agrupación de runs | `src/lib/swarmyRuns.ts` | Agrupa eventos por `runId` para la lista de runs. |
| Acceso a Convex (solo servidor) | `src/lib/swarmyServer.ts` | Lee/escribe con `SWARMY_CONVEX_SERVER_SECRET`. Nunca se importa desde el navegador. |
| Rutas API | `app/api/orchestration/swarmy/{runs,run,control}/route.ts` | Lista de runs, detalle de un run, solicitud de pause/kill. |
| Paneles | `src/components/office/SwarmyPanels.tsx` | Cadena de handoff, harnesses, estado de control. Solo presentación. |
| Pantalla | `app/(app)/agents/swarmy/page.tsx` | Consola. URL: `/agents/swarmy?runId=<id>` |

"Tareas" en esta vista = pasos de la cadena de handoff y eventos del run. "Agentes" = harnesses (conexiones con latido).
La tabla `tasks` de Convex no tiene `runId`, por eso no se mezcla.

## 2. Cómo funciona

1. La pantalla llama a `/api/orchestration/swarmy/*` (cada 5 s la lista, cada 2 s un run).
2. Las rutas validan la sesión del Dashboard (`requireDashboardToken`) y consultan Convex con el secreto en el servidor
   (`listEventsByTenant`, `getEventsByRun`, `getActiveConnections`).
3. El run abierto vive en la URL. Los datos vienen siempre de Convex, así que sobreviven a recargar y reconectar.
   No se usa `localStorage` para datos. Si una lectura falla se muestra el error y se conservan los últimos datos marcados como posiblemente desactualizados.
4. Pause/Stop: la ruta de control registra el evento `agent.command.sent`. **Solicitud no es confirmación.** La pantalla muestra
   *Solicitado* y solo pasa a *Pausado/Detenido* cuando llega `agent.paused` / `agent.stopped` posterior al comando.
   Sin confirmación en 15 s muestra *Sin confirmar*. El agente que debe confirmar es el Engine, que (según Alejandro) aún no está conectado en staging.

## 3. Variables de entorno (solo nombres, sin valores)

| Variable | Uso |
|---|---|
| `SWARMY_CONVEX_URL` | URL del Convex de Swarmy (staging). Respaldo: `CONVEX_URL` / `NEXT_PUBLIC_CONVEX_URL`. |
| `SWARMY_CONVEX_SERVER_SECRET` | Secreto de servidor de ese Convex. Respaldo: `CONVEX_SERVER_SECRET`. **Nunca** en el repo, en comandos ni en capturas. |
| `SWARMY_TENANT_ID` | Tenant que se consulta (staging: `AVRIL_STAGING_TENANT`). |
| `SWARMY_WORKSPACE_ID` | Workspace con el que se registran los comandos (staging: `ws_staging_01`). |

Se usan nombres propios para no chocar con `CONVEX_URL` / `CONVEX_SERVER_SECRET`, que usan las rutas existentes de `/api/orchestration`
contra el Convex de desarrollo. Si falta alguna, las rutas responden `503 CONFIG_MISSING` y la pantalla muestra **BLOCKED** con los nombres que faltan.

## 4. Cómo correr y probar

```powershell
npm install
node --test script/chain-logic-check.mjs script/status-badge-check.mjs script/swarmy-runs-check.mjs
npm run typecheck
npm run dev        # http://localhost:3000/agents/swarmy
```

No uses `node --test script/*.mjs`: esa carpeta tiene scripts que no son pruebas.
No ejecutes `npx convex dev` ni `convex deploy` con el deployment de staging en `CONVEX_DEPLOYMENT`.

## 5. Límites conocidos

- La ruta de control valida la sesión del Dashboard, **no el rol ni la pertenencia al tenant del usuario**.
- Con el Engine real sin conectar, pause/stop no puede llegar a *Confirmado* con datos reales. Solo se puede probar con un ciclo `isMock: true` marcado como tal.
- La actualización es por sondeo (2 s / 5 s), no por suscripción en vivo.
- El estado *stale* depende de que `getActiveConnections` devuelva todas las conexiones con su latido (ajuste pedido a Alejandro).
- `convex dev` falla su typecheck en `deployments.ts`, `founderGeneration.ts` y `summarize.ts` (preexistente, no tocado).
- El preview de Vercel del PR pide autorización de deploy (PR desde fork); no es un fallo de código.

## 6. Estado de la evidencia

Formato por actividad: PR/commit · entorno · pasos · esperado/observado · runId · prueba · resultado.

| # | Actividad | Resultado | Evidencia / motivo |
|---|---|---|---|
| 1 | PR #4 + contrato + tests | PENDIENTE review | PR: https://github.com/Avril-Systems/Avril-Dashboard/pull/4 · commits `3497dc7`, `78e5f37`, `9d536be`, `b54f9ab`, `1680927`, `4e2ac06` · local Node v24: 48/48 pruebas y typecheck sin errores. Falta review de Alejandro. |
| 2 | Navegación workspace→run→tareas/agentes | BLOCKED | Pantalla construida y compilada. Sin verificar con datos: falta sesión local (`/api/auth/nonce` responde 500 en local) y autorización de Gerry para usar staging. |
| 3 | Estados y fuentes | PENDIENTE | Lógica probada en unitarias. Falta contrastar UI con Convex real. |
| 4 | Cadena handoff con runId | PENDIENTE | Componente listo. Falta un `runId` real (el real de staging termina en BLOCKED por falta del adaptador de DeepSeek). |
| 5 | Pause/stop autenticados | BLOCKED (parcial) | Solicitud registrada por la ruta; confirmación real depende del Engine, no conectado en staging según Alejandro. |
| 6 | Persistencia y recuperación | PENDIENTE | Falta probar recarga y reconexión con datos. |
| 7 | Demo y documentación | EN CURSO | Esta guía. Falta `.env.example` al día, demo para Gerry y review de Alejandro. |

Rellenar cada fila con: URL de PR/commit, entorno y versión, runId, captura sanitizada (sin secretos ni URLs completas de deployment) y PASS/FAIL/BLOCKED con motivo.

## 7. Reglas

Sin merge a `main`, sin despliegue a producción, sin VPS, Stripe, Contabo ni secretos sin autorización.
El QA extendido de plugins/tools y la resiliencia comercial van en tarjeta separada (viernes 20).

## Evidencia de cierre W46 P0 (entorno dev + datos mock)

- **Rama / PR:** `feat/swarmy-s00-kevin` -> PR #4 (`8137deb`, `d13e1b4`)[cite: 12]
- **Verificación local:** 51/51 tests en verde (`chain-logic-check.mjs`, `status-badge-check.mjs`, `swarmy-runs-check.mjs`) y `npm run typecheck` (`tsc --noEmit`) sin errores[cite: 12].
- **RunIds sembrados en dev (`isMock: true`, `tenantId: "AVRIL_STAGING_TENANT"`):**
  - Cadena 7 pasos: `run_mock_chain_mwo6u028`[cite: 7, 9]
  - Pausa sin confirmar: `run_mock_pauseunconfirmed_mwo6uu95`[cite: 7, 9]
  - Pausa confirmada: `run_mock_pauseconfirmed_mwo6uwag`[cite: 8, 9]
  - Stop confirmado: `run_mock_killconfirmed_mwo6v3rz`[cite: 8, 9]
- **Hallazgo de seguridad (local):** `DASHBOARD_APP_TOKEN` y `NEXT_PUBLIC_DASHBOARD_APP_TOKEN` tienen el mismo valor en `.env.local` (pendiente validar entornos desplegados y rotar/retirar variable pública con autorización de Gerry).

| Punto | Estado reportado | Evidencia / Motivo |
| :--- | :--- | :--- |
| 1. PR #4, contrato y tests | **PARCIAL** (pendiente review) | PR abierto hacia `feat/swarmy-s00`, 51/51 tests y `typecheck` OK; falta aprobación de review de Alejandro[cite: 3, 12]. |
| 2. UI en staging para Gerry | **PARCIAL / BLOCKED** | Pantalla `/agents/swarmy` operativa en `dev` con sesión; staging real **BLOCKED** por autorización de Gerry y secreto por canal aprobado[cite: 3]. |
| 3. Estados y origen `real`/`mock`/`stale` | **PASS (mock/dev)** | Badges `MOCK`, `REAL`, `SIN ORIGEN` y `stale` validados y contrastados con `orchestratorConnections`[cite: 3, 9]. |
| 4. Timeline con `runId` | **PARCIAL / BLOCKED** | Cadena de 7 pasos con `runId` (`run_mock_chain_mwo6u028`) en **PASS** (mock); `runId` real **BLOCKED** sin adaptador DeepSeek en staging[cite: 3, 7]. |
| 5. Pause/stop, refresh y error | **PARCIAL / BLOCKED** | Flujo `Solicitado` / `Sin confirmar` / confirmados (`run_mock_pauseconfirmed_mwo6uwag`, `run_mock_killconfirmed_mwo6v3rz`) y manejo de error en **PASS** (mock); confirmación real del Engine en staging **BLOCKED**[cite: 3, 8]. |
| 6. Historial tras refresh/reconexión | **PASS (mock/dev)** | Lectura persistida desde Convex (`orchestratorEvents` / `orchestratorConnections`) tras recarga (`F5`) y reconexión[cite: 3, 9]. |
| 7. Build/typecheck, docs, `.env.example`, demo y review | **EN CIERRE** | `typecheck` OK, `docs/SWARMY_DASHBOARD_S00.md` y `DASHBOARD_SESSION_SECRET=` en `.env.example` (`d13e1b4`); restan capturas UI sin traducción y review/demo[cite: 3, 12]. |