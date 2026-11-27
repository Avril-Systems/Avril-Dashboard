import { NextResponse } from 'next/server';
import { getClientIp, hitRateLimit, rejectLargePayload, requireDashboardToken } from '@/src/lib/apiSecurity';
import {
  getDefaultOrganizationId,
  getOrCreateAgentChat,
  listChats,
  listMessages,
  sendMessage,
  sendAgentMessage,
  upsertChatIgnitionDraft,
} from '@/src/lib/convexServer';
import { formatBridgeFetchError, resolveOpenClawBridgeUrl } from '@/src/lib/openclawBridgeEnv';
import {
  augmentUserMessageForModel,
  buildAvrilUnifiedSystemPrompt,
} from '@/src/modules/avril/buildAvrilSystemPrompt';
import {
  augmentAgentMessageForModel,
  buildAgentSystemPrompt,
} from '@/src/modules/agents/buildAgentSystemPrompt';
import { resolveAgentIdentity } from '@/src/modules/agents/agentPersonas';
import type { ResolvedAgentIdentity } from '@/src/modules/agents/agentPersonas';
import { parseAvrilAssistantReply } from '@/src/modules/avril/parseAvrilAssistantReply';
import { extractDraftFromArchitectPayload } from '@/src/modules/avril/extractDraftFromArchitectPayload';
import { isFolderAgentBriefMessage } from '@/src/lib/orchestrationSwarmGuardrails';

/** Max number of recent messages to send to the bridge as per-agent context. */
const BRIDGE_CONTEXT_LAST_N = 20;
/** When a chat has a stored summary, send only this many recent messages (summary covers the rest). */
const BRIDGE_CONTEXT_LAST_N_WHEN_SUMMARY = 10;
/** Max characters per message content when sending context (reduces token use). */
const BRIDGE_CONTEXT_MAX_CONTENT_CHARS = 600;
/** Suggested max total context size (chars) for the bridge; bridge may truncate further. */
const BRIDGE_CONTEXT_MAX_CHARS = 12_000;
/** Short chat turns (intake, commands). */
const MAX_CHAT_MESSAGE_CHARS = 4_000;
/** Folder-card “Agent brief” can be long markdown. */
const MAX_AGENT_BRIEF_CHARS = 56 * 1024;
const RESPOND_MAX_BODY_BYTES = 128 * 1024;

type RequestBody = {
  /** Architect mode: the founder chat. */
  chatId?: string;
  /** Agent mode: session + agentKey identify the 1:1 agent conversation (chatId is resolved server-side). */
  sessionId?: string;
  agentKey?: string;
  message: string;
  organizationId?: string;
  /** `mock` solo existe en modo agente y solo fuera de producción (pruebas de plumbing). */
  model?: 'codex' | 'opus' | 'venice' | 'mock';
};

type PromptMode = 'architect' | 'agent';

type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'BAD_REQUEST'
  | 'CONFIG_ERROR'
  | 'CHAT_NOT_FOUND'
  | 'AGENT_NOT_FOUND'
  | 'AGENT_CHAT_FAILED'
  | 'CONVEX_ERROR'
  | 'BRIDGE_TIMEOUT'
  | 'BRIDGE_ERROR'
  | 'VENICE_TIMEOUT'
  | 'VENICE_ERROR'
  | 'INTERNAL_ERROR';

type BridgeResult =
  | { ok: true; text: string; attempts: number }
  | { ok: false; code: 'BRIDGE_TIMEOUT' | 'BRIDGE_ERROR'; message: string; attempts: number; retryable: boolean };

function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  options?: { retryable?: boolean; details?: unknown }
) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        retryable: options?.retryable ?? false,
        ...(options?.details !== undefined ? { details: options.details } : {}),
      },
    },
    { status }
  );
}

type BridgeInput = {
  chatId: string;
  message: string;
  mode?: PromptMode;
  model?: 'codex' | 'opus' | 'venice';
  agentId?: string;
  area?: string;
  subArea?: string;
  summary?: string;
  messages?: Array<{ authorType: string; authorId: string; content: string; createdAt: string }>;
  maxContextChars?: number;
  /** System prompt: Avril architect (founder flow) or the targeted agent's persona. */
  systemPrompt?: string;
};

