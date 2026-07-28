'use client';

import { useEffect, useRef, useState } from 'react';
import { rememberOfficeSessionId } from '@/src/lib/officeSessionMemory';
import type { Opportunity } from '@/components/flows/luck/types';

type SpawnState = {
  spawnedSessionId: string | null;
  spawnError: string | null;
};

/**
 * Runs spawn-from-opportunity once per unique opportunity + ideaId pair.
 */
export function useSpawnFromOpportunity(args: {
  active: boolean;
  opportunity: Opportunity | null;
  ideaId: string | null;
  authHeaders: Record<string, string>;
  /** Product entry path written into spawn.requested events. */
  intakeSource: 'rag_opportunity' | 'form_intake';
}): SpawnState {
  const { active, opportunity, ideaId, authHeaders, intakeSource } = args;
  const [spawnedSessionId, setSpawnedSessionId] = useState<string | null>(null);
  const [spawnError, setSpawnError] = useState<string | null>(null);
  const startedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active || !opportunity) return;

    const runKey = `${intakeSource}:${opportunity.id}:${ideaId ?? 'none'}`;
    if (startedKeyRef.current === runKey) return;
    startedKeyRef.current = runKey;

    let cancelled = false;

    async function spawnOffice() {
      setSpawnError(null);
      try {
        const res = await fetch('/api/orchestration/spawn-from-opportunity', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            opportunity,
            ideaId: ideaId ?? undefined,
            intakeSource,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          sessionId?: string;
          error?: { message?: string };
        };
        if (cancelled) return;

        if (data.sessionId) {
          setSpawnedSessionId(data.sessionId);
          rememberOfficeSessionId(data.sessionId);
        }

        if (!res.ok || !data.sessionId) {
          setSpawnError(data.error?.message || 'Could not open Agent Office for this company.');
        }
      } catch (err) {
        if (!cancelled) {
          setSpawnError(err instanceof Error ? err.message : 'Spawn failed');
        }
      }
    }

    void spawnOffice();
    return () => {
      cancelled = true;
    };
  }, [active, opportunity, ideaId, authHeaders, intakeSource]);

  return { spawnedSessionId, spawnError };
}
