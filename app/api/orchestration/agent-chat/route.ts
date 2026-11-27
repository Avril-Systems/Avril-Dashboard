import { NextResponse } from 'next/server';
import { getAgentChat, listMessages } from '@/src/lib/convexServer';
import { errorResponse, guardRequest, isSafeId } from '@/src/lib/swarmyServer';

/**
 * GET /api/orchestration/agent-chat?sessionId=&agentKey=
 *
 * Conversación 1:1 de un agente del Agent Office. Devuelve `chatId: null` si el
 * agente todavía no tiene hilo: el chat se crea en el primer POST a /api/chat/respond.
 *
 * Solo lectura: no hay side effects en un GET. El tenant/organización y la
 * identidad del agente salen del servidor (sesión de orquestación en Convex).
 */
export async function GET(req: Request) {
  const denied = guardRequest(req, 'agent-chat', 180);
  if (denied) return denied;

  try {
    const params = new URL(req.url).searchParams;
    const sessionId = params.get('sessionId')?.trim();
    const agentKey = params.get('agentKey')?.trim();

    if (!isSafeId(sessionId) || !isSafeId(agentKey)) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'sessionId y agentKey son obligatorios' } },
        { status: 400 }
      );
    }

    const resolved = await getAgentChat({ sessionId, agentKey });
    if (!resolved) {
      return NextResponse.json(
        { ok: false, error: { code: 'AGENT_NOT_FOUND', message: 'Unknown agent for this session.' } },
        { status: 404 }
      );
    }

    const messages = resolved.chatId ? await listMessages({ chatId: resolved.chatId }) : [];

    return NextResponse.json({
      ok: true,
      sessionId,
      chatId: resolved.chatId,
      agent: resolved.agent,
      messages,
    });
  } catch (err) {
    return errorResponse(err, 'AGENT_CHAT_FETCH_FAILED');
  }
}
