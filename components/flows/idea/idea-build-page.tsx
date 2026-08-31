'use client';
import { LiquidMetalShape } from '@/components/ui/liquid-metal-shape';
import { avrilColors } from '@/lib/avril-tokens';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Network, Sparkles, Fingerprint, Lightbulb, MessageSquare } from 'lucide-react';
import { FlowShell } from '@/components/flows/shared/flow-shell';
import { Eyebrow } from '@/components/patterns/eyebrow';
import { GlassPanel } from '@/components/patterns/glass-panel';
import { MarketingBrandButton } from '@/components/marketing/marketing-brand-button';
import { useLanguage } from '@/components/marketing/language-context';
import { AnimatedAIChat } from '@/components/ui/animated-ai-chat';
import { FounderWizard, type WizardAnswers } from '@/components/founder/FounderWizard';
import { LoadingState } from '@/components/flows/luck/loading-state';
import { BlueprintPreview } from '@/components/flows/luck/blueprint-preview';
import { DeployGate } from '@/components/flows/luck/deploy-gate';
import { CompanyCreating } from '@/components/flows/shared/company-creating';
import { FlowDashboard } from '@/components/flows/shared/flow-dashboard';
import { buildOpportunityFromWizard } from '@/components/flows/luck/mock-data';
import type { Opportunity } from '@/components/flows/luck/types';
import { useWaaP } from '@/src/components/WaaPProvider';
import { signInWithWallet } from '@/src/lib/establishWalletSession';
import { useSpawnFromOpportunity } from '@/src/hooks/useSpawnFromOpportunity';
import {
  clearFlowDraft,
  clearIdeaIntakeDrafts,
  clearWizardDraft,
  readFlowDraft,
  writeFlowDraft,
} from '@/src/lib/ideaIntakeDraft';
import { IdeaGenerationErrorState } from './idea-generation-error-state';

const DASHBOARD_TOKEN = process.env.NEXT_PUBLIC_DASHBOARD_APP_TOKEN ?? '';

const CHOOSER_PILLARS = [
  {
    icon: <Network className="h-4 w-4 shrink-0 text-brand" aria-hidden />,
    title: 'Orchestration',
    body: 'OpenClaw bridge, 3-swarm guardrails, and a hard cap on agents—then jump into the live office for the session.',
  },
  {
    icon: <Sparkles className="h-4 w-4 shrink-0 text-brand" aria-hidden />,
    title: 'Vibe founding',
    body: 'Wizard and Venice chat capture your story; when ignition is ready, one tap sends it to production runtime.',
  },
  {
    icon: <Fingerprint className="h-4 w-4 shrink-0 text-brand" aria-hidden />,
    title: 'Identity',
    body: 'Wallet-native Human.tech sessions, optional Passport scores, and onchain ERC-8004 agent registration on Celo.',
  },
] as const;

type EntryMode = 'form' | 'chat';
type FormStep = 'wizard' | 'loading' | 'blueprint' | 'deploy' | 'creating' | 'dashboard';

