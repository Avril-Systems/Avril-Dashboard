import { NextResponse } from 'next/server';
import { errorResponse, guardRequest, isSafeId, sendRunCommand } from '@/src/lib/swarmyServer';

type Body = { runId?: string; agentKey?: string; command?: 'pause' | 'kill' };

/**
 * Solicita pause/kill registrando agent.command.sent en Convex. Solicitud != confirmación:
 * el Engine debe responder con agent.paused / agent.stopped. Si no hay Engine, la UI mostrará "Sin confirmar".
 * LIMITACIÓN CONOCIDA: solo valida sesión de Dashboard; no valida rol ni pertenencia al tenant por usuario.
 */
export async function POST(req: Request) {
  const denied = guardRequest(req, 'control', 100);
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const runId = body.runId?.trim();
    const agentKey = body.agentKey?.trim();
    const command = body.command;
    if (!isSafeId(runId) || !isSafeId(agentKey) || (command !== 'pause' && command !== 'kill')) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'runId, agentKey y command (pause|kill) son obligatorios' } },
        { status: 400 }
      );
    }
    const result = await sendRunCommand({ runId, agentKey, command });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return errorResponse(err, 'CONTROL_FAILED');
  }
}
