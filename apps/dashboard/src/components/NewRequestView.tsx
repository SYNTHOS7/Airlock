'use client';

import React, { useState } from 'react';
import { Send, CheckCircle2, AlertTriangle, XCircle, Clock, ShieldAlert } from 'lucide-react';
import type { UserContextValue } from './Header';

interface NewRequestViewProps {
  currentUser: UserContextValue;
  onActionComplete: () => void;
}

export function NewRequestView({ currentUser, onActionComplete }: NewRequestViewProps) {
  const [paymentId, setPaymentId] = useState('CAP-DEFAULT-100');
  const [amount, setAmount] = useState('45.00');
  const [reason, setReason] = useState('Customer returned unused merchandise within policy');
  const [evalResult, setEvalResult] = useState<any>(null);
  const [submitResult, setSubmitResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountMinor = Math.round(parseFloat(amount || '0') * 100);

  async function handleEvaluate() {
    setLoading(true);
    setError(null);
    setSubmitResult(null);
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-airlock-user': currentUser.id,
        },
        body: JSON.stringify({
          payment_id: paymentId,
          amount_minor: amountMinor,
          currency: 'USD',
          reason,
          requester_id: currentUser.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Evaluation failed');
      setEvalResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/operations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-airlock-user': currentUser.id,
        },
        body: JSON.stringify({
          payment_id: paymentId,
          amount_minor: amountMinor,
          currency: 'USD',
          reason,
          requester_id: currentUser.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setSubmitResult(data);
      onActionComplete();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Form Column */}
      <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-100 mb-1">New Refund Proposal</h2>
        <p className="text-xs text-slate-400 mb-6">
          Untrusted request intake. Proposes a refund against the payment rail subject to deterministic policy checks.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">PayPal Capture ID</label>
            <input
              type="text"
              value={paymentId}
              onChange={(e) => setPaymentId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
              placeholder="e.g. CAP-DEFAULT-100"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-medium text-slate-300">Refund Amount (USD)</label>
              <span className="text-[11px] text-slate-500">Threshold: $50.00 | Cap: $200.00</span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm text-slate-500">$</span>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                placeholder="45.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Customer / Agent Reason (Untrusted Text)</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
              placeholder="Provide reason for refund..."
            />
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              onClick={handleEvaluate}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition"
            >
              {loading ? 'Evaluating...' : 'Evaluate Policy (Dry Run)'}
            </button>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition shadow-sm"
            >
              <Send className="w-4 h-4" />
              {loading ? 'Submitting...' : 'Submit Action'}
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Policy & Execution Feedback */}
      <div className="lg:col-span-5 space-y-4">
        {/* Evaluation Card */}
        {evalResult && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Policy Evaluation</h3>
              <DispositionBadge disposition={evalResult.disposition} />
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                <span className="text-slate-400 block mb-1">Triggered Rules:</span>
                {evalResult.ruleIds.length === 0 ? (
                  <span className="text-emerald-400 font-medium">None (Clean Policy Pass)</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {evalResult.ruleIds.map((r: string) => (
                      <span key={r} className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[11px]">
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                <span className="text-slate-400 block mb-1">Reason:</span>
                <p className="text-slate-300">{evalResult.reasons.join('; ')}</p>
              </div>

              {evalResult.facts && (
                <div className="text-[11px] text-slate-400 grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                  <div>Capture Status: <span className="text-slate-200">{evalResult.facts.payment_capture_status}</span></div>
                  <div>Remaining: <span className="text-slate-200">${(evalResult.facts.remaining_refundable_amount.amount_minor / 100).toFixed(2)}</span></div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Submission Outcome Card */}
        {submitResult && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Action Outcome
            </h3>

            {submitResult.disposition === 'ALLOW' && (
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                <div className="flex items-center gap-2 font-semibold mb-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Executed & Verified Successfully
                </div>
                <p className="text-xs text-slate-300">
                  Operation <code className="text-emerald-300">{submitResult.operation.operation_id.slice(0, 8)}</code> completed on provider with write-ahead record.
                </p>
              </div>
            )}

            {submitResult.disposition === 'REQUIRE_APPROVAL' && (
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                <div className="flex items-center gap-2 font-semibold mb-1">
                  <Clock className="w-5 h-5 text-amber-400" />
                  Queued for Human Approval
                </div>
                <p className="text-xs text-slate-300">
                  Amount exceeds $50.00 auto-approval threshold. Bound to action hash and moved to <code className="text-amber-300">AWAITING_APPROVAL</code>.
                </p>
              </div>
            )}

            {submitResult.disposition === 'DENY' && (
              <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                <div className="flex items-center gap-2 font-semibold mb-1">
                  <ShieldAlert className="w-5 h-5 text-rose-400" />
                  Action Denied by Policy
                </div>
                <p className="text-xs text-slate-300">{submitResult.reasons?.join('; ')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DispositionBadge({ disposition }: { disposition: string }) {
  if (disposition === 'ALLOW') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
        <CheckCircle2 className="w-3.5 h-3.5" /> ALLOW
      </span>
    );
  }
  if (disposition === 'REQUIRE_APPROVAL') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
        <Clock className="w-3.5 h-3.5" /> REQUIRE APPROVAL
      </span>
    );
  }
  if (disposition === 'PAUSE_REVIEW') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-semibold">
        <AlertTriangle className="w-3.5 h-3.5" /> PAUSE FOR REVIEW
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold">
      <XCircle className="w-3.5 h-3.5" /> DENY
    </span>
  );
}