function IdeaBuildPageContent() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const i = t.flow.idea;
  const { isReady, isAuthenticated, login, refreshWalletSession } = useWaaP();
  const [entryMode, setEntryMode] = useState<EntryMode | null>(null);
  const [formStep, setFormStep] = useState<FormStep>('wizard');
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [linkedIdeaId, setLinkedIdeaId] = useState<string | null>(null);
  const [loadingIndex, setLoadingIndex] = useState(0);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [lastAnswers, setLastAnswers] = useState<WizardAnswers | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [flowReady, setFlowReady] = useState(false);
  const [creatingIdeaId, setCreatingIdeaId] = useState<string | null>(null);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (DASHBOARD_TOKEN) headers['x-dashboard-token'] = DASHBOARD_TOKEN;
    return headers;
  }, []);

  const handleDeployComplete = useCallback((ideaId: string) => {
    setLinkedIdeaId(ideaId);
    setCreatingIdeaId(ideaId);
    setFormStep('creating');
  }, []);

  const { spawnedSessionId, spawnError } = useSpawnFromOpportunity({
    active: formStep === 'creating',
    opportunity,
    ideaId: creatingIdeaId,
    authHeaders,
    intakeSource: 'form_intake',
  });

  useEffect(() => {
    const draft = readFlowDraft();
    if (draft) {
      if (draft.entryMode === 'form' || draft.entryMode === 'chat') {
        setEntryMode(draft.entryMode);
      }
      if (
        draft.formStep &&
        draft.formStep !== 'loading' &&
        ['wizard', 'blueprint', 'deploy', 'creating', 'dashboard'].includes(draft.formStep)
      ) {
        setFormStep(draft.formStep);
      }
      if (draft.opportunity && typeof draft.opportunity === 'object') {
        setOpportunity(draft.opportunity as Opportunity);
      }
      if (typeof draft.linkedIdeaId === 'string') {
        setLinkedIdeaId(draft.linkedIdeaId);
      }
    }
    setFlowReady(true);
  }, []);

  useEffect(() => {
    if (!flowReady) return;
    // Don't persist mid-loading flash; treat as wizard for drafts.
    const stepToStore: FormStep = formStep === 'loading' ? 'wizard' : formStep;
    writeFlowDraft({
      entryMode,
      formStep: stepToStore,
      opportunity: opportunity ?? undefined,
      linkedIdeaId,
    });
  }, [entryMode, formStep, opportunity, linkedIdeaId, flowReady]);

  async function handleSignIn() {
    setSigningIn(true);
    setSignInError(null);
    try {
      await signInWithWallet(login);
      await refreshWalletSession();
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setSigningIn(false);
    }
  }

  const resetFormFlow = useCallback(() => {
    setFormStep('wizard');
    setOpportunity(null);
    setLinkedIdeaId(null);
    setCreatingIdeaId(null);
    setGenerateError(null);
    setLoadingIndex(0);
  }, []);

  const clearAllDrafts = useCallback(() => {
    clearIdeaIntakeDrafts();
    resetFormFlow();
  }, [resetFormFlow]);

