export type PaymentProvider = 'mock' | 'paypal_sandbox';
export interface DashboardOperation {
  operation_id: string; request_id: string; payment_id: string; provider: string;
  provider_operation_id?: string | null;
  amount_minor: number | null; currency: string | null; state: string; created_at: string; reason: string;
}
export const attentionStates = new Set(['AWAITING_APPROVAL', 'NEEDS_REVIEW', 'OUTCOME_UNKNOWN', 'VERIFYING']);
export function operationStatus(state: string): { label: string; tone: string } {
  const statuses: Record<string, { label: string; tone: string }> = {
    SUCCEEDED: { label: 'Executed', tone: 'success' },
    AWAITING_APPROVAL: { label: 'Awaiting approval', tone: 'review' },
    NEEDS_REVIEW: { label: 'Needs review', tone: 'review' },
    OUTCOME_UNKNOWN: { label: 'Outcome unknown', tone: 'review' },
    VERIFYING: { label: 'Verifying', tone: 'progress' },
    EXECUTING: { label: 'Executing', tone: 'progress' },
    DENIED: { label: 'Denied', tone: 'danger' },
    REJECTED: { label: 'Rejected', tone: 'danger' },
    FAILED: { label: 'Failed', tone: 'danger' },
    READY: { label: 'Ready', tone: 'progress' },
  };
  return statuses[state] || { label: state.toLowerCase().replaceAll('_', ' '), tone: 'neutral' };
}
export function displayMoney(minor: number | null, currency: string | null): string {
  if (minor == null || !Number.isFinite(minor) || !currency) return 'Not specified';
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100); }
  catch { return (minor / 100).toFixed(2) + ' ' + currency; }
}
export function displayTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : new Intl.DateTimeFormat('en', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}
