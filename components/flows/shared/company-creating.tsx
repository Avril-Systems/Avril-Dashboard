'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Cloud, FileText, LayoutDashboard, Shield } from 'lucide-react';
import { CircuitBoard } from '@/components/ui/circuit-board';
import { useLanguage } from '@/components/marketing/language-context';
import { avrilColors } from '@/lib/avril-tokens';

type CompanyCreatingProps = {
  companyName: string;
  onComplete: () => void;
  durationMs?: number;
};

type NodeStatus = 'inactive' | 'processing' | 'active';

export function CompanyCreating({ companyName, onComplete, durationMs = 5200 }: CompanyCreatingProps) {
  const { t } = useLanguage();
  const c = t.flow.creating;
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [nodePhase, setNodePhase] = useState(0);

  const phases = c.phases;

  useEffect(() => {
    const phaseInterval = window.setInterval(() => {
      setPhaseIndex((prev) => (prev < phases.length - 1 ? prev + 1 : prev));
    }, durationMs / phases.length);

    const nodeInterval = window.setInterval(() => {
      setNodePhase((prev) => (prev < 4 ? prev + 1 : prev));
    }, durationMs / 5);

    const doneTimeout = window.setTimeout(() => {
      onComplete();
    }, durationMs);

    return () => {
      window.clearInterval(phaseInterval);
      window.clearInterval(nodeInterval);
      window.clearTimeout(doneTimeout);
    };
  }, [durationMs, onComplete, phases.length]);

  const nodeStatus = (index: number): NodeStatus => {
    if (nodePhase > index) return 'active';
    if (nodePhase === index) return 'processing';
    return 'inactive';
  };

  const nodes = useMemo(
    () => [
      {
        id: 'blueprint',
        x: 70,
        y: 140,
        label: c.nodes.blueprint,
        status: nodeStatus(0),
        icon: <FileText className="h-4 w-4" />,
      },
      {
        id: 'agents',
        x: 200,
        y: 70,
        label: c.nodes.agents,
        status: nodeStatus(1),
        icon: <Bot className="h-4 w-4" />,
      },
      {
        id: 'gates',
        x: 200,
        y: 210,
        label: c.nodes.gates,
        status: nodeStatus(2),
        icon: <Shield className="h-4 w-4" />,
      },
      {
        id: 'cloud',
        x: 340,
        y: 140,
        label: c.nodes.cloud,
        status: nodeStatus(3),
        size: 'lg' as const,
        icon: <Cloud className="h-5 w-5" />,
      },
      {
        id: 'dashboard',
        x: 470,
        y: 140,
        label: c.nodes.dashboard,
        status: nodeStatus(4),
        icon: <LayoutDashboard className="h-4 w-4" />,
      },
    ],
    [c.nodes, nodePhase]
  );

  const connections = useMemo(
    () => [
      { from: 'blueprint', to: 'agents', animated: nodePhase >= 1 },
      { from: 'blueprint', to: 'gates', animated: nodePhase >= 2 },
      { from: 'agents', to: 'cloud', animated: nodePhase >= 3 },
      { from: 'gates', to: 'cloud', animated: nodePhase >= 3 },
      { from: 'cloud', to: 'dashboard', animated: nodePhase >= 4 },
    ],
    [nodePhase]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 text-center"
    >
      <div className="space-y-3">
        <motion.div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-brand/30 bg-brand/10"
          animate={{ boxShadow: [`0 0 0px ${avrilColors.brandGlow}`, `0 0 32px ${avrilColors.brandGlow}`, `0 0 0px ${avrilColors.brandGlow}`] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <span className="h-3 w-3 animate-pulse rounded-full bg-brand" />
        </motion.div>
        <h2 className="text-2xl tracking-tight md:text-3xl lg:text-4xl">{c.title}</h2>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">{c.subtitle}</p>
        <p className="text-sm font-medium text-brand">{companyName}</p>
      </div>

      <div className="relative w-full overflow-hidden rounded-2xl border border-border/70 bg-surface/40 p-3 backdrop-blur-sm sm:p-4 md:p-6">
        <div className="mx-auto flex w-full justify-center overflow-hidden">
          <div className="origin-center scale-[0.48] sm:scale-[0.62] md:scale-[0.82] lg:scale-100">
            <CircuitBoard
              nodes={nodes}
              connections={connections}
              width={540}
              height={280}
              pulseSpeed={1.6}
              traceColor="rgba(0, 153, 175, 0.22)"
              pulseColor={avrilColors.brandGlow}
              gridColor="rgba(0, 153, 175, 0.08)"
              variant="dark"
            />
          </div>
        </div>
      </div>

      <div className="min-h-[1.5rem]">
        <AnimatePresence mode="wait">
          <motion.p
            key={phases[phaseIndex]}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35 }}
            className="text-sm tracking-wide text-muted-foreground"
          >
            {phases[phaseIndex]}
          </motion.p>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
