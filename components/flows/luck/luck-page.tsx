'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FlowShell } from '@/components/flows/shared/flow-shell';
import { useLanguage } from '@/components/marketing/language-context';
import { Eyebrow } from '@/components/patterns/eyebrow';
import { CosmicButton } from '@/components/ui/cosmic-button';
import { BlueprintPreview } from './blueprint-preview';
import { LoadingState } from './loading-state';
import { getMockOpportunities } from './mock-data';
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
  const [linkedIdeaId, setLinkedIdeaId] = useState<string | null>(null);

  const startOpportunityFlow = useCallback(() => {
    setSelectedOpportunity(null);
    setLoadingMessageIndex(0);
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
            <CosmicButton
              as="button"
              type="button"
              onClick={startOpportunityFlow}
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
              onComplete={(ideaId) => {
                setLinkedIdeaId(ideaId);
                setStep('creating');
              }}
            />
          </motion.div>
        )}

        {step === 'creating' && selectedOpportunity && (
          <motion.div key="creating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
            <CompanyCreating
              companyName={selectedOpportunity.name}
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
