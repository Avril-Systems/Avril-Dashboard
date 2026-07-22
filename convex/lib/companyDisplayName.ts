const PLACEHOLDER_TITLES = new Set([
  '',
  'home venice chat',
  'new chat',
  'new idea',
  'untitled company',
  'untitled idea',
  'chat agent',
  'my company',
  'mi empresa',
]);

function asTrimmedString(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') {
    const t = v.trim().replace(/\s+/g, ' ');
    return t.length ? t : undefined;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

/** Titles Venice/template systems emit that must never become company labels. */
function isAgentBriefLabel(title: string | undefined): boolean {
  if (!title) return false;
  // Match "# Agent brief · Ambitious", "Agent brief — Balanced", etc. regardless of punctuation.
  const t = title
    .trim()
    .replace(/^#+\s*/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return /^agent\s*brief\b/.test(t);
}

function isPlaceholderTitle(title: string | undefined): boolean {
  if (!title) return true;
  if (isAgentBriefLabel(title)) return true;
  return PLACEHOLDER_TITLES.has(title.trim().toLowerCase());
}

function shortLabel(text: string, max = 56): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

/** Turn free-form idea text into a short company/project label. */
export function nameFromIdeaText(idea: string | undefined | null, max = 48): string | undefined {
  const raw = asTrimmedString(idea);
  if (!raw || isPlaceholderTitle(raw)) return undefined;

  let t = raw
    .replace(
      /^(?:i\s+(?:want|would like)\s+to\s+(?:build|create|make|start|launch)|we(?:'re| are)\s+building|building|my idea is|idea:)\s+/i,
      ''
    )
    .trim();
  if (!t) t = raw;

  const first = t.split(/[.!?\n]/)[0]?.trim() || t;
  if (!first || isPlaceholderTitle(first)) return undefined;
  return shortLabel(first, max);
}

function capturedFromPromptJson(prompt: string): Record<string, unknown> | null {
  const start = prompt.indexOf('{');
  const end = prompt.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(prompt.slice(start, end + 1)) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore malformed prompt JSON
  }
  return null;
}

function firstMeaningfulPromptLine(prompt: string | undefined): string | undefined {
  if (!prompt?.trim()) return undefined;

  const fromJson = capturedFromPromptJson(prompt);
  if (fromJson) {
    for (const key of ['companyName', 'title', 'name', 'rawIdea'] as const) {
      const v =
        key === 'rawIdea'
          ? nameFromIdeaText(asTrimmedString(fromJson[key]))
          : asTrimmedString(fromJson[key]);
      if (v && !isPlaceholderTitle(v)) return shortLabel(v);
    }
  }

  // Prefer structured "Idea: ..." / "Company name: ..." lines over generic markdown titles.
  for (const raw of prompt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const named = line.match(
      /^(?:company|venture|project|startup|idea)\s*(?:name)?\s*[:\-–]\s*(.+)$/i
    );
    if (named?.[1]) {
      const fromIdea = nameFromIdeaText(named[1]) ?? shortLabel(named[1]);
      if (fromIdea && !isPlaceholderTitle(fromIdea)) return fromIdea;
    }
  }

  for (const raw of prompt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^founder control plane/i.test(line)) continue;
    if (/^#+\s*/.test(line)) continue; // skip markdown headings (often "# Agent brief · …")
    if (isAgentBriefLabel(line)) continue;
    if (/^[{[]/.test(line)) continue;
    if (/^["']?(rawIdea|problem|founderName|captured)/i.test(line)) continue;
    if (line.length >= 4 && !isPlaceholderTitle(line)) return shortLabel(line);
  }
  return undefined;
}

function nameFromCaptured(captured: Record<string, unknown> | null): string | undefined {
  if (!captured) return undefined;

  for (const key of [
    'companyName',
    'ventureName',
    'projectName',
    'startupName',
    'businessName',
    'title',
    'name',
  ] as const) {
    const v = asTrimmedString(captured[key]);
    if (v && !isPlaceholderTitle(v)) return shortLabel(v);
  }

  return nameFromIdeaText(asTrimmedString(captured.rawIdea));
}

/**
 * Best-effort company label for Agent Office / company switcher.
 * Prefers explicit names, then idea text, then non-placeholder chat titles.
 * Never returns Venice "Agent brief · …" template headings.
 */
export function deriveCompanyDisplayName(input: {
  companyName?: string | null;
  chatTitle?: string | null;
  captured?: unknown;
  ignitionPrompt?: string | null;
  handoffPayload?: unknown;
}): string {
  const stored = asTrimmedString(input.companyName);
  if (stored && !isPlaceholderTitle(stored)) return shortLabel(stored);

  const captured =
    input.captured && typeof input.captured === 'object' && !Array.isArray(input.captured)
      ? (input.captured as Record<string, unknown>)
      : null;

  const fromCaptured = nameFromCaptured(captured);
  if (fromCaptured) return fromCaptured;

  const handoff =
    input.handoffPayload && typeof input.handoffPayload === 'object' && !Array.isArray(input.handoffPayload)
      ? (input.handoffPayload as Record<string, unknown>)
      : null;
  if (handoff) {
    for (const key of ['companyName', 'ventureName', 'title', 'profileLine'] as const) {
      const v = asTrimmedString(handoff[key]);
      if (v && !isPlaceholderTitle(v) && v.length <= 80) return shortLabel(v);
    }
    const handoffIdea = nameFromIdeaText(asTrimmedString(handoff.rawIdea));
    if (handoffIdea) return handoffIdea;
  }

  const fromPrompt = firstMeaningfulPromptLine(input.ignitionPrompt ?? undefined);
  if (fromPrompt) return fromPrompt;

  const chatTitle = asTrimmedString(input.chatTitle);
  if (chatTitle && !isPlaceholderTitle(chatTitle)) return shortLabel(chatTitle);

  return 'Untitled company';
}

export function isPlaceholderChatTitle(title: string | undefined | null): boolean {
  return isPlaceholderTitle(asTrimmedString(title ?? undefined));
}
