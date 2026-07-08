'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Sparkles, Lightbulb } from 'lucide-react';
import { FlowShell } from '@/components/flows/shared/flow-shell';
import { useLanguage } from '@/components/marketing/language-context';
import { GlassPanel } from '@/components/patterns/glass-panel';
import { MarketingBrandButton } from '@/components/marketing/marketing-brand-button';
import { CosmicButton } from '@/components/ui/cosmic-button';

export function StartPage() {
  const { t } = useLanguage();
  const s = t.flow.start;

  return (
    <FlowShell>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-3xl space-y-10 text-center"
      >
        <div className="space-y-4">
          <h1 className="text-balance text-3xl tracking-tight md:text-4xl lg:text-5xl">{s.title}</h1>
          <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">{s.subtitle}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <GlassPanel className="flex flex-col gap-5 p-6 text-left md:p-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-raised">
              <Lightbulb size={20} className="text-brand" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl text-foreground">{s.cardB.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{s.cardB.description}</p>
            </div>
            <MarketingBrandButton label={s.cardB.title} href="/start/idea" className="mt-auto w-full sm:w-auto" />
          </GlassPanel>

          <GlassPanel className="flex flex-col gap-5 p-6 text-left md:p-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-raised">
              <Sparkles size={20} className="text-brand" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl text-foreground">{s.cardA.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{s.cardA.description}</p>
            </div>
            <CosmicButton
              href="/get-started"
              className="mt-auto w-full sm:w-auto"
            >
              {s.cardA.title}
            </CosmicButton>
          </GlassPanel>
        </div>

        <p className="text-xs text-muted-foreground/70">
          <Link href="/" className="hover:text-foreground">
            {t.flow.backHome}
          </Link>
        </p>
      </motion.div>
    </FlowShell>
  );
}
