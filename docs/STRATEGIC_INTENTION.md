# Intención estratégica (punto 5)

## Qué es (y qué no)

La **intención estratégica** es el rumbo en texto breve que el usuario define con el
orquestador. No es una orden de ejecución ni un planner: los arneses deciden **cómo** cumplirla
con sus herramientas. La **detección de comandos por regex fue retirada**: el LLM interpreta y
elige tools con el protocolo existente.

## Persistencia

Tabla `intentions` (Convex), por sesión:

| Campo | Uso |
|---|---|
| `sessionId`, `organizationId` | Dueño de la intención. |
| `scope` | `strategic` (una por sesión) o `harness` (una por arnés). |
| `harnessType` | Arnés cuando aplica. |
| `body` | Texto breve (≤600 caracteres). |
| `source`, `updatedBy` | `user` / `orchestrator` / `harness` + autor. |
| `createdAt`, `updatedAt` | Trazabilidad. |

Se releen en **cada turno** desde Convex: sobreviven a recargar, a nuevas conversaciones y a
cambiar de modelo. Una sesión nueva (otra empresa) empieza sin intención.

## Herramientas

| Agente | Tool | Efecto |
|---|---|---|
| Orquestador | `get_intentions` | Lee general + particulares. |
| Orquestador | `set_strategy({ strategic, harnessIntentions[] })` | Define/actualiza la general y deriva las particulares en una sola llamada. |
| Orquestador | `set_harness_intention({ harnessType, body })` | Intervención directa sobre una particular. |
| Arnés | `get_my_intention` | Lee la general + su particular. |
| Arnés | `set_my_intention({ body })` | **Propone** cambiar su particular; requiere confirmación del operador. |

Las tools del orquestador (`set_strategy`, `set_harness_intention`) son **escrituras directas**
(`direct: true`): el usuario define la estrategia por conversación. `set_my_intention` de un
arnés **no** es directa: crea una propuesta persistida que el operador debe confirmar; el arnés
no puede aprobarla unilateralmente. Las acciones (`assign_activity`, `request_control`) siguen
pasando por propuesta + confirmación (punto 2).

## Prompt y vigencia

El system prompt incluye la intención general y (según el agente) su particular o todas las
particulares. Como el modelo tendía a copiar versiones antiguas del historial, se añade un
**recordatorio de intenciones vigentes como mensaje de usuario justo antes de la pregunta**:
“Esta es la versión vigente; prevalece sobre el historial”. Con eso la respuesta usa la versión
persistida, no la vieja.

## Evidencia (dev, sin mocks)

| Prueba | Resultado |
|---|---|
| Orquestador define la estrategia | `set_strategy` directo con general + 4 particulares; `ok`. |
| Persistencia | `GET /api/orchestration/intentions?sessionId=…` devuelve general y 4 particulares. |
| Arnés conoce su intención | B2B respondió su particular desde su propio chat. |
| Intervención directa | El orquestador cambió marketing con `set_harness_intention`; marketing leyó la nueva. |
| El arnés propone la suya | Marketing emitió `set_my_intention`: `requiresConfirmation: true`; la intención no cambió. |
| El operador aprueba | Tras confirmar la propuesta, la nueva intención de marketing quedó persistida. |
| Cambio de modelo | B2B respondió su intención con `model:"venice"` (proveedor Venice) y con el genérico. |
| Vigencia vs historial | El orquestador respondió la versión vigente de marketing (3 piezas), no la vieja del historial. |

`typecheck` limpio, `agents:check` 38/38, lint solo warnings preexistentes. Sin despliegue a
producción.

## Archivos

| Archivo | Cambio |
|---|---|
| `convex/schema.ts` | Tabla `intentions` + índices. |
| `convex/serverIntentions.ts` | Lectura, estrategia (general + particulares) y particular. |
| `src/lib/convexServer.ts` | Wrappers. |
| `src/modules/agents/toolCatalog.ts` | Tools de intención y scoping por agente. |
| `src/modules/agents/toolProtocol.ts` | Descripciones/guía de intención. |
| `src/modules/agents/executeAgentTool.ts` | Lectura/escritura directa de intenciones. |
| `src/modules/agents/buildAgentSystemPrompt.ts` | Intenciones en prompt + recordatorio de vigencia. |
| `app/api/chat/respond/route.ts` | Carga intenciones por turno, escrituras directas, sin router regex. |
| `app/api/orchestration/intentions/route.ts` | Consulta HTTP (solo lectura). |
| `src/modules/agents/intent.ts` | **Eliminado** (router por regex). |
| `script/agent-intent-check.mjs` | **Eliminado**; tests de intención en el catálogo/protocolo. |

## Límites

- Alcance por sesión: una empresa/sesión nueva no hereda la intención.
- Para derivar particulares, la sesión debe tener agentes de esos arneses.
- Texto máximo 600 caracteres; es rumbo, no una tarea cerrada.
- Sin planners rígidos, exigencias de evidencia, experimentos obligatorios ni ciclos de
  autocorrección.
- No se desplegó a producción.


## Seguridad de identidad

- Solo el orquestador explícito (`role=orchestrator`, `meta.orchestrator` o `swarm-strategy`) y los
  arneses registrados están autorizados. Un `agentKey` desconocido se rechaza con
  `AGENT_NOT_AUTHORIZED`; no hereda la persona ni las tools del orquestador.
- La confirmación de la propuesta de intención de un arnés requiere el endpoint de confirmación
  del operador (token/sesión autorizada); el turno del arnés no puede confirmarla.
