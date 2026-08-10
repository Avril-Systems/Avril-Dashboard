import { NextResponse } from 'next/server';
import { getClientIp, hitRateLimit } from '@/src/lib/apiSecurity';
import { readSession } from '@/src/lib/sessionAuth';
import {
  fetchCompanyDeployStatus,
  LaunchServiceError,
  mapLaunchStatusToSessionStatus,
} from '@/src/lib/launchClient';
import {
  appendOrchestrationEvent,
  getOrchestrationSession,
  setOrchestrationSessionStatus,
} from '@/src/lib/convexServer';

const ERROR_STATUS: Record<string, number> = {
  LAUNCH_DISABLED: 501,
  CONFIG_ERROR: 501,
  LAUNCH_UPSTREAM_ERROR: 502,
  LAUNCH_TIMEOUT: 502,
  LAUNCH_CONNECTION_ERROR: 502,
};

/**
 * Polls Launch (GET /api/companies/{deploymentId}) and mirrors the deploy state
 * into the Convex orchestration session Agent Office reads.
 */
export async function GET(req: Request) {
  try {
    const session = readSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Sign in with your wallet to continue.' } },
        { status: 401 }
      );
    }

    const ip = getClientIp(req);
    if (hitRateLimit(`deploy:status:${ip}`, 60)) {
      return NextResponse.json(
        { ok: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId')?.trim();
    const deploymentId = searchParams.get('deploymentId')?.trim();

    let resolvedDeploymentId = deploymentId ?? null;
    if (!resolvedDeploymentId && sessionId) {
      const existing = await getOrchestrationSession({ sessionId });
      resolvedDeploymentId =
        typeof existing?.spawnRequestId === 'string' ? existing.spawnRequestId : null;
    }

    if (!resolvedDeploymentId) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'deploymentId is required (or a sessionId linked to a deploy).',
          },
        },
        { status: 400 }
      );
    }

    const remote = await fetchCompanyDeployStatus(resolvedDeploymentId);

    if (sessionId) {
      const mapped = mapLaunchStatusToSessionStatus(remote.status);
      await setOrchestrationSessionStatus({
        sessionId,
        status: mapped,
        containerRef: remote.companyId ? `oc-${remote.companyId}` : undefined,
        endpointUrl: remote.url ?? undefined,
        error: remote.error ?? undefined,
      });
      await appendOrchestrationEvent({
        sessionId,
        type: 'deploy.status',
        payload: {
          status: remote.status,
          url: remote.url,
          error: remote.error,
          logs: Array.isArray(remote.logs) ? remote.logs.slice(0, 50) : undefined,
        },
      });
      if (remote.status === 'ready') {
        await appendOrchestrationEvent({
          sessionId,
          type: 'deploy.ready',
          payload: { url: remote.url, deploymentId: remote.deploymentId },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      status: remote.status,
      sessionStatus: sessionId ? mapLaunchStatusToSessionStatus(remote.status) : null,
      deploymentId: remote.deploymentId,
      companyId: remote.companyId,
      url: remote.url,
      error: remote.error,
      logs: Array.isArray(remote.logs) ? remote.logs.slice(0, 100) : [],
      timestamps: remote.timestamps ?? null,
    });
  } catch (err) {
    if (err instanceof LaunchServiceError) {
      return NextResponse.json(
        { ok: false, error: { code: err.code, message: err.message, retryable: err.retryable } },
        { status: ERROR_STATUS[err.code] ?? 500 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Unknown error' },
      },
      { status: 500 }
    );
  }
}
