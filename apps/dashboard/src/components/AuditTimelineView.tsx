'use client';

import React, { useState, useEffect } from 'react';
import { History, RefreshCw, FileText, ArrowRight, ShieldCheck, Bug } from 'lucide-react';

export function AuditTimelineView() {
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchAudit() {
    setLoading(true);
    try {
      const res = await fetch('/api/audit');
      const data = await res.json();
      setAuditRows(data.audit_log || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAudit();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Audit & Evidence Timeline</h2>
          <p className="text-xs text-slate-400">
            Append-only chronological log of all requests, policy decisions, approvals, state transitions, and provider evidence.
          </p>
        </div>
        <button
          onClick={fetchAudit}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-slate-100 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Log
        </button>
      </div>

      {auditRows.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <History className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-400">No audit events recorded yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {auditRows.map((entry) => {
            const details = entry.details ? JSON.parse(entry.details) : null;
            const isFaultSimulation = entry.details?.includes('simulated') || entry.details?.includes('fault');

            return (
              <div
                key={entry.audit_id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700/80 transition"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded font-semibold bg-slate-800 text-slate-200 border border-slate-700">
                      {entry.event_type}
                    </span>

                    {/* Simulated Fault Badge (Day 6 ready) */}
                    {isFaultSimulation ? (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                        <Bug className="w-3 h-3" /> Simulated Fault
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" /> Verified Record
                      </span>
                    )}

                    <span className="text-xs text-slate-500 font-mono">
                      op: {entry.operation_id.slice(0, 8)}...
                    </span>
                  </div>

                  <span className="text-xs text-slate-400">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>

                {/* State Transition Indicator */}
                {(entry.from_state || entry.to_state) && (
                  <div className="flex items-center gap-2 text-xs font-mono my-2 py-1 px-2.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                    <span className="text-slate-400">{entry.from_state || 'START'}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                    <span className="text-emerald-400 font-semibold">{entry.to_state}</span>
                  </div>
                )}

                {/* Details snippet */}
                {details && (
                  <div className="mt-2 text-xs font-mono text-slate-400 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 overflow-x-auto">
                    <pre className="text-[11px] leading-relaxed">
                      {JSON.stringify(details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

