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

## 1. Dos capas por arnés: original + adicional

Cada arnés conserva **su actividad original** (código vendorizado del estudiante
en `harness/original/`) y **la actividad adicional** que ya funcionaba en el
Dashboard. La UI permite elegir cuál ejecutar; ninguna reemplaza a la otra.

| Arnés | Actividad | Tipo | Qué ejecuta de verdad |
|---|---|---|---|
| Prospección | `github_discovery_original` | original | Prototipo de Alejandro: 7 búsquedas, gate HTTP, ≥3 repos, log de rechazos, `raw_candidates`, verificados, top 5 e histórico. |
| Prospección | `github_discovery` | adicional | Descubrimiento rápido del Dashboard: GitHub API, gate y todos los verificados con top 5 marcado. |
| B2B | `b2b_intake_original` | original | Arnés de Valeria: solicitudes → clasificación → faltantes → preguntas → borrador sin enviar → CRM JSON/CSV. |
| B2B | `account_qualification` | adicional | HTTP real a dominios/URLs, señales técnicas y score de cuenta 0–10. |
| Marketing | `marketing_campaign` | original | Arnés de Iván: briefing → investigación web → copy → fact-check → materiales Markdown + reporte. No publica. |
| Marketing | `site_audit` | adicional | Auditoría de una página pública (title/meta/H1/H2/CTAs/Open Graph). |
| Soporte | `support_ticket_triage` | original | Arnés de Kevin: `SupportTicketRecord` → clasificación, redacción de secretos/PII, escalamiento, dev handoff y borrador FAQ. |
| Soporte | `incident_triage` | adicional | Triaje de errores/actividades fallidas del tenant Swarmy. |

El catálogo vive en `convex/lib/harnessActivities.ts` y lo comparten la UI, la
API y Convex. Una actividad solo se agrega ahí si existe un ejecutor real en
`script/harness-activity-adapters.mjs`.

## 2. Código original vendorizado

