# Swarmy S00 — Actividades reales por arnés

Esta pieza completa el ciclo **asignar → ejecutar → consultar** para los cuatro
arneses (`prospección`, `marketing`, `B2B`, `soporte`) sin simular resultados.

```text
Dashboard /agents/swarmy
   │  POST /api/orchestration/harness/activities
   ▼
Convex: harnessActivities (queued) + evento activity.assigned
   ▲
   │  claimNextHarnessActivity (atómico)          worker real (Node)
   │  heartbeat pingConnection                    script/harness-worker.mjs
   │  activity.started → adaptador → activity.completed/failed/blocked
   └──────────────────────────────────────────────┘
```

- El **Dashboard no lanza procesos**: encola, muestra el estado y los resultados.
- El **worker** es un proceso aparte. Si no está corriendo, la actividad queda
  `queued`; la UI lo dice explícitamente.
- Un estado solo pasa a `completed` cuando el worker terminó y guardó el
  resultado. Si falta un recurso, se marca `blocked` o `failed` con el motivo.
- No se guardan secretos en Convex ni en los eventos.

## 1. Actividades disponibles

| Arnés | Actividad | Qué ejecuta de verdad |
|---|---|---|
| Prospección | `github_discovery` | Búsquedas en la API pública de GitHub, verificación HTTP del perfil, gate de ≥3 repos y señales de agentes/MCP/automatización. Devuelve top 5 con cita y URL de evidencia. |
| B2B | `account_qualification` | HTTP real a cada dominio/URL, extracción de title, description, stack, CTAs y contacto; score de encaje 0–10. |
| Marketing | `site_audit` | Descarga de una página pública, auditoría de title/meta/H1/H2/CTAs/Open Graph/palabras clave; hallazgos con recomendación. |
| Soporte | `incident_triage` | Lee `orchestratorEvents` y `harnessActivities` reales del tenant; agrupa errores/actividades fallidas y propone el siguiente paso. No inventa tickets. |

El catálogo vive en `convex/lib/harnessActivities.ts` y lo comparten la UI, la
API y Convex. Una actividad solo se agrega ahí si existe un adaptador real en
`script/harness-adapters.mjs`.

## 2. Asignar desde el Dashboard

1. Abre `/agents/swarmy` (también está el acceso **Runs** en el menú).
2. Elige uno de los cuatro arneses.
3. Completa el formulario (por ejemplo, dominios para B2B o URL para marketing).
4. Pulsa **Asignar actividad**. Se crea un `runId` y la actividad queda `queued`.
5. La pantalla navega al run: verás la actividad, sus eventos y el resultado en
   cuanto el worker la procese.

Campos obligatorios: B2B necesita al menos un dominio/URL; marketing usa
`https://avril.systems` por defecto; prospección y soporte tienen valores por
defecto razonables.

## 3. Ejecutar (worker real)

```bash
# Escucha continua de los cuatro arneses
npm run harness:worker

# Procesa lo que haya en cola y termina (útil para demos/CI manual)
npm run harness:worker:once

# Solo uno o varios arneses
node script/harness-worker.mjs --once --harness=marketing,b2b

# Sube el límite anónimo de GitHub (no se guarda en el repo)
GITHUB_TOKEN=... npm run harness:worker:once -- --harness=prospecting
```

El worker hace heartbeat cada 15 s con `executing: true/false`. En el panel
**Harnesses** del run se ve `Conectado / Ejecutando / Stale`; sin worker, `Stale`.

### Variables

| Variable | Uso |
|---|---|
| `CONVEX_URL` o `NEXT_PUBLIC_CONVEX_URL` | Deployment de Convex. |
| `CONVEX_SERVER_SECRET` | Secreto servidor-servidor; solo en el proceso del worker/API. |
| `SWARMY_TENANT_ID` | Tenant de la cola (dev/local: `AVRIL_STAGING_TENANT`). |
| `SWARMY_WORKSPACE_ID` | Workspace que se guarda en los eventos (`ws_staging_01`). |
| `GITHUB_TOKEN` | Opcional; sube el límite de prospección de 60 a 5,000 req/h. |

