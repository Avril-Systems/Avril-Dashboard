'use client';

import { motion, AnimatePresence } from 'framer-motion';

type LoadingStateProps = {
  message: string;
};

export function LoadingState({ message }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 rounded-full border border-brand/20" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-brand" />
      </div>
      <div className="min-h-[2rem]">
        <AnimatePresence mode="wait">
          <motion.p
            key={message}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="text-sm tracking-wide text-muted-foreground md:text-base"
          >
            {message}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
