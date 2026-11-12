'use client';

import React, { useState, useEffect } from 'react';
import { UserCheck, ShieldAlert, Check, X, Clock, RefreshCw, AlertCircle, Hash, User, ArrowRight, Smartphone, Fingerprint } from 'lucide-react';
import type { UserContextValue } from './Header';

const C = {
  primary: '#4F46E5', // Electric Indigo
  teal:    '#06B6D4', // Cyber Cyan
  orange:  '#D946EF', // Neon Magenta for review states
  pink:    '#D946EF', // Neon Magenta
  violet:  '#D946EF', // Neon Magenta
  gold:    '#D946EF',
  spark:   '#A5F3FC', // Highlight Spark
  white:   '#FFFFFF',
  gray1:   '#E2E8F0',
  gray2:   '#94A3B8',
  gray3:   '#77778C',
  s0: '#05050A',
  s1: '#0A0A12',
  s2: '#121220',
  s3: '#1A1A2E',
};

interface ApprovalQueueViewProps {
  currentUser: UserContextValue;
  onActionComplete: () => void;
}

export function ApprovalQueueView({ currentUser, onActionComplete }: ApprovalQueueViewProps) {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [mobileModalItem, setMobileModalItem] = useState<any | null>(null);

  async function fetchQueue() {
    if (currentUser.role === 'support_agent') {
      setApprovals([]);
      setLoadError('Choose Manager Dave to review requests, or Auditor Emma to inspect the queue.');
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/approvals', { headers: { 'x-airlock-user': currentUser.id } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The approval queue could not be loaded.');
      setApprovals(data.approvals || []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'The approval queue could not be loaded.');
    }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchQueue(); }, [currentUser]);

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
        id: approvalId, success: true,
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
          <h2 className="text-base font-black text-white">Approval queue</h2>
          <p className="text-[11px] mt-0.5 font-medium" style={{ color: C.gray2 }}>
            Review requests before execution. Requesters cannot approve their own actions.
          </p>
        </div>
        <button
          onClick={fetchQueue} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-xs font-semibold transition hover-neon"
          style={{ border: `1px solid rgba(74,74,74,0.4)`, color: C.gray1 }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} style={{ color: loading ? C.primary : undefined }} />
          Refresh
        </button>
      </div>

      {loadError && <div className="workspace-error" role="status"><AlertCircle size={16} /><span>{loadError}</span></div>}
      {/* How it works */}
      <div className="glass-card rounded-xl p-4" style={{ border: `1px solid rgba(74,74,74,0.4)` }}>
        <div className="flex items-center gap-0">
          {[
            { label: 'Agent Submits', sub: 'any user' },
            { label: 'Policy Flags', sub: 'configured limits' },
            { label: 'Hash Bound', sub: 'SHA-256 lock' },
            { label: 'Human Reviews', sub: 'different identity' },
            { label: 'Pre-check', sub: 'policy re-eval' },
            { label: 'Execute', sub: 'WAL commit' },
          ].map((step, i, arr) => (
            <React.Fragment key={step.label}>
              <div className="flex flex-col items-center flex-1">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black"
                  style={{ background: C.s3, border: `1px solid ${C.primary}50`, color: C.primary }}>
                  {i + 1}
                </div>
                <div className="text-[10px] font-bold mt-1 text-center" style={{ color: C.gray1 }}>{step.label}</div>
                <div className="text-[9px] text-center" style={{ color: C.gray3 }}>{step.sub}</div>
              </div>
              {i < arr.length - 1 && <ArrowRight className="w-3 h-3 flex-shrink-0 mb-4" style={{ color: C.gray3 }} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Queue */}
      {loadError ? null : loading ? <p role="status" className="text-sm text-slate-400">Loading approval requests...</p> : approvals.length === 0 ? (
        <div className="glass-card rounded-xl p-14 text-center border-dashed" style={{ borderColor: 'rgba(74,74,74,0.35)' }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: C.s3, border: `1px solid rgba(74,74,74,0.4)` }}>
            <UserCheck className="w-7 h-7" style={{ color: C.gray3 }} />
          </div>
          <p className="text-sm font-black" style={{ color: C.gray2 }}>Queue is empty</p>
          <p className="text-xs mt-1" style={{ color: C.gray3 }}>Requests appear here when your configured policy requires approval.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map(({ approval, operation }) => {
            const isRequester = currentUser.id === approval.requester_id;
            const canApprove  = currentUser.role === 'approver' && !isRequester;
            const amountUsd   = operation.amount?.amount_minor
              ? (operation.amount.amount_minor / 100).toFixed(2) : '0.00';
            const timeLeft = Math.max(0, Math.round((new Date(approval.expires_at).getTime() - Date.now()) / 60000));

            return (
              <div key={approval.approval_id}
                className="glass-card rounded-xl p-5 hover-neon transition-all"
                style={{ border: `1px solid rgba(74,74,74,0.4)` }}>

                {/* Top */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4"
                  style={{ borderBottom: `1px solid rgba(74,74,74,0.3)` }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: `${C.orange}12`, border: `1px solid ${C.orange}30` }}>
                      <Clock className="w-5 h-5" style={{ color: C.orange }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black px-2 py-0.5 rounded font-mono"
                          style={{ background: `${C.teal}12`, border: `1px solid ${C.teal}30`, color: C.teal }}>
                          REFUND
                        </span>
                        <span className="text-lg font-black tabular-nums" style={{ color: C.white }}>${amountUsd}</span>
                        <span className="text-xs" style={{ color: C.gray3 }}>USD on {operation.payment_id}</span>
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: C.gray3 }}>
                        Expires in <span className="font-bold" style={{ color: C.orange }}>{timeLeft} min</span>
                      </div>
                    </div>
                  </div>
                  <span className="badge-require inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full font-black">
                    <Clock className="w-3 h-3" /> AWAITING APPROVAL
                  </span>
                </div>

                {/* Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 text-xs">
                  <div className="p-3 rounded-lg space-y-2" style={{ background: C.s0, border: `1px solid rgba(74,74,74,0.3)` }}>
                    <div className="flex items-center gap-1.5" style={{ color: C.gray3 }}>
                      <User className="w-3 h-3" /> Requester
                    </div>
                    <div className="font-mono font-black" style={{ color: C.primary }}>{approval.requester_id}</div>
                    <div style={{ color: C.gray3 }}>Reason:</div>
                    <div className="italic text-[11px]" style={{ color: C.gray1 }}>"{operation.reason}"</div>
                  </div>
                  <div className="p-3 rounded-lg space-y-2" style={{ background: C.s0, border: `1px solid rgba(74,74,74,0.3)` }}>
                    <div className="flex items-center gap-1.5" style={{ color: C.gray3 }}>
                      <Hash className="w-3 h-3" /> SHA-256 Action Hash
                    </div>
                    <div className="font-mono text-[10px] break-all p-2 rounded" style={{ background: '#030508', border: `1px solid rgba(74,74,74,0.25)`, color: C.gray2 }}>
                      {approval.action_hash}
                    </div>
                    <p className="text-[9px]" style={{ color: C.gray3 }}>
                      Cryptographically binds this exact action. Re-verified immediately before execution. Any tampering = instant denial.
                    </p>
                  </div>
                </div>

                {/* Feedback */}
                {feedback && feedback.id === approval.approval_id && (
                  <div className="mt-3 p-3 rounded-lg text-xs flex items-start gap-2 animate-count-up"
                    style={{
                      background: feedback.success ? `${C.teal}10` : `${C.pink}10`,
                      border: `1px solid ${feedback.success ? C.teal : C.pink}30`,
                      color: feedback.success ? C.teal : C.pink,
                    }}>
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{feedback.message}</span>
                  </div>
                )}

                {/* SoD warnings */}
                {isRequester && (
                  <div className="mt-3 p-3 rounded-lg text-xs flex items-start gap-2"
                    style={{ background: `${C.orange}08`, border: `1px solid ${C.orange}25`, color: C.orange }}>
                    <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Self-approval blocked (APPROVAL-002):</strong> You submitted this as{' '}
                      <code className="font-black" style={{ color: C.gold }}>{currentUser.id}</code>. Switch to <strong>Manager Dave</strong> to approve.
                    </span>
                  </div>
                )}
                {currentUser.role !== 'approver' && !isRequester && (
                  <div className="mt-3 p-2.5 rounded-lg text-[11px]"
                    style={{ background: C.s0, border: `1px solid rgba(74,74,74,0.3)`, color: C.gray3 }}>
                    Role <strong style={{ color: C.gray1 }}>{currentUser.role}</strong> cannot approve. Only{' '}
                    <strong style={{ color: C.orange }}>approver</strong> role may authorize consequential actions.
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between gap-3 mt-4 pt-3"
                  style={{ borderTop: `1px solid rgba(74,74,74,0.3)` }}>
                  <button
                    onClick={() => setMobileModalItem({ approval, operation })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold glass-card hover-neon transition"
                    style={{ border: `1px solid rgba(74,74,74,0.4)`, color: C.primary }}
                  >
                    <Smartphone className="w-3.5 h-3.5" /> Preview mobile approval (demo)
                  </button>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleAction(approval.approval_id, 'reject')}
                      disabled={processingId === approval.approval_id || currentUser.role !== 'approver'}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition disabled:opacity-40"
                      style={{ background: C.s3, border: `1px solid rgba(74,74,74,0.4)`, color: C.gray2 }}
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                    <button
                      onClick={() => handleAction(approval.approval_id, 'approve')}
                      disabled={!canApprove || processingId === approval.approval_id}
                      className="btn-primary flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs shadow-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {processingId === approval.approval_id ? 'Running Pre-check…' : 'Approve & Execute'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mobile Simulator Modal */}
      {mobileModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-count-up">
          <div className="relative w-full max-w-sm rounded-[36px] p-5 shadow-2xl border-4"
            style={{ background: '#0a0d14', borderColor: '#222838', boxShadow: '0 0 50px rgba(74,144,226,0.3)' }}>
            
            {/* Notch */}
            <div className="w-28 h-4 rounded-full mx-auto mb-4" style={{ background: '#1a1f2e' }} />

            {/* Simulated Notification Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: C.primary }}>
                  <ShieldAlert className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-white leading-tight">PayPal Airlock Alert</div>
                  <div className="text-[9px] text-amber-400 font-mono">Dual-Authorization Push (Simulated)</div>
                </div>
              </div>
              <button
                onClick={() => setMobileModalItem(null)}
                className="text-xs p-1 rounded-full text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Notification Card */}
            <div className="rounded-2xl p-4 mb-4" style={{ background: '#111726', border: '1px solid rgba(74,144,226,0.25)' }}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: C.orange }}>
                Requires Manager Dave Approval
              </div>
              <div className="text-xl font-black text-white mb-1">
                ${mobileModalItem.operation.amount?.amount_minor ? (mobileModalItem.operation.amount.amount_minor / 100).toFixed(2) : '0.00'} USD
              </div>
              <div className="text-[11px] mb-2" style={{ color: C.gray2 }}>
                Refund on <span className="font-mono text-white">{mobileModalItem.operation.payment_id}</span>
              </div>
              <div className="p-2 rounded-lg text-[10px] font-mono mb-2" style={{ background: '#060910', color: C.teal }}>
                Reason: "{mobileModalItem.operation.reason}"
              </div>
              <div className="text-[9px] font-mono break-all p-1.5 rounded" style={{ background: '#060910', color: C.gray3 }}>
                HASH: {mobileModalItem.approval.action_hash.slice(0, 32)}…
              </div>
            </div>

            {/* FaceID / Biometric Action */}
            <div className="space-y-2">
              <button
                onClick={() => {
                  const id = mobileModalItem.approval.approval_id;
                  setMobileModalItem(null);
                  handleAction(id, 'approve');
                }}
                disabled={currentUser.role !== 'approver'}
                className="w-full btn-primary py-3 rounded-2xl flex items-center justify-center gap-2 text-xs font-black shadow-lg disabled:opacity-40"
              >
                <Fingerprint className="w-4 h-4 text-cyan-300" />
                Simulate manager approval
              </button>
              <button
                onClick={() => setMobileModalItem(null)}
                className="w-full py-2 rounded-2xl text-[11px] font-semibold text-slate-400 hover:text-white"
              >
                Dismiss to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


