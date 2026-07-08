# Architecture Overview

## Decisions
- Monolith-first: Next.js app + Convex backend runtime.
- Human.tech integration via adapter boundary in `src/lib/humantech.ts`.
- RBAC enforced at action layer (`src/modules/auth/rbac.ts`).
- Wallet/account abstraction modeled explicitly (`wallets`, `walletPermissions`, `approvals`).
- Audit-first design via `auditLogs` entity.
- Startup identity orchestration uses a human-root model:
  - Root wallet controls delegate/context lifecycle
  - Per-role delegate EOA + Prism context policy constraints
  - ENS naming under `prism-protocol.eth`
  - Optional ERC-8004 registration compatibility
  - Artifact-first receipts in `agent/startup_swarm_<startup>.json`

## Trade-offs
- Faster MVP delivery over early microservices.
- In-memory demo run store now; migrate to Convex mutations in next phase.
- Human.tech adapter mocked until credentials and SDK are integrated.
- Startup generator supports deterministic simulation when live contract addresses are absent, prioritizing reproducibility and auditable output over implicit best-effort side effects.

## Wallet Communication Layer

- UI panel: `src/components/AgenticWalletLayerPanel.tsx`
- Artifact source API: `GET /api/startup-agent-generator/latest`
- Generator execution API: `POST /api/startup-agent-generator`
- Generator script: `script/startup-agent-generator.mjs`

This layer exposes cross-agent wallet communication and identity posture in operational surfaces (`Home`, `Agents`, `Chats`, `Wallets`, `Profile`, `Startup Agent Generator`).
