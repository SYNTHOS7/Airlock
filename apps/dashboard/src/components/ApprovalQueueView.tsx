'use client';

import React, { useState, useEffect } from 'react';
import {
  UserCheck, ShieldAlert, Check, X, Clock,
  RefreshCw, AlertCircle, Hash, User, ArrowRight
} from 'lucide-react';
import type { UserContextValue } from './Header';

interface ApprovalQueueViewProps {
  currentUser: UserContextValue;
  onActionComplete: () => void;
}

export function ApprovalQueueView({ currentUser, onActionComplete }: ApprovalQueueViewProps) {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; success: boolean; message: string } | null>(null);

  async function fetchQueue() {
    setLoading(true);
    try {
      const res = await fetch('/api/approvals');
      const data = await res.json();
      setApprovals(data.approvals || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchQueue(); }, []);

  async function handleAction(approvalId: string, action: 'approve' | 'reject') {
    setProcessingId(approvalId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/approvals/${approvalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-airlock-user': currentUser.id },
        body: JSON.stringify({ action, approver_id: currentUser.id, approver_roles: [currentUser.role] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      setFeedback({
        id: approvalId,
        success: true,
        message: action === 'approve'
          ? '✓ Pre-execution recheck passed · Action executed on provider · WAL committed'
          : '✗ Action rejected → moved to DENIED state',
      });
      fetchQueue();
      onActionComplete();
    } catch (err: any) {
      setFeedback({ id: approvalId, success: false, message: err.message });
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">Human Approval Queue</h2>
          <p className="text-[11px] text-[#1e4d7a] mt-0.5">
            Separation of Duties (APPROVAL-002) · SHA-256 cryptographic action-hash binding · Pre-execution policy recheck
          </p>
        </div>
        <button
          onClick={fetchQueue}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card border border-[#0d2340] text-xs text-slate-300 hover:text-white hover:border-sky-500/30 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
          Refresh
        </button>
      </div>

      {/* How it works strip */}
      <div className="glass-card rounded-xl p-4 border border-[#0d2340]">
        <div className="flex items-center gap-0">
          {[
            { label: 'Agent Submits', sub: 'any user' },
            { label: 'Policy Flags', sub: 'amount > $50' },
            { label: 'Hash Bound', sub: 'SHA-256 lock' },
            { label: 'Human Reviews', sub: 'different identity' },
            { label: 'Pre-check', sub: 'policy re-eval' },
            { label: 'Execute', sub: 'WAL commit' },
          ].map((step, i, arr) => (
            <React.Fragment key={step.label}>
              <div className="flex flex-col items-center flex-1">
                <div className="w-6 h-6 rounded-full bg-[#0a1628] border border-[#0d2340] flex items-center justify-center text-[10px] font-bold text-sky-400">{i + 1}</div>
                <div className="text-[10px] font-bold text-slate-300 mt-1 text-center">{step.label}</div>
                <div className="text-[9px] text-[#1e4070] text-center">{step.sub}</div>
              </div>
              {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-[#0d2340] flex-shrink-0 mb-4" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Queue */}
      {approvals.length === 0 ? (
        <div className="glass-card border border-dashed border-[#0d2340] rounded-xl p-14 text-center">
          <div className="w-14 h-14 rounded-full bg-[#0a1628] border border-[#0d2340] flex items-center justify-center mx-auto mb-4">
            <UserCheck className="w-7 h-7 text-[#1e4070]" />
          </div>
          <p className="text-sm font-bold text-slate-400 mb-1">Queue is empty</p>
          <p className="text-xs text-[#1e4070]">Submit a request over $50 from the New Request tab to see it here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map(({ approval, operation }) => {
            const isRequester = currentUser.id === approval.requester_id;
            const canApprove = currentUser.role === 'approver' && !isRequester;
            const amountUsd = operation.amount?.amount_minor
              ? (operation.amount.amount_minor / 100).toFixed(2)
              : '0.00';
            const timeLeft = Math.max(0, Math.round((new Date(approval.expires_at).getTime() - Date.now()) / 60000));

            return (
              <div
                key={approval.approval_id}
                className="glass-card border border-[#0d2340] hover-neon rounded-xl p-5 transition-all"
              >
                {/* Top row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#0d2340]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">REFUND</span>
                        <span className="text-lg font-black text-white tabular-nums">${amountUsd}</span>
                        <span className="text-xs text-[#1e4d7a]">USD on {operation.payment_id}</span>
                      </div>
                      <div className="text-[11px] text-[#1e4070] mt-0.5">
                        Expires in <span className="text-amber-400 font-semibold">{timeLeft} min</span>
                      </div>
                    </div>
                  </div>
                  <span className="badge-require inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full font-bold">
                    <Clock className="w-3 h-3" /> AWAITING APPROVAL
                  </span>
                </div>

                {/* Detail grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 text-xs">
                  <div className="bg-[#030e1e] p-3 rounded-lg border border-[#0d2340] space-y-2">
                    <div className="flex items-center gap-1.5 text-[#1e4070]">
                      <User className="w-3 h-3" /> Requester
                    </div>
                    <div className="font-mono font-bold text-sky-300">{approval.requester_id}</div>
                    <div className="text-[#1e4070] mt-1">Reason:</div>
                    <div className="text-slate-300 italic text-[11px]">"{operation.reason}"</div>
                  </div>

                  <div className="bg-[#030e1e] p-3 rounded-lg border border-[#0d2340] space-y-2">
                    <div className="flex items-center gap-1.5 text-[#1e4070]">
                      <Hash className="w-3 h-3" /> SHA-256 Action Hash
                    </div>
                    <div className="font-mono text-[10px] text-slate-500 break-all bg-[#060b14] p-2 rounded border border-[#0d2340] leading-relaxed">
                      {approval.action_hash}
                    </div>
                    <p className="text-[9px] text-[#1e3a5f]">
                      Cryptographically binds this exact action. Re-verified immediately before execution. Any tampering = instant denial.
                    </p>
                  </div>
                </div>

                {/* Feedback */}
                {feedback && feedback.id === approval.approval_id && (
                  <div className={`mt-3 p-3 rounded-lg text-xs flex items-start gap-2 ${
                    feedback.success
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                  }`}>
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{feedback.message}</span>
                  </div>
                )}

                {/* SoD warnings */}
                {isRequester && (
                  <div className="mt-3 p-3 rounded-lg bg-amber-500/8 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Self-approval blocked (APPROVAL-002):</strong> You submitted this request as{' '}
                      <code className="text-amber-200 font-bold">{currentUser.id}</code>. A different human approver must review it. Switch to <strong>Manager Dave</strong>.
                    </span>
                  </div>
                )}
                {currentUser.role !== 'approver' && !isRequester && (
                  <div className="mt-3 p-2.5 rounded-lg bg-[#030e1e] border border-[#0d2340] text-[#1e4d7a] text-xs">
                    Current role <strong className="text-slate-300">{currentUser.role}</strong> cannot approve. Only <strong className="text-amber-400">approver</strong> role may authorize consequential actions.
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 mt-4 pt-3 border-t border-[#0d2340]">
                  <button
                    onClick={() => handleAction(approval.approval_id, 'reject')}
                    disabled={processingId === approval.approval_id || currentUser.role !== 'approver'}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0a1628] hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 text-xs font-semibold transition border border-[#0d2340] hover:border-rose-500/30 disabled:opacity-40"
                  >
                    <X className="w-3.5 h-3.5" /> Reject
                  </button>
                  <button
                    onClick={() => handleAction(approval.approval_id, 'approve')}
                    disabled={!canApprove || processingId === approval.approval_id}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-lg btn-paypal text-xs font-bold shadow-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {processingId === approval.approval_id ? 'Running Pre-check...' : 'Approve & Execute'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
