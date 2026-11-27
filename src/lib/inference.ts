/**
 * Proveedor de inferencia genérico, compatible con la API de OpenAI
 * (`POST {baseUrl}/chat/completions`).
 *
 * Configuración por entorno (solo servidor):
 *   INFERENCE_BASE_URL   p. ej. https://api.openai.com/v1  (o .../v1/chat/completions)
 *   INFERENCE_API_KEY    Bearer token
 *   INFERENCE_MODEL      Model ID (p. ej. gpt-4o-mini, nvidia/..., venice-uncensored)
 *   INFERENCE_TEMPERATURE opcional (default 0.45)
 *   INFERENCE_TIMEOUT_MS  opcional (default 60000)
 *
 * Venice y OpenClaw/bridge son opcionales: se usan solo si el caller los pide
 * explícitamente o si no hay proveedor genérico configurado.
 */

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type InferenceConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type InferenceConfigResult =
  | { ok: true; config: InferenceConfig }
  | { ok: false; missing: string[] };

export type InferenceResult =
  | { ok: true; text: string }
  | {
      ok: false;
      code: 'INFERENCE_TIMEOUT' | 'INFERENCE_ERROR';
      message: string;
      retryable: boolean;
    };

export function readInferenceConfig(): InferenceConfigResult {
  const baseUrl = process.env.INFERENCE_BASE_URL?.trim() ?? '';
  const apiKey = process.env.INFERENCE_API_KEY?.trim() ?? '';
  const model = process.env.INFERENCE_MODEL?.trim() ?? '';

  const missing: string[] = [];
  if (!baseUrl) missing.push('INFERENCE_BASE_URL');
  if (!apiKey) missing.push('INFERENCE_API_KEY');
  if (!model) missing.push('INFERENCE_MODEL');
  if (missing.length > 0) return { ok: false, missing };

  return { ok: true, config: { baseUrl, apiKey, model } };
}

export function hasInferenceConfig(): boolean {
  return readInferenceConfig().ok;
}

/** Acepta base `https://host/v1` y también la URL completa de chat completions. */
export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

export function inferenceTemperature(): number {
  const raw = Number(process.env.INFERENCE_TEMPERATURE ?? '0.45');
  if (!Number.isFinite(raw)) return 0.45;
  return Math.min(2, Math.max(0, raw));
}

function inferenceTimeoutMs(): number {
  const raw = Number(process.env.INFERENCE_TIMEOUT_MS ?? '60000');
  if (!Number.isFinite(raw) || raw < 1000) return 60000;
  return Math.min(180000, Math.trunc(raw));
}

function extractText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const record = data as Record<string, unknown>;
  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const message = (choices[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (typeof content === 'string' && content.trim()) return content.trim();
    if (Array.isArray(content)) {
      const joined = content
        .map((part) =>
          part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string'
            ? String((part as Record<string, unknown>).text)
            : '',
        )
        .join('')
        .trim();
      if (joined) return joined;
    }
  }
  for (const key of ['reply', 'text', 'message'] as const) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export async function callOpenAICompatible(input: {
  config: InferenceConfig;
  messages: ChatMessage[];
  temperature?: number;
}): Promise<InferenceResult> {
  const timeoutMs = inferenceTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(chatCompletionsUrl(input.config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.config.apiKey}`,
      },
      body: JSON.stringify({
        model: input.config.model,
        messages: input.messages,
        temperature: input.temperature ?? inferenceTemperature(),
      }),
      cache: 'no-store',
      signal: controller.signal,
    });

    const rawBody = await res.text().catch(() => '');
    if (!res.ok) {
      return {
        ok: false,
        code: 'INFERENCE_ERROR',
        message: `Inference respondió ${res.status}${rawBody ? `: ${rawBody.slice(0, 180)}` : ''}`,
        retryable: res.status >= 500 || res.status === 429,
      };
    }

    let data: unknown = null;
    try {
      data = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return {
        ok: false,
        code: 'INFERENCE_ERROR',
        message: 'Inference devolvió un cuerpo que no es JSON.',
        retryable: true,
      };
    }

    const text = extractText(data);
    if (text) return { ok: true, text };

    return {
      ok: false,
      code: 'INFERENCE_ERROR',
      message: 'Inference no devolvió texto de respuesta.',
      retryable: true,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      code: aborted ? 'INFERENCE_TIMEOUT' : 'INFERENCE_ERROR',
      message: aborted
        ? `Inference agotó el tiempo (${timeoutMs} ms).`
        : err instanceof Error
          ? err.message
          : 'Falló la llamada a inference.',
      retryable: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}
