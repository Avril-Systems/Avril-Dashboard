# Punto 3 — Cada arnés usa sus herramientas y ejecuta por conversación

## Diseño

Cada agente de arnés (`support`, `b2b`, `prospecting`, `marketing`) recibe **solo sus tools**:

| Arnés | Tools |
|---|---|
| soporte | `list_activities` + `assign_activity` (scoped a `support`) |
| b2b | `list_activities` + `assign_activity` (scoped a `b2b`) |
| prospección | `list_activities` + `assign_activity` (scoped a `prospecting`) |
| marketing | `list_activities` + `assign_activity` (scoped a `marketing`) |
| orquestador | todas (sin cambios) |

El **LLM decide** qué tool usar: no hay rutas por comandos exactos ni regex para los arneses.
`detectIntent` (S05) queda restringido al orquestador. El modelo emite el bloque ```tool```,
el servidor lo valida y lo ejecuta/propone. Las acciones siguen el flujo de propuesta + confirmación
del punto 2.

## Contexto que recibe el LLM

Para un agente de arnés, el prompt incluye:

- su misión, capacidades y límites;
- **actividades asignables con clave exacta**, input obligatorio/opcional y defaults del catálogo;
- instrucciones de tools donde `harnessType` se oculta y se declara el alcance:
  “Alcance: solo tu arnés `X`. No puedes consultar ni asignar actividades de otros arneses.”

Ejemplo real (prospección): el modelo eligió `github_discovery` y mapeó correctamente
`queries` y `maxCandidates` tras exponer los input keys.

## Controles en servidor

- `toolsForAgent(harnessType)` filtra el catálogo por agente; el route rechaza tools no permitidas.
- `executeAgentTool` fuerza el arnés en `list_activities` y rechaza consultar otro.
- `executeConfirmedAgentTool` fuerza el arnés en `assign_activity` y revalida con
  `normalizeActivityInput` (la actividad debe pertenecer a ese arnés).
- Al crear la propuesta se inyecta `harnessType` del agente (auditoría y resumen correctos).
- Si el modelo propone una actividad de otro arnés, el route responde con un error de alcance y
  no crea propuesta.

## Correcciones necesarias encontradas al validar

- **Filtro por arnés**: `listHarnessActivities` filtraba por arnés después del `take`, así que un
  especialista podía ver 0 actividades. Se añadió el índice
  `harnessActivities.by_tenant_harness_createdAt` y la consulta lo usa cuando hay `harnessType`.
- **Args `null`**: el LLM enviaba `runId: null`; la validación lo trataba como inválido. Ahora
  `null` equivale a ausente.

## Validación (dev, sin mocks)

Sesión de prueba real `Harneses QA` (`m97fcrrfy4kahm7ydef8ez6cw58k07y1`) con cuatro agentes.
Inferencia real con el proveedor genérico (Venice, `qwen3-235b-a22b-instruct-2507`) y el worker
real de arneses.

| Arnés | Petición (resumen) | Propuesta del LLM | activityId | Estado |
|---|---|---|---|---|
| soporte | “Con eso, encola el triaje de incidentes de las últimas 24 horas” | `assign_activity` → `incident_triage` | `act_mwyqcmix_d9b5cm` | `completed`, con resultado |
| b2b | “Encarga la captación B2B original usando las solicitudes de ejemplo” | `assign_activity` → `b2b_intake_original`, input `{}` | `act_mwyqe2g9_0hbiqa` | `completed`, con resultado |
| prospección | “Encola el descubrimiento rápido… topic:mcp-server… máximo 5” | `assign_activity` → `github_discovery`, input `queries`/`maxCandidates` | `act_mwyqef0e_nxfa0h` | `completed`, con resultado |
| marketing | “Encola una auditoría de https://avril.systems” | `assign_activity` → `site_audit`, input `url` | `act_mwyqe2yv_bkkduc` | `completed`, con resultado |

Pruebas de alcance:

- soporte listó **10 actividades** propias (9 completed, 1 failed) con el índice nuevo.
- marketing, al pedir actividades de `support`, respondió que solo puede ver su arnés; el servidor
  además bloquea tools/actividades ajenas.
- El flujo de confirmación (punto 2) se reutiliza: propuesta persistida → confirmar → worker.

## Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/agents/toolCatalog.ts` | `toolsForAgent`, `isToolAllowedForAgent`, `harnessType` opcional. |
| `src/modules/agents/toolProtocol.ts` | Instrucciones scoped + regla acción→assign / estado→list. |
| `src/modules/agents/buildAgentSystemPrompt.ts` | Guía de actividades con claves e inputs del arnés. |
| `src/modules/agents/executeAgentTool.ts` | Scope forzado en lectura/escritura; `null` = ausente. |
| `app/api/chat/respond/route.ts` | Tools por agente, guard de alcance, intent solo orquestador, inyección de `harnessType`. |
| `convex/schema.ts` + `convex/serverOrchestration.ts` | Índice por arnés y consulta correcta. |
| `script/agent-tool-protocol-check.mjs` | 4 tests nuevos (42 total). |
| `docs/HARNESS_AGENT_TOOLS.md` | Este documento. |

## Límites

- El orquestador conserva el router determinista de S05; el LLM decide para los cuatro arneses.
- La calidad de la decisión depende del modelo configurado (`INFERENCE_*`); con modelos débiles
  puede elegir una lectura en vez de una acción. El prompt lo guía pero no lo fuerza.
- La sesión `Harneses QA` es dato de prueba en dev; no se desplegó nada a producción.
- No se reemplazaron arneses ni se añadieron capacidades nuevas: solo se expusieron sus
  actividades existentes.
