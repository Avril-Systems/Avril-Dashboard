# Repo merge — Phase 1 (marketing shell)

Survivor repo: **Avril-Dashboard**

## Route structure

| URL | Zone | Auth |
|-----|------|------|
| `/` | Marketing | Public |
| `/get-started` | Activation (luck flow) | Public |
| `/home`, `/chats`, `/agents`, … | App dashboard | WaaP required |

Route groups `(marketing)` and `(app)` control layout only — URLs stay flat (`/home`, not `/app/home`).

## Funnel (Option A)

1. `/` — marketing
2. `/get-started` — anonymous luck flow
3. Deploy → **Sign in** (WaaP + SIWE session) → **Payment** (mock plans)
4. Redirect → `/home?ideaId=…`
5. **TODO:** Stripe checkout when `CHECKOUT_MODE=stripe`

## Next steps

- [ ] Wire deploy button → WaaP login → `/api/founder/intake`
- [ ] Connect SIWE session (`/api/auth/nonce` + `/api/auth/session`) after WaaP login
- [ ] Port richer landing visuals (shaders, hero heatmap) incrementally
- [ ] Archive `agentslanding` repo after parity check
