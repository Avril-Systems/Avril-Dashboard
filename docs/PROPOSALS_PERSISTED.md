# Propuestas persistidas y confirmación de un solo uso (punto 2)

## Problema corregido

Antes, la “propuesta” vivía solo en el estado del componente y la confirmación enviaba
`tool + arguments` desde el cliente. Eso permitía:

- perder la propuesta al recargar,
- confirmar argumentos distintos a los propuestos,
- ejecutar dos veces la misma acción.

## Modelo

Tabla `agentToolProposals`:

| Campo | Uso |
|---|---|
| `chatId`, `sessionId`, `organizationId`, `agentKey` | Dueño de la propuesta (se derivan en servidor). |
| `tool`, `args`, `summary` | Acción propuesta. La confirmación **no** reenvía args. |
| `status` | `pending` → `executing` → `executed` / `failed`; también `cancelled`, `expired`. |
| `createdAt`, `expiresAt`, `claimedAt`, `finishedAt` | Trazabilidad y TTL (15 min). |
| `result`, `error` | Resultado real o motivo del fallo. |

## Flujo

```text
crear propuesta (intención o modelo)
  → createAgentToolProposalServer (valida chat agente, sesión, org, agente)
  → status=pending, expiresAt=+15 min
  → la API devuelve proposal.id

confirmar
  → claimAgentToolProposalServer: pending -> executing (mutación atómica)
  → si ya no está pending: 409 PROPOSAL_NOT_PENDING (no ejecuta)
  → executeConfirmedAgentTool (revalida args)
  → finishAgentToolProposalServer: executed | failed
  → se persiste “Confirmo: …” + resultado + meta + traza

cancelar
  → pending -> cancelled; confirmar después devuelve 409
```

## Aislamiento y permisos

Se reutiliza `requireDashboardToken` del endpoint (sin sistema nuevo). El claim verifica:

- `proposal.sessionId === sessionId` y `proposal.agentKey === agentKey` del request,
- que el chat sea `kind='agent'` y pertenezca a esa sesión,
- que la organización de la sesión coincida con la guardada en la propuesta,
- que el agente exista en `orchestrationAgents` de esa sesión.

Cualquier desajuste devuelve 403 `PROPOSAL_MISMATCH` y **no ejecuta**.
La UI hidrata propuestas pendientes desde `GET /api/orchestration/agent-chat` (sobreviven a
recargar) y confirma/cancela por `proposalId`.

## Evidencia de pruebas (dev)

| Prueba | Resultado |
|---|---|
| Crear propuesta por intención | `proposal.id` persistido; GET la lista como `pending`. |
| Confirmar una vez | `proposalStatus=executed`; actividades 21 → 22. |
| Confirmar de nuevo | **409 PROPOSAL_NOT_PENDING**; actividades siguen 22. |
| Confirmar con otro `agentKey` | **403 PROPOSAL_MISMATCH**; sin ejecución. |
| Confirmar con otra `sessionId` | **403 PROPOSAL_MISMATCH**; sin ejecución. |
| Cancelar y confirmar | cancel ok; confirm **409**; sin ejecución. |
| Confirmar sin auth | **401 UNAUTHORIZED**. |
| Estado final en Convex | 1 `executed`, 3 `cancelled`; 0 pendientes. |

`typecheck` limpio, `agents:check` 38/38, `lint` solo warnings preexistentes.
Sin despliegue a producción (solo Convex dev y rama local).
