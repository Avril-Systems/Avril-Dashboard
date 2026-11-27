# Proveedor de inferencia genérico (OpenAI-compatible)

El Dashboard ya no depende de Venice ni de OpenClaw para conversar. Cualquier API compatible
con OpenAI sirve como proveedor principal.

## Configuración (solo servidor)

| Variable | Ejemplo | Uso |
|---|---|---|
| `INFERENCE_BASE_URL` | `https://api.openai.com/v1` | Base; si no termina en `/chat/completions`, se añade. |
| `INFERENCE_API_KEY` | `sk-…` | Se envía como `Authorization: Bearer …`. |
| `INFERENCE_MODEL` | `gpt-4o-mini` | Model ID del proveedor. |
| `INFERENCE_TEMPERATURE` | `0.45` | Opcional. |
| `INFERENCE_TIMEOUT_MS` | `60000` | Opcional. |

Ejemplos de base URL:

- OpenAI: `https://api.openai.com/v1`
- NVIDIA NIM: `https://integrate.api.nvidia.com/v1`
- Venice (compatible): `https://api.venice.ai/api/v1`
- Cualquier gateway propio que exponga `POST /v1/chat/completions`.

## Selección de proveedor

`/api/chat/respond` resuelve el proveedor por el campo `model`:

| `model` | Proveedor |
|---|---|
| `auto` (default) / ausente | Genérico si `INFERENCE_*` está configurado; si no, Venice; si no, bridge. |
| `openai` | Genérico (error claro si falta configuración). |
| `venice` | Venice (opcional). |
| `codex` / `opus` | Bridge OpenClaw (opcional). |
| `mock` | Solo dev, solo modo agente, marcado como MOCK. |

La respuesta incluye `provider` para saber qué se usó. Si falta configuración, el error es
`INFERENCE_CONFIG_MISSING` con los nombres de las variables faltantes; no se inventa respuesta.

## UI

En el chat del agente, el selector incluye **Auto**, **OpenAI-compatible**, Venice, Codex, Opus
y Mock (solo dev). Auto es el default.

Venice y OpenClaw siguen disponibles; ya no son requisito.
