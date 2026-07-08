'use client';

import { GlassPanel } from '@/components/patterns/glass-panel';

const ITEMS = [
  { key: 'spawning', cls: 'bg-blue-400' },
  { key: 'idle', cls: 'bg-slate-400' },
  { key: 'working', cls: 'bg-emerald-400' },
  { key: 'blocked', cls: 'bg-amber-400' },
  { key: 'completed', cls: 'bg-cyan-400' },
  { key: 'error', cls: 'bg-rose-400' },
];

export default function OfficeLegend() {
  return (
    <GlassPanel showBrandLine={false} className="flex flex-wrap gap-x-4 gap-y-2 px-3 py-2">
      {ITEMS.map((item) => (
        <div key={item.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${item.cls}`} />
          <span className="font-heading">{item.key}</span>
        </div>
      ))}
    </GlassPanel>
  );
}
