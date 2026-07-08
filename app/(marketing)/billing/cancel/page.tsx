import { Suspense } from 'react';
import { BillingCancelPage } from '@/components/flows/billing/billing-cancel-page';

export default function BillingCancelRoute() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--avril-canvas)]" />}>
      <BillingCancelPage />
    </Suspense>
  );
}
