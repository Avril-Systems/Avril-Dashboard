'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { FlowShell } from '@/components/flows/shared/flow-shell';
import { useLanguage } from '@/components/marketing/language-context';
import { Eyebrow } from '@/components/patterns/eyebrow';
import { CosmicButton } from '@/components/ui/cosmic-button';
import { BlueprintPreview } from './blueprint-preview';
import { LoadingState } from './loading-state';
import { OpportunityCard } from './opportunity-card';
import { DeployGate } from './deploy-gate';
import { FlowDashboard } from '@/components/flows/shared/flow-dashboard';
import { CompanyCreating } from '@/components/flows/shared/company-creating';
import type { FlowStep, Opportunity } from './types';

export function LuckPage() {
  const { t, language } = useLanguage();
  const o = t.flow.opportunity;
  const [step, setStep] = useState<FlowStep>('hero');
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [bankEmpty, setBankEmpty] = useState(false);
  const [linkedIdeaId, setLinkedIdeaId] = useState<string | null>(null);
  const [creatingIdeaId, setCreatingIdeaId] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);

  const handleDeployComplete = useCallback((ideaId: string) => {
    setLinkedIdeaId(ideaId);
    setCreatingIdeaId(ideaId);
    setStep('creating');
  }, []);

  // Ciclo de mensajes rotativos mientras step === 'loading' o 'loading-blueprint'.
  useEffect(() => {
    if (step !== 'loading' && step !== 'loading-blueprint') return;

    const messageInterval = window.setInterval(() => {
      setLoadingMessageIndex((prev) => (prev < o.loading.length - 1 ? prev + 1 : prev));
    }, 500);

    return () => {
      window.clearInterval(messageInterval);
    };
  }, [step, o.loading.length]);

  const startOpportunityFlow = useCallback(async () => {
    setSelectedOpportunity(null);
    setFlowError(null);
    setBankEmpty(false);
    setLoadingMessageIndex(0);
    setStep('loading');

    try {
      const simulate = new URLSearchParams(window.location.search).get('simulate');
      const qs = simulate ? `?simulate=${encodeURIComponent(simulate)}` : '';
      const res = await fetch(`/api/opportunities/generate${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json()) as {
        ok?: boolean;
        opportunities?: Opportunity[];
        bankEmpty?: boolean;
        error?: { message?: string };
      };

      if (!res.ok || !data.ok || !data.opportunities) {
        throw new Error(data.error?.message || 'Could not generate opportunities');
      }

      if (data.bankEmpty || data.opportunities.length === 0) {
        setBankEmpty(true);
        setOpportunities([]);
        setStep('empty-bank');
        toast.warning(
          language === 'es'
            ? 'No quedan ideas disponibles en este momento.'
            : 'No opportunities are available right now.',
          { description: 'Vuelve a intentarlo en un momento.' }
        );
        return;
      }

      setOpportunities(data.opportunities);
      setStep('opportunities');
    } catch (err) {
      setFlowError(err instanceof Error ? err.message : 'Could not generate opportunities');
      setStep('hero');
    }
  }, [language]);

  const handleSelectOpportunity = useCallback(async (opportunity: Opportunity) => {
    setSelectedOpportunity(opportunity);
    setFlowError(null);
    setLoadingMessageIndex(0);
    setStep('loading-blueprint');

    try {
      const res = await fetch(`/api/opportunities/${encodeURIComponent(opportunity.id)}/blueprint`);
      const data = (await res.json()) as {
        ok?: boolean;
        blueprint?: { markdown: string };
        error?: { message?: string };
      };

      if (!res.ok || !data.ok || !data.blueprint) {
        throw new Error(data.error?.message || 'Could not fetch blueprint');
      }

      setSelectedOpportunity({ ...opportunity, blueprint: data.blueprint });
      setStep('blueprint');
    } catch (err) {
      setFlowError(err instanceof Error ? err.message : 'Could not fetch blueprint');
      setStep('opportunities');
    }
  }, []);

  const handleRestart = () => {
    setStep('hero');
    setSelectedOpportunity(null);
    setLinkedIdeaId(null);
    setCreatingIdeaId(null);
    setFlowError(null);
    setBankEmpty(false);
  };

  return (
    <FlowShell>
      <AnimatePresence mode="wait">
        {step === 'hero' && (
          <motion.div
            key="hero"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4 }}
            className="flex max-w-2xl flex-col items-center gap-8 text-center"
          >
            <Eyebrow pulse>{o.eyebrow}</Eyebrow>
            <div className="space-y-4">
              <h1 className="text-balance text-4xl leading-[1.05] tracking-tight md:text-5xl lg:text-6xl">
                {o.title}
              </h1>
              <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">{o.subtitle}</p>
            </div>
            {flowError && <p className="text-sm text-rose-400">{flowError}</p>}
            <CosmicButton
              as="button"
              type="button"
              onClick={() => void startOpportunityFlow()}
              className="w-full max-w-xs sm:w-auto"
            >
              {o.cta}
            </CosmicButton>
          </motion.div>
        )}

        {step === 'loading' && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LoadingState message={o.loading[loadingMessageIndex]} />
          </motion.div>
        )}

        {step === 'loading-blueprint' && (
          <motion.div key="loading-blueprint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LoadingState message={o.loading[loadingMessageIndex]} />
          </motion.div>
        )}

        {step === 'empty-bank' && (
          <motion.div
            key="empty-bank"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-auto max-w-md space-y-6 text-center"
          >
            <div className="space-y-3">
              <p className="font-heading text-xs font-medium uppercase tracking-[0.14em] text-brand">
                {o.resultsEyebrow}
              </p>
              <h2 className="text-3xl tracking-tight md:text-4xl">
                {language === 'es' ? 'Hoy no quedan ideas' : 'No ideas left today'}
              </h2>
              <p className="text-muted-foreground">
                {language === 'es'
                  ? 'El banco de oportunidades está temporalmente agotado. Vuelve a intentarlo en un momento.'
                  : 'The opportunity bank is temporarily empty. Try again in a moment.'}
              </p>
            </div>
            {flowError && <p className="text-sm text-rose-400">{flowError}</p>}
            <div className="flex justify-center">
              <CosmicButton
                as="button"
                type="button"
                onClick={() => void startOpportunityFlow()}
                className="w-full max-w-xs sm:w-auto "
              >
                {language === 'es' ? 'Reintentar' : 'Try again'}
              </CosmicButton>
            </div>
          </motion.div>
        )}

        {step === 'opportunities' && (
          <motion.div
            key="opportunities"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="w-full space-y-8"
          >
            <div className="mx-auto max-w-2xl space-y-3 text-center">
              <p className="font-heading text-xs font-medium uppercase tracking-[0.14em] text-brand">{o.resultsEyebrow}</p>
              <h2 className="text-3xl tracking-tight md:text-4xl">{o.resultsTitle}</h2>
              <p className="text-muted-foreground">{o.resultsSubtitle}</p>
            </div>
            {flowError && <p className="text-center text-sm text-rose-400">{flowError}</p>}
            <div className="grid gap-6 lg:grid-cols-3">
              {opportunities.map((opportunity, index) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  index={index}
                  onSelect={(opp) => void handleSelectOpportunity(opp)}
                />
              ))}
            </div>
          </motion.div>
        )}

        {step === 'blueprint' && selectedOpportunity && (
          <motion.div key="blueprint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
            <BlueprintPreview
              opportunity={selectedOpportunity}
              onBack={() => setStep('opportunities')}
              onDeploy={() => setStep('deploy')}
            />
          </motion.div>
        )}

        {step === 'deploy' && selectedOpportunity && (
          <motion.div key="deploy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
            <DeployGate
              opportunity={selectedOpportunity}
              flowSource="opportunity"
              onRestart={handleRestart}
              onComplete={handleDeployComplete}
            />
          </motion.div>
        )}

        {step === 'creating' && selectedOpportunity && (
          <motion.div key="creating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
            <CompanyCreating
              companyName={selectedOpportunity.name}
              durationMs={12_000}
              onComplete={() => setStep('dashboard')}
            />
          </motion.div>
        )}

        {step === 'dashboard' && selectedOpportunity && (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
            <FlowDashboard
              companyName={selectedOpportunity.name}
              ideaId={linkedIdeaId ?? undefined}
              onRestart={handleRestart}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </FlowShell>
  );
}