import { Suspense } from 'react';
import { BillingSuccessPage } from '@/components/flows/billing/billing-success-page';

export default function BillingSuccessRoute() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--avril-canvas)]" />}>
      <BillingSuccessPage />
    </Suspense>
  );
}
