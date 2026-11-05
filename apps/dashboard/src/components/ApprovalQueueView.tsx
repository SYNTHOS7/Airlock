'use client';

import React, { useState, useEffect } from 'react';
import { UserCheck, ShieldAlert, Check, X, Clock, RefreshCw, AlertCircle, Hash, User, ArrowRight } from 'lucide-react';
import type { UserContextValue } from './Header';

const C = {
  primary: '#4A90E2', teal: '#50E3C2', orange: '#F5A623', pink: '#E94E77',
  violet: '#9013FE', gold: '#F8E71C', white: '#FFFFFF', gray1: '#D1D1D1',
  gray2: '#B7B7B7', gray3: '#4A4A4A', s0: '#07090f', s1: '#0e1117', s2: '#151b26', s3: '#1c2333',
};

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
    } catch {}
    finally { setLoading(false); }
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
          <h2 className="text-base font-black text-white">Human Approval Queue</h2>
          <p className="text-[11px] mt-0.5 font-medium" style={{ color: C.gray2 }}>
            Separation of Duties (APPROVAL-002) · SHA-256 cryptographic action-hash binding · Pre-execution policy recheck
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

      {/* How it works */}
      <div className="glass-card rounded-xl p-4" style={{ border: `1px solid rgba(74,74,74,0.4)` }}>
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
      {approvals.length === 0 ? (
        <div className="glass-card rounded-xl p-14 text-center border-dashed" style={{ borderColor: 'rgba(74,74,74,0.35)' }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: C.s3, border: `1px solid rgba(74,74,74,0.4)` }}>
            <UserCheck className="w-7 h-7" style={{ color: C.gray3 }} />
          </div>
          <p className="text-sm font-black" style={{ color: C.gray2 }}>Queue is empty</p>
          <p className="text-xs mt-1" style={{ color: C.gray3 }}>Submit a request over $50 from the New Request tab to see it here</p>
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
                <div className="flex items-center justify-end gap-3 mt-4 pt-3"
                  style={{ borderTop: `1px solid rgba(74,74,74,0.3)` }}>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
