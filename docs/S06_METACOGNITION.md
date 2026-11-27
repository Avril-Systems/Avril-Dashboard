# S06 — Metacognición: el agente declara cómo lo sabe

Estado: implementado y verificado en local. Cierra la serie S01–S06.

## 1. Qué hace

Cada respuesta de agente lleva un bloque `meta` con:

| Campo | Contenido |
|---|---|
| `confidence` | `high` (hubo tool real ok), `medium` (sin tool), `low` (tool fallida o mock) |
| `sources` | fuentes reales consultadas (`Swarmy · harnessActivities`, `Convex · orchestrationAgents`, …) |
| `tools` | tools usadas y si fallaron |
| `intent` | intención detectada (S05), si aplica |
| `unknowns` | lo que no se sabe / no se ejecutó / falló |
| `generatedAt` | timestamp del turno |

Se persiste en `messages.meta` (Convex) y la UI lo muestra en un desplegable
**“Cómo lo sé · <confianza>”** bajo la respuesta: fuentes, herramientas y límites.

## 2. Reglas

- Si hubo una tool ok → `high` y se listan sus fuentes.
- Sin tool → `medium` + “No se consultó estado real en este turno”.
- Tool fallida → `low` + el error como límite.
- Propuesta de escritura → aviso “La acción no se ha ejecutado; requiere confirmación”.
- Mock (solo dev) → `low` + “Respuesta MOCK: no valida ningún backend real”.
- No es chain-of-thought: solo hechos verificables del turno.

El system prompt del agente también lo exige en texto:
- distinguir consultado vs inferido,
- no afirmar estado real sin tool,
- cerrar con `Fuente: …` cuando use tools,
- declarar fallos/faltantes.

## 3. Flujo

```text
POST /api/chat/respond (agente)
  → intención/tool/modelo
  → buildTurnMeta({ intent, tools, proposal, mock })
  → messages: { content, meta }
  → respuesta API: { reply, toolCalls?, intent?, meta }
  → UI: "Cómo lo sé"
```

## 4. Verificación (2026-11-27, dev)

- `¿Están conectados los arneses?` → `intent.kind=read`, `harness_health` ok,
  `meta.confidence="high"`, fuente `Swarmy · orchestratorConnections (heartbeats)`,
  `unknowns=[]`, y los 4 arneses `conectado`.
- `Asigna la actividad incident_triage al arnés support` → `requiresConfirmation: true`,
  `meta.confidence="medium"`, `unknowns=["La acción no se ha ejecutado; requiere confirmación del operador."]`.
- `GET /api/orchestration/agent-chat` devuelve los mensajes con `meta` persistida.
- `npm run agents:check`: **33/33** (protocolo 14 + intención 12 + meta 7).
- `typecheck` limpio; `lint` solo warnings preexistentes.

## 5. Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/agents/turnMeta.ts` | **Nuevo.** `buildTurnMeta` puro (fuentes/confianza/límites). |
| `convex/schema.ts` | `messages.meta` opcional. |
| `convex/serverChats.ts` | `sendAgentMessageServer` acepta `meta`. |
| `src/lib/convexServer.ts` | `sendAgentMessage({ meta })`. |
| `app/api/chat/respond/route.ts` | Construye y persiste `meta` en todas las rutas de agente; lo devuelve. |
| `src/modules/agents/buildAgentSystemPrompt.ts` | Reglas de metacognición en el prompt. |
| `src/components/office/OfficeAgentChat.tsx` | Desplegable “Cómo lo sé”. |
| `script/agent-meta-check.mjs` | **Nuevo.** 7 tests. |

## 6. Límites

- `meta` describe evidencia del turno; no expone razonamiento interno ni prompts.
- El chat del fundador (`/chats`) no usa `meta`: sigue el flujo arquitecto.
- Las lecturas deterministas no pasan por el modelo; su `meta` sale igualmente de la tool.
- Producción (`app.avril.life`) sigue pendiente de desplegar schema/funciones S01–S06 al Convex
  `outstanding-swordfish-684` y de mergear la rama a `main`.
