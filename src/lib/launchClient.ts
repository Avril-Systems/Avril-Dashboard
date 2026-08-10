import 'server-only';

const LAUNCH_BASE_URL = process.env.LAUNCH_API_URL;
const LAUNCH_API_TOKEN = process.env.LAUNCH_API_TOKEN;
const LAUNCH_ENABLED = process.env.LAUNCH_DEPLOY_ENABLED === 'true';

export const LAUNCH_REQUEST_TIMEOUT_MS = 10_000;

export type LaunchStatus = 'pending' | 'provisioning' | 'ready' | 'failed' | 'stale';

export type LaunchStartResult = {
  ok: boolean;
  deploymentId: string | null;
  companyId: string | null;
  status: string | null;
  /** True when Launch answered 200 because the deploy already existed. */
  alreadyExisted: boolean;
  raw: unknown;
};

export type LaunchDeployStatusResult = {
  ok: boolean;
  deploymentId: string | null;
  companyId: string | null;
  status: string | null;
  url: string | null;
  error: string | null;
  logs: string[] | null;
  timestamps: unknown;
  raw: unknown;
};

class LaunchServiceError extends Error {
  constructor(message: string, public code: string, public retryable: boolean) {
    super(message);
  }
}

function requireLaunchEnabled(): string {
  if (!LAUNCH_ENABLED) {
    throw new LaunchServiceError(
      'LAUNCH_DEPLOY_ENABLED is not set to "true"; the Launch deploy call is disabled.',
      'LAUNCH_DISABLED',
      false
    );
  }
  if (!LAUNCH_BASE_URL) {
    throw new LaunchServiceError('LAUNCH_API_URL is not configured', 'CONFIG_ERROR', false);
  }
  return LAUNCH_BASE_URL.replace(/\/+$/, '');
}

function asObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
}

function readField(obj: Record<string, unknown>, keys: string[]): string | null {
  const data =
    obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : undefined;
  for (const key of keys) {
    if (typeof obj[key] === 'string') return obj[key] as string;
  }
  if (data) {
    for (const key of keys) {
      if (typeof data[key] === 'string') return data[key] as string;
    }
  }
  return null;
}

/**
 * Launch real contract (202 Accepted on create, 200 when the deploy already exists):
 *   { success: true, deploymentId, companyId, status: "pending", timestamps: { created } }
 * statuses: pending → provisioning → ready | failed | stale (there is no "active").
 */
function extractStartResult(payload: unknown, alreadyExisted: boolean): LaunchStartResult {
  const obj = asObject(payload);
  const data = obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : undefined;
  const companyId = readField(obj, ['companyId']);
  const deploymentId = readField(obj, ['deploymentId', 'id']);
  const status = readField(obj, ['status']);
  const rawOk = typeof obj.success === 'boolean' ? obj.success : typeof data?.success === 'boolean' ? data.success : null;
  const ok = typeof rawOk === 'boolean' ? rawOk : true;

  return { ok, deploymentId, companyId, status, alreadyExisted, raw: payload };
}

function extractDeployStatusResult(payload: unknown): LaunchDeployStatusResult {
  const obj = asObject(payload);
  const companyId = readField(obj, ['companyId']);
  const deploymentId = readField(obj, ['deploymentId', 'id']);
  const status = readField(obj, ['status']);
  const url = readField(obj, ['url', 'endpointUrl']);
  const error = readField(obj, ['error']);
  const timestamps = obj.timestamps ?? null;
  const rawLogs = obj.logs;
  const logs = Array.isArray(rawLogs)
    ? rawLogs.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).filter(Boolean)
    : null;

  return { ok: status === 'ready', deploymentId, companyId, status, url, error, logs, timestamps, raw: payload };
}

export async function startCompanyDeploy(uuid: string): Promise<LaunchStartResult> {
  const baseUrl = requireLaunchEnabled();
  const url = `${baseUrl}/iniciar/${encodeURIComponent(uuid)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LAUNCH_REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {};
    if (LAUNCH_API_TOKEN) {
      headers['Authorization'] = `Bearer ${LAUNCH_API_TOKEN}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      cache: 'no-store',
    });

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (res.status === 409) {
      // 409 = the RAG rejected the idea (already acquired / unavailable).
      // Body: { success: false, error: "<detalle RAG>", code: "IDEA_NO_DISPONIBLE", action: "elegir_nueva_idea" }
      const errObj = asObject(payload);
      const code =
        typeof errObj.code === 'string' && errObj.code === 'IDEA_NO_DISPONIBLE'
          ? 'IDEA_NO_DISPONIBLE'
          : 'LAUNCH_CONFLICT';
      const message =
        typeof errObj.error === 'string'
          ? errObj.error
          : code === 'IDEA_NO_DISPONIBLE'
            ? 'La idea ya no está disponible. Elige otra empresa.'
            : `Launch /iniciar responded with ${res.status}`;
      throw new LaunchServiceError(message, code, false);
    }

    if (!res.ok) {
      throw new LaunchServiceError(
        `Launch /iniciar responded with ${res.status}`,
        'LAUNCH_UPSTREAM_ERROR',
        res.status >= 500
      );
    }

    return extractStartResult(payload, res.status === 200);
  } catch (err) {
    if (err instanceof LaunchServiceError) throw err;
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new LaunchServiceError(
      aborted ? 'Launch request timed out' : err instanceof Error ? err.message : 'Launch request failed',
      aborted ? 'LAUNCH_TIMEOUT' : 'LAUNCH_CONNECTION_ERROR',
      true
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Polls Launch for the current deploy state. Only returns ok:true when ready.
 */
export async function fetchCompanyDeployStatus(deploymentId: string): Promise<LaunchDeployStatusResult> {
  const baseUrl = requireLaunchEnabled();
  const url = `${baseUrl}/api/companies/${encodeURIComponent(deploymentId)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LAUNCH_REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {};
    if (LAUNCH_API_TOKEN) {
      headers['Authorization'] = `Bearer ${LAUNCH_API_TOKEN}`;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      cache: 'no-store',
    });

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      throw new LaunchServiceError(
        `Launch GET /api/companies responded with ${res.status}`,
        'LAUNCH_UPSTREAM_ERROR',
        res.status >= 500
      );
    }

    return extractDeployStatusResult(payload);
  } catch (err) {
    if (err instanceof LaunchServiceError) throw err;
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new LaunchServiceError(
      aborted ? 'Launch status request timed out' : err instanceof Error ? err.message : 'Launch status request failed',
      aborted ? 'LAUNCH_TIMEOUT' : 'LAUNCH_CONNECTION_ERROR',
      true
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Maps a Launch status to the orchestration session status Agent Office understands.
 * Launch has no "active": its "ready" is the equivalent.
 */
export function mapLaunchStatusToSessionStatus(status: string | null | undefined): 'queued' | 'spawning' | 'active' | 'failed' {
  switch (status) {
    case 'provisioning':
      return 'spawning';
    case 'ready':
      return 'active';
    case 'failed':
    case 'stale':
      return 'failed';
    case 'pending':
    default:
      return 'queued';
  }
}

export { LaunchServiceError };
