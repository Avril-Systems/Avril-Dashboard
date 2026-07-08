import { LanguageProvider } from '@/components/marketing/language-context';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <div className="avril-marketing min-h-screen font-sans text-foreground antialiased">{children}</div>
    </LanguageProvider>
  );
}
