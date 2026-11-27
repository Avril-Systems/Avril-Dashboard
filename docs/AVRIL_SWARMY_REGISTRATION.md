# Registro reproducible — Avril · Swarmy

Manifiesto de los cinco agentes de la sesión dedicada. El registro es idempotente:
inserta/actualiza por `agentKey` y **no borra** agentes legacy ni agentes ajenos.

## Manifiesto

| agentKey | Nombre | Rol | Meta |
|---|---|---|---|
| `swarm-strategy` | Orquestador | `orchestrator` | `{ orchestrator: true }` |
| `support` | Soporte | `support` | `{ harnessType: "support" }` |
| `b2b` | B2B | `b2b` | `{ harnessType: "b2b" }` |
| `prospecting` | Prospección | `prospecting` | `{ harnessType: "prospecting" }` |
| `marketing` | Marketing | `marketing` | `{ harnessType: "marketing" }` |

Script: `script/register-swarmy-agents.mjs` · alias `npm run swarmy:register`.
No crea intenciones, no habilita metacognición, no arranca el worker y no escribe en
producción por sí solo.

## Dev — sesión ya creada

```text
Session: m97277rgqhezjj37a16w7rr6gd8k1m0c
Chat:    jx7crmxx2r5aq6d5bzxa36tt6s8k0w7c
Org:     md74cex8bajvg36mj1att3hr218bd7tr
Company: Avril · Swarmy
```

```bash
npm run swarmy:register -- \
  --session-id=m97277rgqhezjj37a16w7rr6gd8k1m0c \
  --dry-run

npm run swarmy:register -- \
  --session-id=m97277rgqhezjj37a16w7rr6gd8k1m0c
```

## Producción — preparado, no ejecutado

El script usa `CONVEX_URL`/`NEXT_PUBLIC_CONVEX_URL` y `CONVEX_SERVER_SECRET` del
entorno. Si defines `CONVEX_URL`, **no** carga `.env.local`; así se evita apuntar a dev
por accidente. Imprime el host de Convex para verificar el deployment.

### Crear sesión nueva

Requiere el `organizationId` de producción; el script no crea organizaciones.

```bash
CONVEX_URL=https://outstanding-swordfish-684.convex.cloud \
CONVEX_SERVER_SECRET=... \
npm run swarmy:register -- \
  --create-session \
  --organization-id=<prodOrganizationId> \
  --company-name="Avril · Swarmy" \
  --dry-run
```

Quitar `--dry-run` para crear el chat/sesión y registrar los cinco agentes. Si ya existe
una sesión con ese `companyName` en la organización, la reutiliza en vez de duplicarla.

### Sesión existente

```bash
CONVEX_URL=https://outstanding-swordfish-684.convex.cloud \
CONVEX_SERVER_SECRET=... \
npm run swarmy:register -- \
  --session-id=<prodSessionId> \
  --dry-run
```

Quitar `--dry-run` para aplicar. El script reporta los cinco agentes resultantes.

## Verificación esperada

```text
Agentes (5):
- b2b · B2B · rol=b2b · meta={"harnessType":"b2b"}
- marketing · Marketing · rol=marketing · meta={"harnessType":"marketing"}
- prospecting · Prospección · rol=prospecting · meta={"harnessType":"prospecting"}
- support · Soporte · rol=support · meta={"harnessType":"support"}
- swarm-strategy · Orquestador · rol=orchestrator · meta={"orchestrator":true}
```

En dev se validó el registro y una conversación con `swarm-strategy` (200). No se
ejecutó contra producción.
