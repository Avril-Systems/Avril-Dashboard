# S04 — Simplificar UI y retirar duplicidades confirmadas

Estado: aplicado en la rama `feat/swarmy-s00`. Nada de esto toca el flujo de negocio ni
borra datos; solo elimina código muerto, separa demo de operación y quita métricas inventadas.

## 1. Auditoría y decisiones

| Candidato | Evidencia | Decisión |
|---|---|---|
| `src/modules/agents/runStore.ts` | 0 referencias en todo el repo (solo se definía a sí mismo). | **Retirado**. Era un store en memoria que nunca se usó. |
| `components/ui/demo.tsx` | 0 referencias; solo envolvía `AnimatedAIChat`. | **Retirado**. |
| `script/swarmy-staging-worker.mjs` | No está en `package.json` ni en ningún flujo; emite eventos predefinidos de demo. | **Movido** a `script/demo/` + README que lo marca como no operativo. |
| `script/swarmy-mock-cycle.mjs` | Solo se usa manualmente; escribe `isMock:true`. | **Movido** a `script/demo/` (reservado para pruebas/demos). |
| Estadísticas del `FlowDashboard` (`4 agentes`, `2 aprobaciones`, `94% health`, `3 ingresos`) | Valores hardcodeados; no hay datos reales en ese punto del flujo. | **Retiradas** del componente y del copy (EN/ES). Ahora enlaza a Agent Office y Runs, que sí muestran datos reales. |
| Rama muerta `href === '/agents'` en `Sidebar.isNavActive` | Ningún ítem de navegación usa `/agents`. | **Retirada**. |
| `/agents` (tabla de workers por chat) | Solo se enlaza desde Profile; usa datos reales de la tabla `agents`. | **Se conserva** (no es duplicado de Office: worker 1:1 por chat vs agente de orquestación). |
| Dos controles: `/api/orchestration/control` (Agent Office, gateway OpenClaw WS) y `/api/orchestration/swarmy/control` (Runs, evento Swarmy) | Cada uno habla con un backend distinto; unificarlos requiere que el Engine sea el mismo. | **Se conservan**, pero Agent Office ahora tiene un enlace **Runs** en el header para que el operador sepa dónde está la observabilidad. |
| `agents` vs `orchestrationAgents` | `agents` = worker 1:1 por chat (tabla de chats/workers); `orchestrationAgents` = agentes de una sesión de orquestación (Office/Runs). | **Se conservan**; son conceptos distintos, no dos nombres de lo mismo. Documentado en S01. |
| Org (Convex de la app) vs tenant/workspace (Swarmy) | Son bases/alcances separados: la app usa `CONVEX_SERVER_SECRET` + org; Swarmy usa `SWARMY_TENANT_ID`/`WORKSPACE_ID`. | **Se conservan**. Unificarlos es un cambio de arquitectura, no una limpieza. |
| Dos carpetas de primitivas UI (`components/ui/*` y `src/components/ui/*`) | La primera es del design system/marketing; la segunda son primitivas del dashboard (`Badge`, `Button`, `Card`, `SectionTitle`). | **Diferido**: consolidar implicaría tocar casi toda la UI; no aporta al objetivo actual. |

## 2. Cambios de copy

`lib/landing-copy.ts` (EN/ES) ya no promete métricas:
- subtítulo: “Tu sesión está lista. Abre Agent Office… la ejecución real está en Runs.”
- CTA: “Open Agent Office” / “Abrir Agent Office”.
- nuevo enlace: “View runs (Swarmy)” / “Ver runs (Swarmy)”.
- se eliminó el bloque `dashboard.stats`.

## 3. Flujo operativo tras S04

```text
Operación real
  npm run harness:worker        (4 arneses, cola durable)
  npm run harness:worker:once

Demo / pruebas (NO operativo)
  script/demo/swarmy-mock-cycle.mjs     (runs MOCK, exige CONVEX_DEPLOYMENT dev:*)
  script/demo/swarmy-staging-worker.mjs (simulador de eventos de staging)
```

## 4. Verificación

- `npm run typecheck`: limpio.
- `npm run lint`: solo warnings preexistentes.
- `npm run agents:check`: 14/14.
- `grep` de referencias a los scripts movidos: solo el README de `script/demo` y la nota de S01.

## 5. Límites / siguiente

- La duplicidad de controles y de representaciones de agentes se **documenta** pero no se
  elimina: son dependencias reales de dos backends. Unificarlas es S05+ si se decide que el
  Engine sea el mismo en Office y Runs.
- S05 (intención) puede usar este mapa para decidir qué panel es la fuente de verdad.
