'use client';

/**
 * Chat 1:1 con un agente del Agent Office (S01).
 *
 * Cambios frente a la versión anterior:
 *   - Deja de mandar todo al hilo del fundador con el prefijo "[Directed to …]".
 *   - Cada agente tiene SU chat en Convex (`kind='agent'`, ligado a sessionId + agentKey).
 *   - El historial se lee del servidor (sobrevive a recargas y a cambiar de agente).
 *   - El system prompt lo elige el servidor: persona del agente, no el arquitecto de Avril.
 *
 * La UI no inventa historial: muestra lo persistido y, mientras se espera la
 * respuesta, solo el mensaje optimista propio.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlassPanel } from '@/components/patterns/glass-panel';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import remarkBreaks from 'remark-breaks';

type AgentOption = {
  agentKey: string;
  name: string;
  role?: string;
  status: string;
};

type ServerMessage = {
  _id: string;
  authorType: 'human' | 'agent' | string;
  authorId: string;
  content: string;
  createdAt: string;
};

type PendingMessage = { content: string; at: number };

type ModelChoice = 'venice' | 'codex' | 'opus' | 'mock';

const DASHBOARD_TOKEN = process.env.NEXT_PUBLIC_DASHBOARD_APP_TOKEN ?? '';
const POLL_MS = 4000;
const MODEL_STORAGE_KEY = 'avril-dashboard:agent-model';

export default function OfficeAgentChat({
  agents,
  sessionId,
  selectedAgentKey,
  onSelectAgent,
}: {
  agents: AgentOption[];
  sessionId: string;
  selectedAgentKey: string | null;
  onSelectAgent: (key: string) => void;
}) {
  const [messages, setMessages] = useState<ServerMessage[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [model, setModel] = useState<ModelChoice>('venice');
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeAgent = agents.find((a) => a.agentKey === selectedAgentKey) ?? agents[0] ?? null;
  const activeAgentKey = activeAgent?.agentKey ?? null;
  /** Evita que una respuesta lenta de otro agente pise el hilo activo. */
  const activeAgentKeyRef = useRef<string | null>(activeAgentKey);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (DASHBOARD_TOKEN) headers['x-dashboard-token'] = DASHBOARD_TOKEN;
    return headers;
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
      if (saved === 'venice' || saved === 'codex' || saved === 'opus' || saved === 'mock') setModel(saved);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(MODEL_STORAGE_KEY, model);
    } catch {
      // ignore
    }
  }, [model]);

  const load = useCallback(async () => {
    if (!sessionId || !activeAgentKey) {
      setMessages([]);
      setChatId(null);
      return;
    }
    const requestedAgentKey = activeAgentKey;
    const query = new URLSearchParams({ sessionId, agentKey: activeAgentKey });
    try {
      const res = await fetch(`/api/orchestration/agent-chat?${query.toString()}`, {
        cache: 'no-store',
        credentials: 'include',
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (activeAgentKeyRef.current !== requestedAgentKey) return;
      if (!res.ok || data?.ok === false) {
        if (res.status === 404) {
          // El agente aún no está registrado en la sesión: sin historial, sin error ruidoso.
          setMessages([]);
          setChatId(null);
          setError(null);
          return;
        }
        setError(data?.error?.message ?? `No se pudo cargar la conversación (HTTP ${res.status}).`);
        return;
      }
      setError(null);
      setChatId(typeof data.chatId === 'string' ? data.chatId : null);
      setMessages(Array.isArray(data.messages) ? (data.messages as ServerMessage[]) : []);
    } catch (err) {
      if (activeAgentKeyRef.current !== requestedAgentKey) return;
      setError(err instanceof Error ? err.message : 'No se pudo cargar la conversación.');
    }
  }, [sessionId, activeAgentKey, authHeaders]);

  // Cambio de agente = otro hilo: se limpia el estado local y se relee del servidor.
  useEffect(() => {
    activeAgentKeyRef.current = activeAgentKey;
    setMessages([]);
    setChatId(null);
    setError(null);
    setPending(null);
    if (!activeAgentKey) return;

    setLoading(true);
    void load().finally(() => setLoading(false));
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [activeAgentKey, load]);

  // El mensaje optimista desaparece cuando el servidor ya lo persistió (mismo texto, reciente).
  useEffect(() => {
    if (!pending) return;
    const persisted = messages.some((m) => {
      if (m.authorType !== 'human') return false;
      if (m.content.trim() !== pending.content) return false;
      const at = Date.parse(m.createdAt);
      return !Number.isFinite(at) || at >= pending.at - 5000;
    });
    if (persisted) setPending(null);
  }, [messages, pending]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending, sending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeAgentKey]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || !activeAgent || !sessionId || sending) return;

    const startedAt = Date.now();
    setInput('');
    setSending(true);
    setError(null);
    setPending({ content: text, at: startedAt });

    try {
      const res = await fetch('/api/chat/respond', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          sessionId,
          agentKey: activeAgent.agentKey,
          message: text,
          model,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.error?.message ?? `No se pudo contactar a ${activeAgent.name} (HTTP ${res.status}).`);
        setPending(null);
        return;
      }
      if (typeof data.chatId === 'string') setChatId(data.chatId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
      setPending(null);
    } finally {
      setSending(false);
      void load();
      inputRef.current?.focus();
    }
  }, [input, activeAgent, sessionId, sending, authHeaders, load, model]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const visibleMessages = useMemo(() => {
    if (!pending) return messages;
    const alreadyThere = messages.some(
      (m) => m.authorType === 'human' && m.content.trim() === pending.content && Date.parse(m.createdAt) >= pending.at - 5000,
    );
    if (alreadyThere) return messages;
    return [
      ...messages,
      {
        _id: 'pending-user',
        authorType: 'human',
        authorId: 'user',
        content: pending.content,
        createdAt: new Date(pending.at).toISOString(),
      } satisfies ServerMessage,
    ];
  }, [messages, pending]);

  if (!activeAgent) {
    return (
      <GlassPanel className="flex h-[280px] items-center justify-center p-4 xl:h-[320px]">
        <p className="text-xs text-muted-foreground">No agents available to chat with.</p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="flex h-[320px] flex-col overflow-hidden xl:h-[360px]">
      {/* Agent selector bar */}
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => setSelectorOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-1.5 text-left transition-colors hover:border-brand/30 hover:bg-surface/60"
          >
            <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-emerald-400" />
            <span className="truncate font-heading text-sm font-medium text-foreground">{activeAgent.name}</span>
            <span className="truncate text-[11px] text-muted-foreground">{activeAgent.role}</span>
            <svg
              className={`ml-auto h-3.5 w-3.5 text-slate-400 transition-transform ${selectorOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {selectorOpen && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[200px] overflow-y-auto rounded-lg border border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl">
              {agents.map((ag) => (
                <button
                  key={ag.agentKey}
                  type="button"
                  onClick={() => {
                    onSelectAgent(ag.agentKey);
                    setSelectorOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface/60',
                    ag.agentKey === activeAgent.agentKey && 'bg-brand/10'
                  )}
                >
                  <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-emerald-400" />
                  <span className="truncate text-sm text-foreground">{ag.name}</span>
                  <span className="ml-auto truncate text-[10px] text-muted-foreground">{ag.role}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="flex-shrink-0 text-[10px] text-muted-foreground">
          {visibleMessages.length} msg{visibleMessages.length !== 1 ? 's' : ''}
          {chatId ? '' : ' · sin hilo'}
        </span>

        <select
          value={model}
          onChange={(e) => setModel(e.target.value as ModelChoice)}
          title="Modelo para este agente (Venice no necesita bridge)"
          className="flex-shrink-0 rounded-md border border-border/60 bg-background/40 px-1.5 py-1 text-[11px] text-foreground"
        >
          <option value="venice">Venice</option>
          <option value="codex">Codex (bridge)</option>
          <option value="opus">Opus (bridge)</option>
          {process.env.NODE_ENV !== 'production' && <option value="mock">Mock (solo dev)</option>}
        </select>
      </div>

      {error && (
        <p className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-1.5 text-[11px] text-rose-300">{error}</p>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {visibleMessages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="space-y-1 text-center">
              <p className="text-xs text-muted-foreground">
                {loading ? 'Cargando conversación…' : `Send a message to ${activeAgent.name}`}
              </p>
              <p className="text-[10px] text-muted-foreground/70">
                Hilo independiente por agente, persistido en Convex. La ejecución real se asigna en Runs.
              </p>
            </div>
          </div>
        )}
        {visibleMessages.map((msg) => {
          const isHuman = msg.authorType === 'human';
          const authorName =
            !isHuman && msg.authorId === activeAgent.agentKey ? activeAgent.name : msg.authorId || activeAgent.name;
          return (
            <div key={msg._id} className={`flex ${isHuman ? 'justify-end' : 'justify-start'}`}>
              <div
                className={cn(
                  'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed',
                  isHuman
                    ? 'border border-brand/30 bg-brand/15 text-foreground'
                    : 'border border-border/60 bg-background/40 text-foreground/90'
                )}
              >
                {!isHuman && <p className="mb-1 text-[10px] font-medium text-muted-foreground">{authorName}</p>}
                <div className="chat-markdown break-words">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeSanitize]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
              <p className="mb-1 text-[10px] font-medium text-muted-foreground">{activeAgent.name}</p>
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border/60 px-4 py-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${activeAgent.name}...`}
            rows={1}
            disabled={sending}
            className="flex-1 resize-none rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-brand/50 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={sending || !input.trim()}
            className="flex-shrink-0 rounded-lg border border-brand/40 bg-brand/20 px-3 py-2 text-sm font-heading font-medium text-brand transition-colors hover:bg-brand/30 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Send
          </button>
        </div>
      </div>
    </GlassPanel>
  );
}