`npm run harness:worker` carga `.env.local` si existe. Nunca subas valores de
secretos al repo ni a capturas.

## 4. Contrato en Convex

- Tabla `harnessActivities`: `activityId`, `runId`, `harnessType`, `activity`,
  `title`, `input`, `status`, `result`, `error`, tiempos y `createdBy`.
- Mutaciones: `assignHarnessActivity`, `claimNextHarnessActivity`,
  `completeHarnessActivity`.
- Consultas: `listHarnessActivities`, `getHarnessActivity`.
- Eventos: `activity.assigned`, `activity.started`, `activity.completed`,
  `activity.failed`, `activity.blocked` (+ `prospecto.verificado` del top 5).
- El claim es atómico: dos workers no ejecutan la misma actividad.

El resultado completo se guarda en la tabla; los eventos llevan solo el
`summary` para no inflar el timeline. El detalle del run pide `includeResult=true`.

## 5. Evidencia de ejecución real (entorno dev)

Fecha: 2026-11-25. Deployment dev del proyecto (`academic-chinchilla-476`, team
avril / project app-avril-life), tenant `AVRIL_STAGING_TENANT`,
workspace `ws_staging_01`. **No se tocó staging ni producción.**

| Arnés | runId | Resultado real |
|---|---|---|
| B2B | `run_b2b_mwwqynuc_yggyv4` | 2 objetivos, 2 accesibles, 1 calificado, score promedio 4.5. HTTP 200 real a `avril.systems` y `vercel.com`. |
| Marketing | `run_marketing_mwwqyvng_xyqalf` | HTTP 200; title/meta reales; 5 hallazgos (incluye 0 CTAs detectados), score 61. |
| Soporte | `run_support_mwwqzubt_0uvpve` | 22 eventos escaneados; 1 actividad fallida agrupada; `latestAt` real. El primer intento (`run_support_mwwqyvqp_uyivst`) falló honestamente por un bug de `anyApi`; se corrigió y se reintentó. |
| Prospección | `run_prospecting_mwwrb1fi_1npixg` | 8 descubiertos, 8 verificados, 5 priorizados (top 5), 17 llamadas a GitHub, 4,877 de rate limit restante; 5 eventos `prospecto.verificado` con cita y URL de evidencia. Los 8 verificados quedan en el resultado, no solo el top 5. |

Comprobaciones:

```bash
npm run typecheck
npm run swarmy:check   # 59 tests: cadena, badges, runs + actividades
```

## 6. Límites conocidos

- El worker no se auto-arranca desde el navegador (por diseño). Si no está
  activo, las actividades quedan en cola y así se muestra.
- Prospección depende de la API de GitHub. Sin `GITHUB_TOKEN` se limita a 2
  búsquedas y 8 candidatos; si GitHub limita, la actividad se marca `blocked`
  con el motivo (no se inventan prospectos).
- B2B y marketing solo leen sitios públicos; no siguen enlaces internos, no
  autentican y rechazan hosts privados/localhost.
- Soporte solo ve datos del tenant configurado; no accede a otros tenants.
- No se implementó cancelación de una actividad `running` (requiere que el
  worker coopere). Si el worker muere a mitad de una actividad, esta queda
  `running`; se corrige reiniciando el worker o asignando la actividad de nuevo.
  Para reintentar una fallida, se asigna de nuevo.
- La UI usa el mismo fallback legacy `NEXT_PUBLIC_DASHBOARD_APP_TOKEN` que
  Agent Office para funcionar en dev/demo sin sesión de wallet. En producción
  debe preferirse la sesión y rotar/retirar ese token público (hallazgo ya
  documentado en `SWARMY_DASHBOARD_S00.md`).
