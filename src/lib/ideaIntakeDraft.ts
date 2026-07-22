import type { WizardAnswers } from '@/components/founder/FounderWizard';

const WIZARD_KEY = 'avril:idea-intake:wizard';
const FLOW_KEY = 'avril:idea-intake:flow';

export type IdeaFlowDraft = {
  entryMode: 'form' | 'chat' | null;
  formStep: 'wizard' | 'loading' | 'blueprint' | 'deploy' | 'creating' | 'dashboard';
  opportunity?: unknown;
  linkedIdeaId?: string | null;
  updatedAt: number;
};

export type WizardDraft = {
  answers: WizardAnswers;
  step: number;
  showAdvanced?: boolean;
  updatedAt: number;
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readWizardDraft(): WizardDraft | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(WIZARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardDraft;
    if (!parsed?.answers || typeof parsed.answers !== 'object') return null;
    if (typeof parsed.step !== 'number' || parsed.step < 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeWizardDraft(draft: Omit<WizardDraft, 'updatedAt'>): void {
  if (!canUseStorage()) return;
  try {
    const payload: WizardDraft = { ...draft, updatedAt: Date.now() };
    window.localStorage.setItem(WIZARD_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function clearWizardDraft(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(WIZARD_KEY);
  } catch {
    // ignore
  }
}

export function readFlowDraft(): IdeaFlowDraft | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(FLOW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IdeaFlowDraft;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeFlowDraft(draft: Omit<IdeaFlowDraft, 'updatedAt'>): void {
  if (!canUseStorage()) return;
  try {
    const payload: IdeaFlowDraft = { ...draft, updatedAt: Date.now() };
    window.localStorage.setItem(FLOW_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function clearFlowDraft(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(FLOW_KEY);
  } catch {
    // ignore
  }
}

export function clearIdeaIntakeDrafts(): void {
  clearWizardDraft();
  clearFlowDraft();
}
