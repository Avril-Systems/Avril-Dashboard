'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useLanguage } from '@/components/marketing/language-context';
import { MarketingBrandButton } from '@/components/marketing/marketing-brand-button';
import type { Opportunity, StructuredBlueprint } from './types';
import { isMarkdownBlueprint } from './types';

type BlueprintPreviewProps = {
  opportunity: Opportunity;
  onBack: () => void;
  onDeploy: () => void;
  showBack?: boolean;
  useNavbarGlassBackground?: boolean;
};

export function BlueprintPreview({
  opportunity,
  onBack,
  onDeploy,
  showBack = true,
  useNavbarGlassBackground = false,
}: BlueprintPreviewProps) {
  const { t } = useLanguage();
  const b = t.flow.blueprint;
  const bp = opportunity.blueprint;

  function StructuredSections({ blueprint }: { blueprint: StructuredBlueprint }) {
    return (
      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className="font-heading text-xs font-medium uppercase tracking-[0.14em] text-brand">{b.offer}</h3>
          <p className="text-foreground/90 leading-relaxed">{blueprint.offer}</p>
        </section>

        <section className="space-y-2">
          <h3 className="font-heading text-xs font-medium uppercase tracking-[0.14em] text-brand">{b.idealCustomer}</h3>
          <p className="text-foreground/90 leading-relaxed">{blueprint.idealCustomer}</p>
        </section>

        <section className="space-y-2">
          <h3 className="font-heading text-xs font-medium uppercase tracking-[0.14em] text-brand">{b.launchSteps}</h3>
          <ol className="list-decimal space-y-1.5 pl-5 text-foreground/85">
            {blueprint.steps.map((step, i) => (
              <li key={i} className="leading-relaxed">
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-2">
          <h3 className="font-heading text-xs font-medium uppercase tracking-[0.14em] text-brand">{b.includedAgents}</h3>
          <div className="flex flex-wrap gap-2">
            {blueprint.agents.map((agent) => (
              <span key={agent} className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
                {agent}
              </span>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="font-heading text-xs font-medium uppercase tracking-[0.14em] text-brand">{b.risks}</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-foreground/85">
            {blueprint.risks.map((risk, i) => (
              <li key={i} className="leading-relaxed">
                {risk}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="font-heading text-xs font-medium uppercase tracking-[0.14em] text-brand">{b.deployCost}</h3>
          <p className="text-foreground/90 leading-relaxed">{blueprint.deployCost}</p>
        </section>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="mx-auto w-full max-w-3xl"
    >
      {showBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={16} />
          {b.back}
        </button>
      )}

      <div
        className={`relative overflow-hidden rounded-2xl border border-border/70 ${
          useNavbarGlassBackground
            ? 'bg-[rgba(0,0,0,0.95)] backdrop-blur-[20px]'
            : 'bg-surface/60 backdrop-blur-xl'
        }`}
      >
        <div className="relative space-y-8 p-6 md:p-10">
          <div className="space-y-3 text-center md:text-left">
            <p className="font-heading text-xs font-medium uppercase tracking-[0.14em] text-brand">{b.eyebrow}</p>
            <h2 className="text-3xl tracking-tight text-foreground md:text-4xl">{opportunity.name}</h2>
          </div>

          {bp ? (
            isMarkdownBlueprint(bp) ? (
              <div
                className="
                  prose prose-invert max-w-none
                  prose-headings:font-heading prose-headings:uppercase prose-headings:tracking-widest
                  prose-h2:text-sm prose-h2:text-muted-foreground prose-h2:mt-8 prose-h2:mb-3
                  prose-h3:text-sm prose-h3:text-brand prose-h3:mt-6 prose-h3:mb-2
                  prose-p:text-foreground/90 prose-p:leading-relaxed
                  prose-li:text-foreground/85
                  prose-strong:text-foreground
                "
              >
                <ReactMarkdown>{bp.markdown}</ReactMarkdown>
              </div>
            ) : (
              <StructuredSections blueprint={bp} />
            )
          ) : null}

          <div className="flex flex-col items-center justify-between gap-4 border-t border-border/50 pt-4 sm:flex-row">
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 size={16} className="text-brand" />
              {b.readyNote}
            </p>
            <MarketingBrandButton label={b.cta} onClick={onDeploy} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}