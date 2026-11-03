'use client';

import React, { useState, useEffect } from 'react';
import { UserCheck, ShieldAlert, Check, X, Clock, RefreshCw, AlertCircle } from 'lucide-react';
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

  useEffect(() => {
    fetchQueue();
  }, []);

  async function handleAction(approvalId: string, action: 'approve' | 'reject') {
    setProcessingId(approvalId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/approvals/${approvalId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-airlock-user': currentUser.id,
        },
        body: JSON.stringify({
          action,
          approver_id: currentUser.id,
          approver_roles: [currentUser.role],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Action failed');
      }

      setFeedback({
        id: approvalId,
        success: true,
        message: action === 'approve'
          ? 'Approved! Pre-execution recheck passed; action executed and verified on provider.'
          : 'Action rejected and moved to DENIED.',
      });

      // Refresh list
      fetchQueue();
      onActionComplete();
    } catch (err: any) {
      setFeedback({
        id: approvalId,
        success: false,
        message: err.message,
      });
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Human Approval Queue</h2>
          <p className="text-xs text-slate-400">
            Enforces Separation of Duties (APPROVAL-002) and cryptographic action-hash binding.
          </p>
        </div>
        <button
          onClick={fetchQueue}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-slate-100 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {approvals.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-500">
            <UserCheck className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-slate-300 mb-1">Queue is empty</p>
          <p className="text-xs text-slate-500">No operations are currently awaiting human approval.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {approvals.map(({ approval, operation }) => {
            const isRequester = currentUser.id === approval.requester_id;
            const canApprove = currentUser.role === 'approver' && !isRequester;

            return (
              <div
                key={approval.approval_id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      REFUND
                    </span>
                    <span className="text-sm font-semibold text-slate-200">
                      ${operation.amount?.amount_minor ? (operation.amount.amount_minor / 100).toFixed(2) : '0.00'} USD
                    </span>
                    <span className="text-xs text-slate-400">on {operation.payment_id}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      Expires: {new Date(approval.expires_at).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 space-y-1">
                    <div className="text-slate-400">Requester ID:</div>
                    <div className="font-mono text-slate-200 font-semibold">{approval.requester_id}</div>
                    <div className="text-slate-400 pt-1">Reason:</div>
                    <div className="text-slate-300 italic">"{operation.reason}"</div>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 space-y-1">
                    <div className="text-slate-400">Cryptographic Action Hash:</div>
                    <div className="font-mono text-[11px] text-slate-400 break-all bg-slate-900 p-1.5 rounded border border-slate-800">
                      {approval.action_hash}
                    </div>
                    <div className="text-slate-500 text-[10px] pt-1">
                      Binds to exact action, amount, and provider. Re-checked right before execution.
                    </div>
                  </div>
                </div>

                {/* Feedback banner */}
                {feedback && feedback.id === approval.approval_id && (
                  <div
                    className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                      feedback.success
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                    }`}
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{feedback.message}</span>
                  </div>
                )}

                {/* Separation of Duties Enforcement Banner */}
                {isRequester && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                    <span>
                      <strong>Self-approval forbidden (APPROVAL-002):</strong> You submitted this request (<code className="text-amber-200 font-bold">{currentUser.id}</code>). A distinct human approver must review and approve it.
                    </span>
                  </div>
                )}

                {currentUser.role !== 'approver' && !isRequester && (
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 text-xs">
                    Your current role is <strong className="text-slate-200">{currentUser.role}</strong>. Only users with the <strong className="text-amber-400">approver</strong> role can approve consequential actions.
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => handleAction(approval.approval_id, 'reject')}
                    disabled={processingId === approval.approval_id || currentUser.role !== 'approver'}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 text-xs font-medium transition border border-slate-700/60 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject
                  </button>

                  <button
                    onClick={() => handleAction(approval.approval_id, 'approve')}
                    disabled={!canApprove || processingId === approval.approval_id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {processingId === approval.approval_id ? 'Executing Precheck...' : 'Approve & Execute'}
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

