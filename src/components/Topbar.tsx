'use client';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import { useWaaP } from './WaaPProvider';
import ThemePillarToggle from './ThemePillarToggle';
import { cn } from '@/lib/utils';

const TITLES: Record<string, string> = {
  '/home': 'Menu',
  '/verify': 'Verification',
  '/agents': 'Agents',
  '/agents/office': 'Agent Office',
  '/tasks': 'Tasks',
  '/chats': 'Chats',
  '/wallets': 'Wallets',
  '/startup-agent-generator': 'Startup Agent Generator',
  '/profile': 'Profile',
};

type TopbarProps = {
  menuOpen: boolean;
  onMenuToggle: () => void;
};

export default function Topbar({ menuOpen, onMenuToggle }: TopbarProps) {
  const pathname = usePathname();
  const title =
    TITLES[pathname] ??
    (pathname.startsWith('/agents/office') ? 'Agent Office' : undefined) ??
    (pathname.startsWith('/agents') ? 'Agents' : undefined) ??
    'Avril Dashboard';
  const { address, logout } = useWaaP();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const isOffice = pathname.startsWith('/agents/office');

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-[60] flex h-16 items-center justify-between px-4 md:px-6',
        isOffice
          ? 'border-b border-border/60 bg-background/80 backdrop-blur-md'
          : 'glass-navbar'
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="nav-drawer"
          className={cn(
            'rounded-lg border p-2 transition-colors',
            isOffice
              ? 'border-border/60 text-muted-foreground hover:bg-surface/60 hover:text-foreground'
              : 'border-white/10 text-muted hover:bg-white/10 hover:text-white smooth-transition'
          )}
        >
          <Menu className="w-5 h-5" strokeWidth={2} aria-hidden />
        </button>
        <h1 className="font-heading text-base font-semibold text-foreground">{title}</h1>
      </div>

      <div className="flex items-center gap-3 md:gap-4">
        <ThemePillarToggle />
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Avril'}
        </span>
        {address && (
          <button
            onClick={() => void handleCopy()}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-heading transition-colors',
              isOffice
                ? 'border-border/60 text-muted-foreground hover:border-brand/30 hover:text-foreground'
                : 'btn-ghost text-xs'
            )}
          >
            {copied ? 'Copied' : 'Copy address'}
          </button>
        )}
        <button
          onClick={() => void logout()}
          className={cn(
            isOffice
              ? 'rounded-full border border-border/60 px-3 py-1 text-xs font-heading text-muted-foreground transition-colors hover:border-brand/30 hover:text-foreground'
              : 'btn-ghost text-xs'
          )}
        >
          Logout
        </button>
      </div>
    </header>
  );
}