const handleWizardGenerate = useCallback(
    async (answers: WizardAnswers) => {
      setGenerateError(null);
      setLoadingIndex(0);
      setFormStep('loading');
      setLastAnswers(answers);

      const context = [
        `Company: ${answers.companyName}`,
        `Founder: ${answers.founderName}`,
        `Country: ${answers.country}`,
        `Language: ${answers.language}`,
        `Idea: ${answers.rawIdea}`,
        `Problem: ${answers.problem}`,
        `Target user: ${answers.targetUser}`,
        `Monetization: ${answers.monetization}`,
        `Business model: ${answers.businessModel}`,
        `Risk tolerance: ${answers.riskTolerance}`,
        `Automation level: ${answers.automationLevel}`,
        `Time available: ${answers.timeAvailable}`,
        `Skills/resources: ${answers.skillsResources}`,
        `Channels: ${answers.channels}`,
      ].join('\n');

      let summaryOverride: string | undefined;
      try {
        const res = await fetch('/api/chat/folder-profile-prompt', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            profile: answers.riskTolerance || 'balanced',
            context,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { prompt?: string; error?: { message?: string } };

        if (!res.ok || typeof data.prompt !== 'string' || !data.prompt.trim()) {
          setGenerateError(
            data.error?.message ||
              "Avril couldn't turn your idea into a clear blueprint. Add more detail, or edit what you already wrote."
          );
          setFormStep('wizard');
          return;
        }

        const firstParagraph =
          data.prompt
            .replace(/^#.*$/m, '')
            .split(/\n\n+/)
            .map((p) => p.trim())
            .find((p) => p.length > 40) || data.prompt.trim();
        summaryOverride = firstParagraph.slice(0, 420);
      } catch {
        setGenerateError("Avril couldn't reach Venice to generate your blueprint. Check your connection and try again.");
        setFormStep('wizard');
        return;
      }

      const next = buildOpportunityFromWizard(language, answers, { summaryOverride });
      setOpportunity(next);
      setFormStep('blueprint');
    },
    [authHeaders, language]
  );

  useEffect(() => {
    if (formStep !== 'loading') return;
    const messages = i.loading;
    const id = window.setInterval(() => {
      setLoadingIndex((prev) => (prev < messages.length - 1 ? prev + 1 : prev));
    }, 700);
    return () => window.clearInterval(id);
  }, [formStep, i.loading]);

  // Jump into the new office as soon as spawn returns.
  useEffect(() => {
    if (formStep !== 'creating' || !spawnedSessionId) return;
    clearIdeaIntakeDrafts();
    router.push(`/agents/office?sessionId=${encodeURIComponent(spawnedSessionId)}`);
  }, [formStep, spawnedSessionId, router]);

  if (!flowReady) {
    return (
      <FlowShell>
        <p className="text-sm text-muted-foreground">Loading your draft…</p>
      </FlowShell>
    );
  }

  if (!entryMode) {
    return (
      <FlowShell>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex w-full max-w-3xl flex-col items-center gap-10 text-center"
        >
          <div className="space-y-4">
            <Image
              src="/Avril.png"
              alt="Avril logo"
              width={140}
              height={48}
              className="mx-auto opacity-95"
              priority
            />
            <Eyebrow pulse>{i.eyebrow}</Eyebrow>
            <h1 className="text-balance text-3xl leading-[1.05] tracking-tight md:text-4xl lg:text-5xl">
              Founder ignition → live agent orchestration
            </h1>
            <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Avril turns your idea into a business blueprint, then hands off to OpenClaw with swarm guardrails. Choose
              Form or Chat to capture your idea.
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-3">
            {CHOOSER_PILLARS.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + index * 0.06, duration: 0.35 }}
              >
                <GlassPanel className="h-full space-y-2 p-4">
                  <div className="flex items-center gap-2">
                    {item.icon}
                    <span className="text-xs font-semibold tracking-tight text-foreground">{item.title}</span>
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground sm:text-xs">{item.body}</p>
                </GlassPanel>
              </motion.div>
            ))}
          </div>

          <div className="w-full space-y-4">
            <p className="text-sm text-muted-foreground">Choose how you want to capture your idea.</p>
            <div className="grid w-full gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  resetFormFlow();
                  setEntryMode('form');
                }}
                className="rounded-2xl border border-border bg-surface/40 px-5 py-8 text-left transition-colors hover:border-brand/40 hover:bg-brand/5"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-raised">
                  <Lightbulb size={18} className="text-brand" />
                </div>
                <p className="text-xl text-foreground">Form</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Wizard intake → business blueprint review → deploy.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('chat')}
                className="rounded-2xl border border-border bg-surface/40 px-5 py-8 text-left transition-colors hover:border-brand/40 hover:bg-brand/5"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-raised">
                  <MessageSquare size={18} className="text-brand" />
                </div>
                <p className="text-xl text-foreground">Chat</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Talk with Avril. Structured ignition syncs to Convex, then send to OpenClaw.
                </p>
              </button>
            </div>
          </div>
        </motion.div>
      </FlowShell>
    );
  }

  const needsSignIn = isReady && !isAuthenticated;

  if (entryMode === 'chat') {
    return (
      <FlowShell>
        <div className="flex w-full max-w-4xl flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setEntryMode(null)}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Change Form / Chat
            </button>
            <p className="text-xs capitalize text-muted-foreground">Mode: chat</p>
          </div>

          {needsSignIn ? (
            <GlassPanel className="mx-auto w-full max-w-md space-y-4 p-6 text-center">
              <h2 className="text-xl text-foreground">Sign in to continue</h2>
              <p className="text-sm text-muted-foreground">
                Chat needs a wallet session to save ignition and hand off to OpenClaw.
              </p>
              {signInError ? <p className="text-xs text-rose-300">{signInError}</p> : null}
              <MarketingBrandButton
                label={signingIn ? 'Signing in…' : 'Sign in with wallet'}
                onClick={() => void handleSignIn()}
                disabled={signingIn}
                className="mx-auto"
              />
            </GlassPanel>
          ) : (
            <AnimatedAIChat initialViewMode="chat" hideModeToggle hideHeader variant="marketing" hideFolder />
          )}
        </div>
      </FlowShell>
    );
  }

