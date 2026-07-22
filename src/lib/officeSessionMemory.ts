const LAST_OFFICE_SESSION_KEY = 'avril-dashboard:last-office-session';

export function rememberOfficeSessionId(sessionId: string) {
  if (typeof window === 'undefined') return;
  const id = sessionId.trim();
  if (!id) return;
  try {
    window.localStorage.setItem(LAST_OFFICE_SESSION_KEY, id);
  } catch {
    // ignore quota / private mode
  }
}

export function readLastOfficeSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const id = window.localStorage.getItem(LAST_OFFICE_SESSION_KEY)?.trim();
    return id || null;
  } catch {
    return null;
  }
}
