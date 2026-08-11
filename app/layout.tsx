import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';
import ConvexClientProvider from '@/src/components/ConvexClientProvider';
import WaaPProvider from '@/src/components/WaaPProvider';
import { UIStoreProvider } from '@/src/lib/store';
import ThemeProvider from '@/src/components/ThemeProvider';

export const metadata: Metadata = {
  title: 'Avril — Vibe Founding OS',
  description:
    'Turn market signals into operable agentic companies. Generate, launch, and supervise with Avril.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body>
        <WaaPProvider>
          <UIStoreProvider>
            <ThemeProvider>
              <ConvexClientProvider>{children}</ConvexClientProvider>
            </ThemeProvider>
          </UIStoreProvider>
        </WaaPProvider>
        <Toaster richColors closeButton position="bottom-right" theme="dark" />
      </body>
    </html>
  );
}
