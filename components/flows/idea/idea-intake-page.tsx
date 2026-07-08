'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FlowShell } from '@/components/flows/shared/flow-shell';
import { useLanguage } from '@/components/marketing/language-context';
import { Eyebrow } from '@/components/patterns/eyebrow';
import { LoadingState } from '@/components/flows/luck/loading-state';
import { BlueprintPreview } from '@/components/flows/luck/blueprint-preview';
import { DeployGate } from '@/components/flows/luck/deploy-gate';
import { FlowDashboard } from '@/components/flows/shared/flow-dashboard';
import { CompanyCreating } from '@/components/flows/shared/company-creating';
import { buildIdeaOpportunity } from '@/components/flows/luck/mock-data';
import type { FlowStep, Opportunity } from '@/components/flows/luck/types';

export function IdeaIntakePage() {
  const { t, language } = useLanguage();
  const i = t.flow.idea;
  const [step, setStep] = useState<FlowStep>('hero');
  const [loadingIndex, setLoadingIndex] = useState(0);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [linkedIdeaId, setLinkedIdeaId] = useState<string | null>(null);
  const [form, setForm] = useState({
    companyName: '',
    rawIdea: '',
    targetCustomer: '',
    problem: '',
  });

  const startBrief = useCallback(() => {
    setLoadingIndex(0);
    setStep('loading');
  }, []);

  useEffect(() => {
    if (step !== 'loading') return;

    const messageInterval = window.setInterval(() => {
      setLoadingIndex((prev) => (prev < i.loading.length - 1 ? prev + 1 : prev));
    }, 500);

    const doneTimeout = window.setTimeout(() => {
      setOpportunity(
        buildIdeaOpportunity(language, {
          companyName: form.companyName,
          rawIdea: form.rawIdea,
          targetCustomer: form.targetCustomer,
          problem: form.problem,
        })
      );
      setStep('blueprint');
    }, 1500);

    return () => {
      window.clearInterval(messageInterval);
      window.clearTimeout(doneTimeout);
    };
  }, [step, i.loading.length, language, form]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.rawIdea.trim()) return;
    startBrief();
  }

  function handleRestart() {
    setStep('hero');
    setOpportunity(null);
    setLinkedIdeaId(null);
    setForm({ companyName: '', rawIdea: '', targetCustomer: '', problem: '' });
  }

  return (
    <FlowShell>
      <AnimatePresence mode="wait">
        {step === 'hero' && (
          <motion.div
            key="intake"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="w-full max-w-xl space-y-8"
          >
            <div className="space-y-4 text-center">
              <Eyebrow>{i.eyebrow}</Eyebrow>
              <h1 className="text-3xl tracking-tight md:text-4xl">{i.title}</h1>
              <p className="text-muted-foreground">{i.subtitle}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field
                label={i.fields.companyName}
                placeholder={i.placeholders.companyName}
                value={form.companyName}
                onChange={(v) => setForm((s) => ({ ...s, companyName: v }))}
              />
              <Field
                label={i.fields.rawIdea}
                placeholder={i.placeholders.rawIdea}
                value={form.rawIdea}
                onChange={(v) => setForm((s) => ({ ...s, rawIdea: v }))}
                multiline
                required
              />
              <Field
                label={i.fields.targetCustomer}
                placeholder={i.placeholders.targetCustomer}
                value={form.targetCustomer}
                onChange={(v) => setForm((s) => ({ ...s, targetCustomer: v }))}
              />
              <Field
                label={i.fields.problem}
                placeholder={i.placeholders.problem}
                value={form.problem}
                onChange={(v) => setForm((s) => ({ ...s, problem: v }))}
                multiline
              />
              <div className="flex justify-center pt-2">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 font-heading text-sm font-medium tracking-wide bg-brand text-white shadow-[0_0_24px_rgba(0,153,175,0.35)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {i.cta}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {step === 'loading' && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LoadingState message={i.loading[loadingIndex]} />
          </motion.div>
        )}

        {step === 'blueprint' && opportunity && (
          <motion.div key="blueprint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
            <BlueprintPreview
              opportunity={opportunity}
              onBack={handleRestart}
              onDeploy={() => setStep('deploy')}
              showBack={false}
            />
          </motion.div>
        )}

        {step === 'deploy' && opportunity && (
          <motion.div key="deploy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
            <DeployGate
              opportunity={opportunity}
              flowSource="idea"
              onRestart={handleRestart}
              onComplete={(ideaId) => {
                setLinkedIdeaId(ideaId);
                setStep('creating');
              }}
            />
          </motion.div>
        )}

        {step === 'creating' && opportunity && (
          <motion.div key="creating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
            <CompanyCreating companyName={opportunity.name} onComplete={() => setStep('dashboard')} />
          </motion.div>
        )}

        {step === 'dashboard' && opportunity && (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
            <FlowDashboard
              companyName={opportunity.name}
              ideaId={linkedIdeaId ?? undefined}
              onRestart={handleRestart}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </FlowShell>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  multiline,
  required,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  required?: boolean;
}) {
  const className =
    'w-full rounded-xl border border-border/70 bg-surface/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-brand/50 focus:outline-none';

  return (
    <label className="block space-y-1.5 text-left">
      <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea
          className={`${className} min-h-24 resize-y`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
      ) : (
        <input
          className={className}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
      )}
    </label>
  );
}
