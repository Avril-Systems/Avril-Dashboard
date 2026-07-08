'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CosmicButton } from '@/components/ui/cosmic-button';
import { Eyebrow } from '@/components/patterns/eyebrow';
import { SectionBackdrop } from '@/components/patterns/section-backdrop';
import { BlueprintPreview } from './blueprint-preview';
import { LoadingState } from './loading-state';
import { LOADING_MESSAGES, MOCK_OPPORTUNITIES } from './mock-data';
import { OpportunityCard } from './opportunity-card';
import { DeployGate } from './deploy-gate';
import type { LuckStep, Opportunity } from './types';

export function LuckPage() {
  const [step, setStep] = useState<LuckStep>('hero');
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [deployed, setDeployed] = useState(false);

  const startLuckFlow = useCallback(() => {
    setDeployed(false);
    setSelectedOpportunity(null);
    setLoadingMessageIndex(0);
    setStep('loading');
  }, []);

  useEffect(() => {
    if (step !== 'loading') return;

    const messageInterval = window.setInterval(() => {
      setLoadingMessageIndex((prev) => (prev < LOADING_MESSAGES.length - 1 ? prev + 1 : prev));
    }, 500);

    const doneTimeout = window.setTimeout(() => {
      setStep('opportunities');
    }, 1500);

    return () => {
      window.clearInterval(messageInterval);
      window.clearTimeout(doneTimeout);
    };
  }, [step]);

  const handleSelectOpportunity = (opportunity: Opportunity) => {
    setSelectedOpportunity(opportunity);
    setStep('blueprint');
  };

  const handleDeploy = () => {
    setDeployed(true);
  };

  return (
    <SectionBackdrop variant="hero" className="min-h-screen bg-[var(--avril-canvas)] text-foreground">
      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 md:py-12">
        <header className="mb-10 flex items-center justify-between md:mb-14">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={16} />
            Back to home
          </Link>
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/80">Avril · Generate</span>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center pb-12">
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
                <Eyebrow pulse>Opportunity generation</Eyebrow>
                <div className="space-y-4">
                  <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl lg:text-6xl">
                    Generate your next <span className="text-brand">agentic company</span>
                  </h1>
                  <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                    Press the button and receive three blueprints ready to evaluate. No account required yet.
                  </p>
                </div>
                <CosmicButton
                  as="button"
                  type="button"
                  onClick={startLuckFlow}
                  className="[&>span:nth-child(3)]:bg-black [&>span:nth-child(3)_span]:text-white"
                >
                  I&apos;m feeling lucky
                </CosmicButton>
              </motion.div>
            )}

            {step === 'loading' && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <LoadingState message={LOADING_MESSAGES[loadingMessageIndex]} />
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
                  <p className="text-xs font-medium uppercase tracking-widest text-brand">3 opportunities detected</p>
                  <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Choose your next company</h2>
                  <p className="text-muted-foreground">Each card is a different blueprint. Select one to see the deploy plan.</p>
                </div>
                <div className="grid gap-6 lg:grid-cols-3">
                  {MOCK_OPPORTUNITIES.map((opportunity, index) => (
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
                {deployed ? (
                  <DeployGate opportunity={selectedOpportunity} onRestart={startLuckFlow} />
                ) : (
                  <BlueprintPreview
                    opportunity={selectedOpportunity}
                    onBack={() => setStep('opportunities')}
                    onDeploy={handleDeploy}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </SectionBackdrop>
  );
}
