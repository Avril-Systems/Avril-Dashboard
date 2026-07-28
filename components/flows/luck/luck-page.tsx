'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { FlowShell } from '@/components/flows/shared/flow-shell';
import { useLanguage } from '@/components/marketing/language-context';
import { Eyebrow } from '@/components/patterns/eyebrow';
import { GlassPanel } from '@/components/patterns/glass-panel';
import { MarketingBrandButton } from '@/components/marketing/marketing-brand-button';
import { CosmicButton } from '@/components/ui/cosmic-button';
import { BlueprintPreview } from './blueprint-preview';
import { LoadingState } from './loading-state';
import { getMockOpportunities } from './mock-data';
import { OpportunityCard } from './opportunity-card';
import { DeployGate } from './deploy-gate';
import { FlowDashboard } from '@/components/flows/shared/flow-dashboard';
import { CompanyCreating } from '@/components/flows/shared/company-creating';
import { useSpawnFromOpportunity } from '@/src/hooks/useSpawnFromOpportunity';
import type { FlowStep, Opportunity } from './types';

const DASHBOARD_TOKEN = process.env.NEXT_PUBLIC_DASHBOARD_APP_TOKEN ?? '';

export function LuckPage() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const o = t.flow.opportunity;
  const [step, setStep] = useState<FlowStep>('hero');
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [linkedIdeaId, setLinkedIdeaId] = useState<string | null>(null);
  const [creatingIdeaId, setCreatingIdeaId] = useState<string | null>(null);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (DASHBOARD_TOKEN) headers['x-dashboard-token'] = DASHBOARD_TOKEN;
    return headers;
  }, []);

  const handleDeployComplete = useCallback((ideaId: string) => {
    setLinkedIdeaId(ideaId);
    setCreatingIdeaId(ideaId);
    setStep('creating');
  }, []);

  const { spawnedSessionId, spawnError } = useSpawnFromOpportunity({
    active: step === 'creating',
    opportunity: selectedOpportunity,
    ideaId: creatingIdeaId,
    authHeaders,
    intakeSource: 'rag_opportunity',
  });

  const startOpportunityFlow = useCallback(() => {
    setSelectedOpportunity(null);
    setLoadingMessageIndex(0);
    // RAG integration boundary: replace this mock source through a validated
    // server adapter. Contract: docs/CONTRATOS_INTEGRACION_FLUJOS.md.
    setOpportunities(getMockOpportunities(language));
    setStep('loading');
  }, [language]);

  useEffect(() => {
    if (step !== 'loading') return;

    const messageInterval = window.setInterval(() => {
      setLoadingMessageIndex((prev) => (prev < o.loading.length - 1 ? prev + 1 : prev));
    }, 500);

    const doneTimeout = window.setTimeout(() => {
      setStep('opportunities');
    }, 1500);

    return () => {
      window.clearInterval(messageInterval);
      window.clearTimeout(doneTimeout);
    };
  }, [step, o.loading.length]);

  const handleSelectOpportunity = (opportunity: Opportunity) => {
    setSelectedOpportunity(opportunity);
    setStep('blueprint');
  };

  const handleRestart = () => {
    setStep('hero');
    setSelectedOpportunity(null);
    setLinkedIdeaId(null);
    setCreatingIdeaId(null);
  };

  useEffect(() => {
    if (step !== 'creating' || !spawnedSessionId) return;
    router.push(`/agents/office?sessionId=${encodeURIComponent(spawnedSessionId)}`);
  }, [step, spawnedSessionId, router]);

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
            <CosmicButton
              as="button"
              type="button"
              onClick={startOpportunityFlow}
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
            <div className="grid gap-6 lg:grid-cols-3">
              {opportunities.map((opportunity, index) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  index={index}
                  onSelect={handleSelectOpportunity}
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
            {spawnError ? (
              <GlassPanel className="mx-auto max-w-md space-y-4 p-6 text-center">
                <h2 className="text-xl text-foreground">Almost there</h2>
                <p className="text-sm text-muted-foreground">
                  Your company <span className="text-brand">{selectedOpportunity.name}</span> was saved, but OpenClaw
                  spawn failed.
                </p>
                <p className="text-xs text-rose-300">{spawnError}</p>
                <MarketingBrandButton
                  label="Open Agent Office anyway"
                  href={
                    spawnedSessionId
                      ? `/agents/office?sessionId=${encodeURIComponent(spawnedSessionId)}`
                      : '/agents/office'
                  }
                  className="mx-auto"
                />
                <button
                  type="button"
                  onClick={() => setStep('dashboard')}
                  className="text-sm text-brand hover:underline"
                >
                  Continue to summary
                </button>
              </GlassPanel>
            ) : (
              <CompanyCreating
                companyName={selectedOpportunity.name}
                durationMs={12_000}
                onComplete={() => {
                  if (!spawnedSessionId && !spawnError) return;
                  if (!spawnedSessionId) setStep('dashboard');
                }}
              />
            )}
          </motion.div>
        )}

        {step === 'dashboard' && selectedOpportunity && (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
            <FlowDashboard
              companyName={selectedOpportunity.name}
              ideaId={linkedIdeaId ?? undefined}
              sessionId={spawnedSessionId ?? undefined}
              onRestart={handleRestart}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </FlowShell>
  );
}
