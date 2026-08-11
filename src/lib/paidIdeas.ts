const STORAGE_KEY = 'avril:paid-idea-ids';

function readPaidIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function hasIdeaBeenPaid(ideaId: string | null | undefined): boolean {
  if (!ideaId) return false;
  return readPaidIds().includes(ideaId);
}

export function markIdeaPaid(ideaId: string | null | undefined): void {
  if (!ideaId || typeof window === 'undefined') return;
  const current = readPaidIds();
  if (current.includes(ideaId)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, ideaId]));
  } catch {
    // best-effort; no bloquea el flujo si localStorage falla
  }
}