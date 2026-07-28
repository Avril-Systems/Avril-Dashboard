'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Home, Menu } from 'lucide-react';
import { useWaaP } from './WaaPProvider';
import ThemePillarToggle from './ThemePillarToggle';
import { cn } from '@/lib/utils';

const TITLES: Record<string, string> = {
  '/home': 'Menu',
  '/start/idea': 'Build from my idea',
  '/founder/control-plane': 'Founder Control Plane',
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
  const isHome = pathname === '/home' || pathname === '/';

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

  return (
    <header className="glass-navbar fixed top-0 left-0 right-0 z-[60] flex h-16 items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="nav-drawer"
          className="rounded-lg border border-white/10 p-2 text-muted hover:bg-white/10 hover:text-white smooth-transition"
        >
          <Menu className="w-5 h-5" strokeWidth={2} aria-hidden />
        </button>
        {!isHome ? (
          <Link
            href="/home"
            aria-label="Go to home"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5',
              'text-xs font-heading text-muted transition-colors',
              'hover:bg-white/10 hover:text-white smooth-transition',
            )}
          >
            <Home className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Home</span>
          </Link>
        ) : null}
        <h1 className="font-heading text-base font-semibold text-foreground">{title}</h1>
      </div>

      <div className="flex items-center gap-3 md:gap-4">
        <ThemePillarToggle />
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Avril'}
        </span>
        {address && (
          <button onClick={() => void handleCopy()} className="btn-ghost text-xs">
            {copied ? 'Copied' : 'Copy address'}
          </button>
        )}
        <button onClick={() => void logout()} className="btn-ghost text-xs">
          Logout
        </button>
      </div>
    </header>
  );
}