// Form path — same review/deploy UX as Generate opportunities
  return (
    <FlowShell>
      <div className="relative flex w-full flex-col items-center">
{formStep === 'wizard' && (
          <LiquidMetalShape
            variant="rings"
            className="pointer-events-none fixed -top-32 -right-32 z-0 hidden h-[420px] w-[420px] opacity-55 lg:block xl:h-[500px] xl:w-[500px]"
            colorTint={avrilColors.brand}
            speed={0.4}
            scale={0.85}
          />
        )}
        {formStep === 'blueprint' && (
          <LiquidMetalShape
            variant="orbs"
            className="pointer-events-none fixed -bottom-16 -left-20 z-0 hidden h-[420px] w-[240px] opacity-60 lg:block xl:h-[480px] xl:w-[280px]"
            colorTint={avrilColors.brand}
            speed={0.5}
            scale={0.78}
          />
        )}
        {formStep === 'blueprint' && (
          <LiquidMetalShape
            variant="orbs"
            className="pointer-events-none fixed -bottom-16 -left-20 z-0 hidden h-[420px] w-[240px] opacity-60 lg:block xl:h-[480px] xl:w-[280px]"
            colorTint={avrilColors.brand}
            speed={0.5}
            scale={0.78}
          />
        )}
        {formStep === 'dashboard' && (
          <LiquidMetalShape
            variant="orbs"
            className="pointer-events-none fixed -bottom-16 -right-20 z-0 hidden h-[420px] w-[240px] opacity-60 lg:block xl:h-[480px] xl:w-[280px]"
            colorTint={avrilColors.brand}
            speed={0.5}
            scale={0.78}
          />
        )}
        <div className="flex w-full max-w-4xl flex-col gap-5">
        {formStep === 'wizard' || formStep === 'loading' ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                resetFormFlow();
                setEntryMode(null);
              }}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Change Form / Chat
            </button>
            <p className="text-xs capitalize text-muted-foreground">Mode: form</p>
          </div>
        ) : null}

        {needsSignIn ? (
          <GlassPanel className="mx-auto w-full max-w-md space-y-4 p-6 text-center">
            <h2 className="text-xl text-foreground">Sign in to continue</h2>
            <p className="text-sm text-muted-foreground">
              Form needs a wallet session to save your blueprint and continue to deploy.
            </p>
            {signInError ? <p className="text-xs text-rose-300">{signInError}</p> : null}
            <MarketingBrandButton
              label={signingIn ? 'Signing in…' : 'Sign in with wallet'}
              onClick={() => void handleSignIn()}
              disabled={signingIn}
              className="mx-auto"
            />
          </GlassPanel>
        ) : (
          <AnimatePresence mode="wait">
{formStep === 'wizard' && (
              <motion.div
                key="wizard"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="w-full"
              >
                {generateError ? (
                  <IdeaGenerationErrorState
                    description={generateError}
                    onEditIdea={() => setGenerateError(null)}
                    onTryAgain={() => {
                      if (lastAnswers) void handleWizardGenerate(lastAnswers);
                    }}
                  />
                ) : (
                  <FounderWizard onGenerate={(answers) => void handleWizardGenerate(answers)} />
                )}
              </motion.div>
            )}
            {formStep === 'loading' && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <LoadingState message={i.loading[loadingIndex] ?? i.loading[0]} />
              </motion.div>
            )}

            {formStep === 'blueprint' && opportunity && (
              <motion.div key="blueprint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
                <BlueprintPreview
                  opportunity={opportunity}
                  onBack={() => setFormStep('wizard')}
                  onDeploy={() => setFormStep('deploy')}
                  showBack
                  useNavbarGlassBackground
                />
              </motion.div>
            )}

            {formStep === 'deploy' && opportunity && (
              <motion.div key="deploy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
                <DeployGate
                  opportunity={opportunity}
                  flowSource="idea"
                  onRestart={() => {
                    clearWizardDraft();
                    clearFlowDraft();
                    resetFormFlow();
                  }}
                  onComplete={handleDeployComplete}
                />
              </motion.div>
            )}

            {formStep === 'creating' && opportunity && (
              <motion.div key="creating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
                {spawnError ? (
                  <GlassPanel className="mx-auto max-w-md space-y-4 p-6 text-center">
                    <h2 className="text-xl text-foreground">Almost there</h2>
                    <p className="text-sm text-muted-foreground">
                      Your company <span className="text-brand">{opportunity.name}</span> was saved, but OpenClaw
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
                      onClick={() => setFormStep('dashboard')}
                      className="text-sm text-brand hover:underline"
                    >
                      Continue to summary
                    </button>
                  </GlassPanel>
                ) : (
                  <CompanyCreating
                    companyName={opportunity.name}
                    durationMs={12_000}
                    onComplete={() => {
                      // Spawn redirect handles success; if still pending, keep waiting via animation loop.
                      if (!spawnedSessionId && !spawnError) return;
                      if (!spawnedSessionId) setFormStep('dashboard');
                    }}
                  />
                )}
              </motion.div>
            )}

            {formStep === 'dashboard' && opportunity && (
              <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
                <FlowDashboard
                  companyName={opportunity.name}
                  ideaId={linkedIdeaId ?? undefined}
                  sessionId={spawnedSessionId ?? undefined}
                  onRestart={() => {
                    clearAllDrafts();
                    setCreatingIdeaId(null);
                    setEntryMode(null);
                  }}
                />
              </motion.div>
            )}
</AnimatePresence>
        )}
        </div>
      </div>
    </FlowShell>
  );
}

export function IdeaBuildPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
      <IdeaBuildPageContent />
    </Suspense>
  );
}
