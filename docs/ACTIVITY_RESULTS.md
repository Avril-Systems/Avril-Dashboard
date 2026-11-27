# Punto 4 — Resultados reales de actividades, bajo demanda

## Problema

Los listados (`list_activities`, `run_overview`) devuelven estados compactos, pero no el
resultado completo. El orquestador no podía razonar sobre lo que encontró un arnés, y cada
arnés no podía interpretar su propio resultado. Cargar todos los `result` en el contexto sería
caro e innecesario.

## Solución

Nueva tool de lectura `get_activity_result({ activityId })`:

- Recupera **una** actividad persistida con su `result` completo usando la query existente
  `serverOrchestration.getHarnessActivity` (tenant del servidor).
- El orquestador puede consultar cualquier actividad de su tenant; un arnés solo las de su
  propio arnés (`scopeHarness` en el ejecutor).
- `list_activities` y `run_overview` siguen devolviendo filas compactas (sin `result`): la
  carga de JSON es explícita y bajo demanda.
- El resultado se limita a **16 000 caracteres** al pasarlo al modelo (con nota de truncado);
  el objeto completo sigue persistido en Convex para la UI/otros consumidores.

## Interpretación

Cuando la tool devuelve un resultado real, el route hace **una sola** continuación al modelo
con la pregunta actual + el resultado (sin historial viejo), para que lo interprete y proponga
el siguiente paso. No hay ciclos automáticos ni planners: si el modelo emite otro bloque de
tool en esa continuación, se elimina y se responde el texto.

Las lecturas de estado (`list_activities`, `harness_health`, `list_agents`, `run_overview`)
siguen siendo deterministas para no mezclar estados antiguos.

## Evidencia (dev, resultado real)

Actividad B2B `act_mwyqe2g9_0hbiqa` (`b2b_intake_original`, resultado de 13 687 caracteres).

| Caso | Resultado |
|---|---|
| Orquestador (`swarm-strategy`) pide el resultado | `toolCalls: [{ get_activity_result, ok: true }]`; respuesta interpretada: 10 solicitudes, 4 listas, 4 con datos faltantes, 1 duplicada, 1 fuera de alcance; sugiere `account_qualification`. |
| Arnés B2B consulta el suyo | `get_activity_result ok`; interpreta el mismo resultado desde su propio chat. |
| Marketing intenta leer el B2B | `ok: false` — “Solo puedes consultar resultados de tu propio arnés.”; sin fuga de datos. |

`meta` del turno declara la fuente `Swarmy · harnessActivities.result`.

`typecheck` limpio, `agents:check` **45/45**, lint solo warnings preexistentes.
Sin despliegue a producción.

## Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/agents/toolCatalog.ts` | Tool `get_activity_result` + incluida en arneses. |
| `src/modules/agents/executeAgentTool.ts` | Recuperación de una actividad con scope por arnés. |
| `src/lib/swarmyServer.ts` | `getHarnessActivityResult` (query existente). |
| `app/api/chat/respond/route.ts` | Una continuación al modelo para interpretar el resultado. |
| `src/modules/agents/toolProtocol.ts` | Regla de uso bajo demanda. |
| `src/modules/agents/turnMeta.ts` | Fuente del resultado. |
| `script/agent-tool-protocol-check.mjs`, `script/agent-meta-check.mjs` | Pruebas (45 total). |

## Límites

- Una actividad por turno; no hay carga masiva de resultados (deliberado).
- El resultado se trunca a 16k para el modelo; el completo queda en Convex.
- Sin planners rígidos, validaciones nuevas ni ciclos de corrección.
- No se desplegó a producción.