| Arnés | Repo | Commit | Ejecución |
|---|---|---|---|
| Prospección | [alevarlaz65-afk/agente-de-proespectos-prototipo-corregido](https://github.com/alevarlaz65-afk/agente-de-proespectos-prototipo-corregido) | `966fd63` | `python prototipo.py` |
| B2B | [valrami-hue/arnes-b2b-avril](https://github.com/valrami-hue/arnes-b2b-avril) | `8854d61` | `python run.py` (reglas; modelo opcional) |
| Soporte | [Kevin-vk1614/avril-support-harness](https://github.com/Kevin-vk1614/avril-support-harness) | `c6843c8` | `node src/cli.js -` |
| Marketing | [ivancontreras-m/Asistente](https://github.com/ivancontreras-m/Asistente) | `6805fcc` | `python agente.py --marketing briefing.json` |

Cada subcarpeta de `harness/original/` incluye un `SOURCE.md` con autor, commit,
archivos excluidos (videos, `usuarios.db`, `.env`, salidas) y cualquier cambio
mínimo de integración. El único cambio de código es el timeout de red del
cliente OpenAI del arnés de marketing para que un proveedor lento no bloquee el
worker; su lógica y su fallback de modelos siguen intactos.

## 3. Preparación del entorno

El worker usa Python para prospección, B2B y marketing, y Node para soporte.

```bash
# Una vez: intérprete con dependencias del arnés de marketing
npm run harness:python:setup
# Equivalente manual:
# python3.11 -m venv .harness-venv
# .harness-venv/bin/pip install -r harness/original/marketing/requirements.txt

# Comprobación rápida (opcional)
.harness-venv/bin/python -c "import openai, ddgs, fastapi, pydantic; print('python ok')"
node -v   # >= 18
```

El worker elige el intérprete en este orden: `HARNESS_PYTHON`, `.harness-venv/bin/python`,
`python3`. Si el intérprete no tiene las dependencias, la actividad de marketing
queda `blocked` con el motivo; no se inventa contenido.

### Variables (solo nombres; los valores van en `.env.local` o en el entorno)

| Variable | Uso |
|---|---|
| `CONVEX_URL` o `NEXT_PUBLIC_CONVEX_URL` | Deployment de Convex. |
| `CONVEX_SERVER_SECRET` | Secreto servidor-servidor; solo en el proceso del worker/API. |
| `SWARMY_TENANT_ID` | Tenant de la cola (dev/local: `AVRIL_STAGING_TENANT`). |
| `SWARMY_WORKSPACE_ID` | Workspace que se guarda en los eventos (`ws_staging_01`). |
| `GITHUB_TOKEN` | Opcional; sube el límite de prospección. |
| `NVIDIA_API_KEY` | **Requerida** por el arnés de marketing original (NVIDIA NIM). |
| `BRAVE_API_KEY` | Opcional; si falta, marketing usa DDGS. |
| `MODELO_LLM` | Opcional; modelo de marketing. Se recomienda `nvidia/nemotron-3.5-lightning-30b-a3b` para demos rápidas; el default original es `nvidia/nemotron-3-ultra-550b-a55b`. |
| `ANTHROPIC_API_KEY` | Opcional; solo para B2B en modo `modelo`. El modo `reglas` no la necesita. |
| `HARNESS_PYTHON` | Opcional; ruta al intérprete con dependencias. |

`npm run harness:worker` carga `.env.local` si existe. Nunca subas valores de
secretos al repo ni a capturas. El input de una actividad **nunca** acepta API
keys: solo el entorno del worker las lee.

## 4. Asignar desde el Dashboard

1. Abre `/agents/swarmy` (también está el acceso **Runs** en el menú).
2. Elige uno de los cuatro arneses.
3. Elige la actividad: **ORIGINAL** (código del estudiante) o **ADICIONAL**.
4. Completa el formulario y pulsa **Asignar actividad**. Se crea un `runId` y la
   actividad queda `queued`.
5. La pantalla navega al run: verás la actividad, sus eventos y el resultado en
   cuanto el worker la procese.

Campos por actividad:

- **B2B original:** solicitudes JSON (vacío = 10 solicitudes originales), sector
  JSON opcional y modo `reglas`/`modelo`.
- **Soporte original:** un `SupportTicketRecord` o arreglo JSON. El formulario
  trae un ticket sintético de ejemplo.
- **Marketing original:** briefing JSON opcional (vacío = `briefing_ejemplo.json`
  de 3 piezas) y modelo LLM opcional.
- **Prospección original:** sin parámetros; usa la configuración original.
- Las actividades adicionales mantienen sus campos actuales (URLs, consultas,
  ventana de incidentes, etc.).

## 5. Ejecutar (worker real)

```bash
# Escucha continua de los cuatro arneses
npm run harness:worker

# Procesa lo que haya en cola y termina (útil para demos/CI manual)
npm run harness:worker:once

# Solo uno o varios arneses
node script/harness-worker.mjs --once --harness=marketing,b2b

# Fuerza el intérprete con dependencias
HARNESS_PYTHON="$PWD/.harness-venv/bin/python" npm run harness:worker:once
```

El worker hace heartbeat cada 15 s con `executing: true/false`. En el panel
**Harnesses** del run se ve `Conectado / Ejecutando / Stale`; sin worker, `Stale`.

Duraciones observadas: B2B reglas < 1 s; soporte 1 ticket < 1 s; marketing 1
pieza ~30 s; prospección original ~2–3 min con `GITHUB_TOKEN`.

## 6. Contrato en Convex

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

## 7. Evidencia de ejecución real (entorno dev)

Fecha: 2026-11-25. Deployment dev del proyecto (`academic-chinchilla-476`, team
avril / project app-avril-life), tenant `AVRIL_STAGING_TENANT`,
workspace `ws_staging_01`. **No se tocó staging ni producción.**

| Arnés / actividad | runId | Resultado real |
|---|---|---|
| Prospección original | `run_prospecting_mwwsqhpx_uqttk6` | 68 descubiertos, 16 rechazados, 52 verificados, top 5; 149.7 s; histórico de 77 handles; 5 grupos de búsqueda. |
| B2B original (API) | `run_b2b_mwwsphi2_8gq3fe` | 10 solicitudes: 4 listas para validar, 4 con datos faltantes, 1 fuera de alcance, 1 duplicada; `draftsNotSent: true`. |
| B2B original (UI) | `run_b2b_mwwssmw0_ztma4q` | Asignada desde el formulario del Dashboard y ejecutada por el worker con el mismo resultado (10/4/4/1/1). |
| Soporte original | `run_support_mwwspamo_7dqn7g` | 1 ticket (`paid_not_ready`, severidad alta), escalado, `handoffSummary` y `devHandoff` generados; secretos/PII enmascarados por el arnés. |
| Marketing original | `run_marketing_mwwspn74_ox5mka` | 1 pieza completada, 29.4 s, 8,004 tokens, material Markdown + reporte; `requiresHumanReview: true`. Se usó `MODELO_LLM=nvidia/nemotron-3.5-lightning-30b-a3b`. |

Todas las actividades anteriores quedaron en estado `completed` y sus resultados se leyeron
desde `/api/orchestration/swarmy/run` (misma ruta que usa la consola). La actividad B2B
original de la fila UI se creó haciendo clic en **B2B → Captación B2B original → Asignar
actividad** en `/agents/swarmy`, no por API directa.

El arnés de marketing necesita `NVIDIA_API_KEY` en el entorno del worker; la llave no se
guardó en el repositorio ni en `harnessActivities`. Los arneses B2B/soporte/prospección no
usaron llaves de modelo (B2B en modo reglas; soporte sin red; prospección con `GITHUB_TOKEN`
del entorno).

Comprobaciones:

```bash
npm run typecheck
npm run swarmy:check   # 64 tests: cadena, badges, runs, catálogo/adaptadores y normalización
```

## 8. Límites conocidos

- El worker no se auto-arranca desde el navegador (por diseño). Si no está
  activo, las actividades quedan en cola y así se muestra.
- Prospección original recorre todas sus búsquedas y candidatos; tarda ~2–3 min
  y puede consumir rate limit. Sin `GITHUB_TOKEN` GitHub limita y la actividad
  se marca `blocked`/`failed` con el motivo.
- Marketing original requiere `NVIDIA_API_KEY` y red. El default 550B puede ser
  lento; usa `MODELO_LLM` con un modelo rápido para demos. El material queda
  **sin publicar** y requiere revisión humana.
- B2B original en modo `modelo` requiere `ANTHROPIC_API_KEY`; el modo `reglas`
  (default) no usa llaves.
- Soporte original procesa tickets individuales o arreglos; no escribe en Lab,
  no envía correos y enmascara secretos/PII.
- Las actividades adicionales siguen disponibles y no dependen de Python.
- No se implementó cancelación de una actividad `running` (requiere que el
  worker coopere). Si el worker muere a mitad de una actividad, esta queda
  `running`; se corrige reiniciando el worker o asignando la actividad de nuevo.
- La UI usa el mismo fallback legacy `NEXT_PUBLIC_DASHBOARD_APP_TOKEN` que
  Agent Office para funcionar en dev/demo sin sesión de wallet. En producción
  debe preferirse la sesión y rotar/retirar ese token público (hallazgo ya
  documentado en `SWARMY_DASHBOARD_S00.md`).