type VeniceResult =
  | { ok: true; text: string }
  | { ok: false; code: 'VENICE_TIMEOUT' | 'VENICE_ERROR'; message: string; retryable: boolean };

function augmentForMode(mode: PromptMode | undefined, message: string): string {
  return mode === 'agent' ? augmentAgentMessageForModel(message) : augmentUserMessageForModel(message);
}

/**
 * Respuesta de pruebas (solo dev, solo modo agente): valida identidad, hilo por
 * agente y persistencia sin llamar a Venice ni al bridge. Nunca se presenta como
 * respuesta real: el texto va marcado como MOCK.
 */
function buildMockAgentReply(
  identity: ResolvedAgentIdentity | null,
  message: string,
  historyCount: number
): string {
  const name = identity?.name ?? 'Agente';
  const key = identity?.agentKey ?? 'desconocido';
  const harness = identity?.persona.harnessType ?? 'sin arnés (orquestador)';
  return [
    '[MOCK · respuesta simulada, sin modelo real]',
    '',
    `Soy **${name}** (\`${key}\`). Arnés: ${harness}.`,
    `Mensaje recibido: “${message.slice(0, 500)}”`,
    `Mensajes previos en este hilo: ${historyCount}.`,
    '',
    'Esto valida identidad, hilo por agente y persistencia. No valida Venice ni el bridge.',
  ].join('\n');
}

function buildVeniceMessages(input: BridgeInput): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const base = input.systemPrompt?.trim() || buildAvrilUnifiedSystemPrompt();
  const meta = [input.area && `Primary area: ${input.area}.`, input.subArea && `Sub-area: ${input.subArea}.`]
    .filter(Boolean)
    .join(' ');
  const systemMain = meta ? `${base}\n\n${meta}` : base;

  const fromContext =
    input.messages?.map((msg) => ({
      role: msg.authorType === 'agent' ? ('assistant' as const) : ('user' as const),
      content: String(msg.content ?? ''),
    })) ?? [];

  return [
    { role: 'system', content: systemMain },
    ...(input.summary ? [{ role: 'system' as const, content: `Conversation summary: ${input.summary}` }] : []),
    ...fromContext,
    { role: 'user', content: augmentForMode(input.mode, input.message) },
  ];
}

