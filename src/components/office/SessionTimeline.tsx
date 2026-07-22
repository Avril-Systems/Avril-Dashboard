'use client';

import { GlassPanel } from '@/components/patterns/glass-panel';
import { avrilTypography } from '@/lib/avril-tokens';
import { cn } from '@/lib/utils';

type EventItem = {
  _id: string;
  type: string;
  createdAt: string;
  payload?: unknown;
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

export default function SessionTimeline({ events }: { events: EventItem[] }) {
  return (
    <GlassPanel className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
      <h4 className={cn(avrilTypography.card, 'mb-3 shrink-0 text-sm')}>Live Events</h4>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
        {events.length === 0 && <p className="text-xs text-muted-foreground">No events yet.</p>}
        {events.map((e) => (
          <div key={e._id} className="rounded-xl border border-border/60 bg-background/40 p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-foreground">{e.type}</p>
              <p className="text-[10px] text-muted-foreground">{formatTime(e.createdAt)}</p>
            </div>
            {Boolean(e.payload) && (
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[10px] text-muted-foreground">
                {String(JSON.stringify(e.payload, null, 2))}
              </pre>
            )}
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}
