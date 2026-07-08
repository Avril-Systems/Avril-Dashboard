'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, Bot, CheckCircle2, Rocket } from 'lucide-react';
import { MarketingBrandButton } from '@/components/marketing/marketing-brand-button';
import type { Opportunity } from './types';

type BlueprintPreviewProps = {
  opportunity: Opportunity;
  onBack: () => void;
  onDeploy: () => void;
};

export function BlueprintPreview({ opportunity, onBack, onDeploy }: BlueprintPreviewProps) {
  const { blueprint } = opportunity;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="mx-auto w-full max-w-3xl"
    >
      <button
        type="button"
        onClick={onBack}
        className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={16} />
        Volver a oportunidades
      </button>

      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-surface/60 backdrop-blur-xl">
        <div className="relative space-y-8 p-6 md:p-10">
          <div className="space-y-3 text-center md:text-left">
            <p className="text-xs font-medium uppercase tracking-widest text-brand">Blueprint inicial</p>
            <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{opportunity.name}</h2>
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">{blueprint.summary}</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm uppercase tracking-widest text-muted-foreground">Primeros 3 pasos para lanzarla</h3>
            <ol className="space-y-3">
              {blueprint.steps.map((step, i) => (
                <li
                  key={step}
                  className="flex gap-4 rounded-xl border border-border/60 bg-surface-raised/40 px-4 py-3.5"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand/30 bg-brand/10 text-xs font-semibold text-brand">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-sm leading-relaxed text-foreground/90 md:text-base">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm uppercase tracking-widest text-muted-foreground">Agentes incluidos</h3>
            <div className="flex flex-wrap gap-2">
              {blueprint.agents.map((agent) => (
                <span
                  key={agent}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-black/30 px-3 py-1.5 text-sm text-foreground/90"
                >
                  <Bot size={14} className="text-brand" />
                  {agent}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 border-t border-border/50 pt-4 sm:flex-row">
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 size={16} className="text-brand" />
              Listo para desplegar
            </p>
            <MarketingBrandButton label="Desplegar empresa agéntica" onClick={onDeploy} />
          </div>
        </div>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground/70">
        <Rocket size={12} />
        Next: sign in and choose a plan to launch
      </p>
    </motion.div>
  );
}