async function callVeniceInference(input: BridgeInput): Promise<VeniceResult> {
  const veniceRaw = process.env.VENICE_INFERENCE_KEY ?? process.env.VENICE_ADMIN_KEY;
  const veniceUrl = process.env.VENICE_INFERENCE_URL || 'https://api.venice.ai/api/v1/chat/completions';
  const veniceModel = process.env.VENICE_MODEL || 'venice-uncensored';

  if (!veniceRaw) {
    return {
      ok: false,
      code: 'VENICE_ERROR',
      message: 'Venice is not configured. Missing VENICE_INFERENCE_KEY or VENICE_ADMIN_KEY.',
      retryable: false,
    };
  }

  const normalizedRaw = veniceRaw.trim().replace(/^Bearer\s+/i, '');
  const keyCandidates = Array.from(
    new Set(
      normalizedRaw.startsWith('VENICE_')
        ? [normalizedRaw]
        : [normalizedRaw, `VENICE_ADMIN_KEY_${normalizedRaw}`, `VENICE_ADMIN_KEY_W_${normalizedRaw}`],
    ),
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    let res: Response | null = null;
    let bodyText = '';
    for (const key of keyCandidates) {
      const candidateRes = await fetch(veniceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: veniceModel,
          messages: buildVeniceMessages(input),
          temperature: 0.45,
        }),
        cache: 'no-store',
        signal: controller.signal,
      });

      if (candidateRes.ok || candidateRes.status !== 401) {
        res = candidateRes;
        break;
      }

      bodyText = await candidateRes.text().catch(() => '');
      res = candidateRes;
    }

    if (!res) {
      return {
        ok: false,
        code: 'VENICE_ERROR',
        message: 'Venice request failed before a response was received.',
        retryable: true,
      };
    }

    if (!res.ok) {
      if (!bodyText) bodyText = await res.text().catch(() => '');
      return {
        ok: false,
        code: 'VENICE_ERROR',
        message: `Venice responded with ${res.status}${bodyText ? `: ${bodyText.slice(0, 180)}` : ''}`,
        retryable: res.status >= 500,
      };
    }

    const data: any = await res.json().catch(() => null);
    const text =
      data?.choices?.[0]?.message?.content ??
      data?.reply ??
      data?.text ??
      data?.message ??
      '';

    if (typeof text === 'string' && text.trim().length > 0) {
      return { ok: true, text: text.trim() };
    }

    return {
      ok: false,
      code: 'VENICE_ERROR',
      message: 'Venice returned no reply text.',
      retryable: true,
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      code: isAbort ? 'VENICE_TIMEOUT' : 'VENICE_ERROR',
      message: isAbort ? 'Venice request timed out after 60s.' : err instanceof Error ? err.message : 'Venice request failed.',
      retryable: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenClawBridge(input: BridgeInput): Promise<BridgeResult> {
  const bridgeUrl = resolveOpenClawBridgeUrl();
  const bridgeToken = process.env.OPENCLAW_BRIDGE_TOKEN;

  if (!bridgeUrl || !bridgeToken) {
    return {
      ok: false,
      code: 'BRIDGE_ERROR',
      message:
        'Bridge is not configured. Set OPENCLAW_BRIDGE_URL and OPENCLAW_BRIDGE_TOKEN (or for `next dev` only: OPENCLAW_BRIDGE_URL_DEV=http://127.0.0.1:8787/respond plus the same token).',
      attempts: 0,
      retryable: false,
    };
  }

  const maxAttempts = 2;
  let lastError: BridgeResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const res = await fetch(bridgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bridgeToken}`,
        },
        body: JSON.stringify({
          message: augmentForMode(input.mode, input.message),
          model: input.model ?? 'codex',
          source: 'avril-dashboard',
          chatId: input.chatId,
          systemPrompt: input.systemPrompt?.trim() || buildAvrilUnifiedSystemPrompt(),
          ...(input.agentId !== undefined && { agentId: input.agentId }),
          ...(input.area !== undefined && { area: input.area }),
          ...(input.subArea !== undefined && { subArea: input.subArea }),
          ...(input.summary !== undefined && input.summary.length > 0 && { summary: input.summary }),
          ...(input.messages !== undefined && input.messages.length > 0 && { messages: input.messages }),
          ...(input.maxContextChars !== undefined && { maxContextChars: input.maxContextChars }),
        }),
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        lastError = {
          ok: false,
          code: 'BRIDGE_ERROR',
          message: `Bridge responded with ${res.status}${bodyText ? `: ${bodyText.slice(0, 180)}` : ''}`,
          attempts: attempt,
          retryable: res.status >= 500,
        };
        continue;
      }

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        const text = (await res.text().catch(() => '')).trim();
        if (text.length > 0) {
          return { ok: true, text, attempts: attempt };
        }

        lastError = {
          ok: false,
          code: 'BRIDGE_ERROR',
          message: 'Bridge returned an unreadable response body.',
          attempts: attempt,
          retryable: true,
        };
        continue;
      }

      const text = data?.reply || data?.text || data?.message;
      if (typeof text === 'string' && text.trim().length > 0) {
        return { ok: true, text: text.trim(), attempts: attempt };
      }

      lastError = {
        ok: false,
        code: 'BRIDGE_ERROR',
        message: 'Bridge returned no reply text.',
        attempts: attempt,
        retryable: true,
      };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      lastError = {
        ok: false,
        code: isAbort ? 'BRIDGE_TIMEOUT' : 'BRIDGE_ERROR',
        message: isAbort
          ? 'Bridge request timed out after 60s.'
          : formatBridgeFetchError(err, bridgeUrl),
        attempts: attempt,
        retryable: true,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return (
    lastError || {
      ok: false,
      code: 'BRIDGE_ERROR',
      message: 'Bridge request failed with unknown error.',
      attempts: maxAttempts,
      retryable: true,
    }
  );
}

export async function POST(req: Request) {
  try {
    if (!requireDashboardToken(req)) {
      return errorResponse(401, 'UNAUTHORIZED', 'Unauthorized');
    }

    const ip = getClientIp(req);
    if (hitRateLimit(`respond:${ip}`, 30)) {
      return errorResponse(429, 'RATE_LIMITED', 'Rate limit exceeded', { retryable: true });
    }

    if (rejectLargePayload(req, RESPOND_MAX_BODY_BYTES)) {
      return errorResponse(413, 'PAYLOAD_TOO_LARGE', 'Payload too large');
    }

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid JSON body.');
    }

    const chatIdFromBody = body.chatId?.trim();
    const sessionId = body.sessionId?.trim();
    const agentKey = body.agentKey?.trim();
    const agentTarget = sessionId && agentKey ? { sessionId, agentKey } : null;
    const message = body.message?.trim();

    if ((!chatIdFromBody && !agentTarget) || !message) {
      return errorResponse(
        400,
        'BAD_REQUEST',
        'chatId, or sessionId + agentKey, and message are required.'
      );
    }

    if (message.length > MAX_AGENT_BRIEF_CHARS) {
      return errorResponse(400, 'BAD_REQUEST', `Message too long (max ${MAX_AGENT_BRIEF_CHARS} chars).`);
    }
    if (message.length > MAX_CHAT_MESSAGE_CHARS && !isFolderAgentBriefMessage(message)) {
      return errorResponse(
        400,
        'BAD_REQUEST',
        `Message too long for a normal turn (max ${MAX_CHAT_MESSAGE_CHARS} chars). Use the folder “Agent brief” flow or shorten the text.`
      );
    }

    /**
     * Dos modos sobre el mismo endpoint:
     *   - agent:     conversación 1:1 con un agente del Agent Office. El chat se resuelve
     *                en el servidor por (sessionId, agentKey); el cliente no puede elegirlo.
     *   - architect: flujo Avril de siempre (entrevista founder + ignition draft), sin cambios.
     */
    const mode: PromptMode = agentTarget ? 'agent' : 'architect';

    let chatId: string;
    let systemPrompt: string;
    let agentAuthorId: string | undefined;
    let agentId: string | undefined;
    let area: string | undefined;
    let subArea: string | undefined;
    let hasSummary = false;
    let summaryText: string | undefined;
    let agentIdentity: ResolvedAgentIdentity | null = null;

    if (agentTarget) {
      let resolved: Awaited<ReturnType<typeof getOrCreateAgentChat>>;
      try {
        resolved = await getOrCreateAgentChat(agentTarget);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        const notFound = /unknown agent/i.test(detail);
        return errorResponse(
          notFound ? 404 : 502,
          notFound ? 'AGENT_NOT_FOUND' : 'AGENT_CHAT_FAILED',
          notFound ? 'Unknown agent for this session.' : 'Failed to resolve the agent conversation.',
          { retryable: !notFound, details: detail }
        );
      }

      chatId = resolved.chatId;
      agentAuthorId = resolved.agent.agentKey;
      const identity = resolveAgentIdentity({
        agentKey: resolved.agent.agentKey,
        name: resolved.agent.name,
        role: resolved.agent.role,
        meta: resolved.agent.meta,
      });
      systemPrompt = buildAgentSystemPrompt(identity, { sessionId });
      agentIdentity = identity;
    } else {
      const requestedChatId = chatIdFromBody as string;

      let existingChats: any[];
      try {
        existingChats = await listChats({ organizationId: body.organizationId });
      } catch (err) {
        return errorResponse(502, 'CONVEX_ERROR', 'Failed to validate chat against Convex.', {
          retryable: true,
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (!Array.isArray(existingChats) || !existingChats.some((c: any) => c?._id === requestedChatId)) {
        return errorResponse(400, 'CHAT_NOT_FOUND', 'Invalid chatId. The selected chat no longer exists.');
      }

      const currentChat = existingChats.find((c: any) => c?._id === requestedChatId) as
        | {
            _id: string;
            agentId?: string;
            agent?: { name: string; area?: string; subArea?: string };
            summary?: string;
            summaryUpdatedAt?: string;
          }
        | undefined;

      chatId = requestedChatId;
      agentId = currentChat?.agentId;
      area = currentChat?.agent?.area;
      subArea = currentChat?.agent?.subArea;
      hasSummary = Boolean(currentChat?.summary?.trim());
      summaryText = hasSummary ? currentChat?.summary?.trim() : undefined;
      systemPrompt = buildAvrilUnifiedSystemPrompt();
    }

    try {
      await sendMessage({ chatId, content: message });
    } catch (err) {
      return errorResponse(502, 'CONVEX_ERROR', 'Failed to persist user message.', {
        retryable: true,
        details: err instanceof Error ? err.message : String(err),
      });
    }

    let contextMessages: NonNullable<BridgeInput['messages']> = [];
    try {
      const allMessages = await listMessages({ chatId });
      // El mensaje actual ya se persistió arriba: no lo mandes otra vez como contexto.
      const history =
        allMessages.length > 0 && allMessages[allMessages.length - 1]?.content === message
          ? allMessages.slice(0, -1)
          : allMessages;
      const limit = hasSummary ? BRIDGE_CONTEXT_LAST_N_WHEN_SUMMARY : BRIDGE_CONTEXT_LAST_N;
      const lastN = history.slice(-limit).map((m: any) => {
        const content = String(m.content ?? '').trim();
        const truncated =
          content.length <= BRIDGE_CONTEXT_MAX_CONTENT_CHARS
            ? content
            : content.slice(0, BRIDGE_CONTEXT_MAX_CONTENT_CHARS) + '…';
        return {
          authorType: m.authorType,
          authorId: m.authorId ?? '',
          content: truncated,
          createdAt: m.createdAt,
        };
      });
      contextMessages = lastN;
    } catch {
      // Proceed without context if listing fails
    }

    const input: BridgeInput = {
      chatId,
      message,
      mode,
      model: body.model === 'mock' ? undefined : body.model,
      agentId,
      area,
      subArea,
      systemPrompt,
      ...(summaryText ? { summary: summaryText } : {}),
      messages: contextMessages.length > 0 ? contextMessages : undefined,
      maxContextChars: BRIDGE_CONTEXT_MAX_CHARS,
    };

    const wantsMock = body.model === 'mock';
    if (wantsMock && mode !== 'agent') {
      return errorResponse(400, 'BAD_REQUEST', 'El modelo mock solo existe en modo agente.');
    }
    if (wantsMock && process.env.NODE_ENV === 'production') {
      return errorResponse(400, 'BAD_REQUEST', 'El modelo mock está deshabilitado en producción.');
    }

    const result = wantsMock
      ? { ok: true as const, text: buildMockAgentReply(agentIdentity, message, contextMessages.length) }
      : body.model === 'venice'
        ? await callVeniceInference(input)
        : await callOpenClawBridge(input);

    if (!result.ok) {
      return errorResponse(502, result.code, result.message, {
        retryable: result.retryable,
        details: 'attempts' in result ? { attempts: result.attempts } : undefined,
      });
    }

    // En modo agente la respuesta es texto plano: no hay payload de arquitecto ni ignición.
    const parsed =
      mode === 'agent'
        ? { displayText: result.text.trim(), architectPayload: null as Record<string, unknown> | null }
        : parseAvrilAssistantReply(result.text);
    const displayText = parsed.displayText;
    const architectPayload = parsed.architectPayload;

    try {
      await sendAgentMessage({ chatId, content: displayText, authorId: agentAuthorId ?? 'AvrilAgent' });
    } catch (err) {
      return errorResponse(502, 'CONVEX_ERROR', 'Agent reply received but failed to persist.', {
        retryable: true,
        details: err instanceof Error ? err.message : String(err),
      });
    }

    let ignitionReady = false;
    if (mode === 'architect' && architectPayload !== null) {
      const extracted = extractDraftFromArchitectPayload(architectPayload);
      if (extracted) {
        ignitionReady = extracted.nextStatus === 'ready';
        try {
          const organizationId = body.organizationId?.trim() || (await getDefaultOrganizationId());
          await upsertChatIgnitionDraft({
            organizationId,
            chatId,
            phase: extracted.phase,
            captured: extracted.captured,
            ignitionPrompt: extracted.ignitionPrompt,
            handoffPayload: extracted.handoffPayload,
            lastArchitectPayload: architectPayload,
            nextStatus: extracted.nextStatus,
          });
        } catch {
          /* draft persistence must not break chat */
        }
      }
    }

    if (mode === 'architect' && isFolderAgentBriefMessage(message)) {
      try {
        const organizationId = body.organizationId?.trim() || (await getDefaultOrganizationId());
        const capturedFromJson =
          architectPayload !== null &&
          typeof architectPayload.captured === 'object' &&
          architectPayload.captured !== null &&
          !Array.isArray(architectPayload.captured)
            ? (architectPayload.captured as Record<string, unknown>)
            : undefined;

        const h1Title = message.match(/^#\s+(.+)$/m)?.[1]?.trim().replace(/\s+/g, ' ');
        const h1Company =
          h1Title &&
          !/^agent\s*brief\b/i.test(h1Title) &&
          !/^(conservative|balanced|ambitious)$/i.test(h1Title)
            ? h1Title.slice(0, 56)
            : undefined;

        const ideaFromBrief =
          message.match(/^(?:company|venture|project|startup|idea)\s*(?:name)?\s*[:\-–]\s*(.+)$/im)?.[1]?.trim() ||
          message
            .split(/\n/)
            .map((l) => l.trim())
            .find(
              (l) =>
                l.length >= 4 &&
                !/^#+\s*/.test(l) &&
                !/^\*\*.+\*\*:?\s*$/.test(l) &&
                !/^[A-Za-z][\w\s/()&-]{2,70}:\s*$/.test(l) &&
                !/^agent\s*brief\b/i.test(l.replace(/^#+\s*/, '')),
            );

        const companyGuess =
          (typeof capturedFromJson?.companyName === 'string' && capturedFromJson.companyName.trim()) ||
          h1Company ||
          (typeof capturedFromJson?.rawIdea === 'string' && capturedFromJson.rawIdea.trim()) ||
          ideaFromBrief;

        await upsertChatIgnitionDraft({
          organizationId,
          chatId,
          phase: 'handoff_ready',
          captured: {
            ...(capturedFromJson ?? {}),
            ...(companyGuess
              ? {
                  companyName:
                    (typeof capturedFromJson?.companyName === 'string' && capturedFromJson.companyName.trim()) ||
                    companyGuess.slice(0, 56),
                  rawIdea:
                    (typeof capturedFromJson?.rawIdea === 'string' && capturedFromJson.rawIdea.trim()) ||
                    companyGuess,
                }
              : {}),
          },
          ignitionPrompt: message,
          handoffPayload: {
            kind: 'chat_intake_brief_v1',
            ...(companyGuess ? { companyName: companyGuess.slice(0, 56) } : {}),
            intakeSource: 'chat_intake',
          },
          lastArchitectPayload: architectPayload ?? undefined,
          nextStatus: 'ready',
        });
        ignitionReady = true;
      } catch {
        /* draft persistence must not break chat */
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      chatId,
      ...(agentAuthorId ? { agentKey: agentAuthorId } : {}),
      reply: displayText,
      ...(mode === 'architect' && architectPayload !== null ? { architectPayload } : {}),
      ...(ignitionReady ? { ignitionReady: true } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    return errorResponse(500, 'INTERNAL_ERROR', message, { retryable: true });
  }
}
