'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

type ChatMessage = {
  id: string;
  role: 'user' | 'agent';
  agentKey: string;
  agentName: string;
  content: string;
  timestamp: number;
};

const DASHBOARD_TOKEN = process.env.NEXT_PUBLIC_DASHBOARD_APP_TOKEN ?? '';

export default function OfficeAgentChat({
  agents,
  chatId,
  selectedAgentKey,
  onSelectAgent,
}: {
  agents: AgentOption[];
  chatId: string;
  selectedAgentKey: string | null;
  onSelectAgent: (key: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeAgent = agents.find((a) => a.agentKey === selectedAgentKey) ?? agents[0] ?? null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeAgent?.agentKey]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || !activeAgent || sending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      agentKey: activeAgent.agentKey,
      agentName: activeAgent.name,
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (DASHBOARD_TOKEN) headers['x-dashboard-token'] = DASHBOARD_TOKEN;

      const res = await fetch('/api/chat/respond', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          chatId,
          message: `[Directed to ${activeAgent.name} (${activeAgent.role || 'agent'})]\n\n${text}`,
        }),
      });
      const data = await res.json().catch(() => ({ reply: 'No response.' }));

      const agentMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'agent',
        agentKey: activeAgent.agentKey,
        agentName: activeAgent.name,
        content: data.reply || data.error?.message || 'No response received.',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'agent',
          agentKey: activeAgent.agentKey,
          agentName: activeAgent.name,
          content: err instanceof Error ? err.message : 'Request failed.',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, activeAgent, sending, chatId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const agentMessages = messages.filter(
    (m) => m.agentKey === activeAgent?.agentKey
  );

  if (!activeAgent) {
    return (
      <GlassPanel className="flex h-[280px] items-center justify-center p-4 xl:h-[320px]">
        <p className="text-xs text-muted-foreground">No agents available to chat with.</p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="flex h-[280px] flex-col overflow-hidden xl:h-[320px]">
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
              className={`ml-auto w-3.5 h-3.5 text-slate-400 transition-transform ${selectorOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {selectorOpen && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-[200px] overflow-y-auto rounded-lg border border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl">
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
          {agentMessages.length} msg{agentMessages.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {agentMessages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-center text-xs text-muted-foreground">
              Send a message to <span className="text-foreground">{activeAgent.name}</span>
            </p>
          </div>
        )}
        {agentMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'border border-brand/30 bg-brand/15 text-foreground'
                  : 'border border-border/60 bg-background/40 text-foreground/90'
              )}
            >
              {msg.role === 'agent' && (
                <p className="mb-1 text-[10px] font-medium text-muted-foreground">{msg.agentName}</p>
              )}
              <div className="chat-markdown break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeSanitize]}>
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
              <p className="mb-1 text-[10px] font-medium text-muted-foreground">{activeAgent.name}</p>
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:300ms]" />
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
