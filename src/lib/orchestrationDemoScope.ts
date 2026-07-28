/**
 * DEMO SCOPE — orchestration / Agent Office
 *
 * Today all `orchestrationSessions` and chats live under the shared default Convex
 * organization. The office company switcher lists every session in that org so
 * hackathon demos work without per-user provisioning.
 *
 * PRODUCTION (TODO): filter sessions (and chats) by authenticated wallet user —
 * e.g. `founderWallet` / `founderUserId` on linked `founderIdeas`, or org
 * membership scoped to the signer. Until then, treat the office list as a shared
 * workspace, not private per-founder data.
 */
export const ORCHESTRATION_DEMO_SHARED_ORG = true;
