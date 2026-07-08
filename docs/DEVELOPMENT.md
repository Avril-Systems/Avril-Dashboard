# Development

## Setup
1. Copy `.env.example` to `.env.local` and fill values.
2. Install deps: `npm install`
3. Start app: `npm run dev`

## Startup Agent Generator local flow

1. Configure root key source:
   - `PRISM_ROOT_PRIVATE_KEY`, or
   - `PRISM_ROOT_KEY_PATH` (`~/.config/prism/keys/root-wallet.json`)
2. Optional live hooks:
   - `PRISM_FACTORY_ADDRESS`
   - `PRISM_CONTEXT_ADDRESS`
   - `ENS_REGISTRY_ADDRESS`
   - `STARTUP_AGENT_REGISTER_8004=1`
3. Run:
   - `npm run startup-agent:generate -- "<startup>" "<roles-json>"`
   - or `./scripts/startup-agent-generator.sh "<startup>" "<roles-json>"`
4. Verify artifact:
   - `agent/startup_swarm_<startup>.json`
5. Open UI:
   - `/startup-agent-generator`
   - then confirm panel visibility in `/home`, `/agents`, `/chats`, `/wallets`, `/profile`

## Quality
- `npm run lint`
- `npm run typecheck`

## First vertical slice
- Login boundary (adapter)
- Create task (UI/API placeholder)
- Assign agent
- Start run and observe status
- Emit audit log event (next step in Convex mutations)
