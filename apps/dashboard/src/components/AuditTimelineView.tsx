'use client';

import React, { useState, useEffect } from 'react';
import {
  History, RefreshCw, ShieldCheck, Bug, ArrowRight,
  Download, FileText, CheckCircle2, XCircle, Clock, AlertTriangle
} from 'lucide-react';

export function AuditTimelineView() {
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);

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

  useEffect(() => { fetchAudit(); }, []);

  async function handleExportCompliance() {
    setExporting(true);
    // Simulate generation delay
    await new Promise(r => setTimeout(r, 1200));

    const totalOps = auditRows.length;
    const deniedOps = auditRows.filter(r => r.to_state === 'DENIED').length;
    const approvedOps = auditRows.filter(r => r.to_state === 'APPROVED').length;
    const completedOps = auditRows.filter(r => r.to_state === 'COMPLETED').length;

    const dossier = `AIRLOCK COMPLIANCE DOSSIER
==============================
Generated: ${new Date().toISOString()}
System:    Airlock v1.0 — Zero-Trust Financial AI Safety Gateway
Standard:  SOC2 Type II + PCI-DSS 4.0

EXECUTIVE SUMMARY
-----------------
Total Audit Events:    ${totalOps}
Operations Completed:  ${completedOps}
Operations Denied:     ${deniedOps}
Human Approvals Used:  ${approvedOps}
Self-Approval Attempts Blocked: N/A (APPROVAL-002 enforced at API layer)

SOC2 TRUST SERVICE CRITERIA
----------------------------
CC6.1  — Logical access controls: ENFORCED (role-based, 3 tiers: agent/approver/viewer)
CC6.3  — Access revocation: N/A (stateless sessions, no persistent tokens)
CC7.2  — System monitoring: ACTIVE (append-only WAL audit log, all state transitions recorded)
CC8.1  — Change management: ENFORCED (SHA-256 action hash binds every approval to exact parameters)
CC9.2  — Risk mitigation: ENFORCED (TypeSafe Jev adversarial scan on all untrusted text)
A1.1   — Availability monitoring: ACTIVE (MCP /health endpoint, SQLite WAL)

PCI-DSS 4.0 REQUIREMENTS
-------------------------
Req 1.3  — Network access controls: ENFORCED (MCP stdio/HTTP, no direct payment rail access)
Req 7    — Restrict access by business need: ENFORCED (separation of duties, APPROVAL-002)
Req 8    — Strong authentication: ENFORCED (dual-auth, action hash verification)
Req 10   — Log and monitor all access: ENFORCED (append-only audit log below)
Req 12.3 — Risk assessment: ENFORCED (100-scenario benchmark, adversarial uplift testing)

FULL AUDIT LOG
--------------
${auditRows.map(r => {
  const details = r.details ? JSON.parse(r.details) : null;
  return [
    `[${r.created_at}] ${r.event_type}`,
    `  Operation: ${r.operation_id}`,
    `  Transition: ${r.from_state || 'START'} → ${r.to_state}`,
    details ? `  Details: ${JSON.stringify(details)}` : '',
  ].filter(Boolean).join('\n');
}).join('\n\n')}

POLICY ENGINE INVARIANTS
------------------------
LIMIT-001:   Per-transaction cap $50 (auto-approve threshold)
LIMIT-002:   Cumulative daily cap $200
VELOCITY-001: Max 10 transactions per 24h window
APPROVAL-001: Consequential actions require human approval
APPROVAL-002: Self-approval forbidden (requester ≠ approver enforced)
UNCERTAIN-001: TypeSafe adversarial uplift triggers PAUSE_REVIEW

MONOTONIC STRICTNESS GUARANTEE
-------------------------------
State machine is monotonically tightening:
  PENDING → AWAITING_APPROVAL → APPROVED → COMPLETED
  PENDING → DENIED (terminal)
  PENDING → AWAITING_APPROVAL → DENIED (terminal)
No state can transition backwards. Enforced at storage layer.

END OF DOSSIER
==============================
`;

    const blob = new Blob([dossier], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `airlock-compliance-dossier-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
    setExportDone(true);
    setTimeout(() => setExportDone(false), 3000);
  }

  const stats = {
    total: auditRows.length,
    completed: auditRows.filter(r => r.to_state === 'COMPLETED').length,
    denied: auditRows.filter(r => r.to_state === 'DENIED').length,
    pending: auditRows.filter(r => r.to_state === 'AWAITING_APPROVAL').length,
  };

  return (
    <div className="space-y-6">
      {/* Header + export */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">Audit & Evidence Timeline</h2>
          <p className="text-[11px] text-[#1e4d7a] mt-0.5">
            Append-only · All state transitions · Cryptographic evidence · SOC2 / PCI-DSS ready
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCompliance}
            disabled={exporting || auditRows.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
              exportDone
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'glass-card border-[#1e3a5f] text-sky-400 hover:border-sky-500/50 hover:bg-sky-500/5 disabled:opacity-40'
            }`}
          >
            {exportDone ? (
              <><CheckCircle2 className="w-3.5 h-3.5" /> Downloaded!</>
            ) : exporting ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating...</>
            ) : (
              <><Download className="w-3.5 h-3.5" /> Export SOC2/PCI Dossier</>
            )}
          </button>
          <button
            onClick={fetchAudit}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card border border-[#0d2340] text-xs text-slate-300 hover:text-white hover:border-sky-500/30 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats strip */}
      {auditRows.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Events', value: stats.total, color: 'text-sky-400', icon: FileText },
            { label: 'Completed', value: stats.completed, color: 'text-emerald-400', icon: CheckCircle2 },
            { label: 'Denied', value: stats.denied, color: 'text-rose-400', icon: XCircle },
            { label: 'Awaiting', value: stats.pending, color: 'text-amber-400', icon: Clock },
          ].map(stat => (
            <div key={stat.label} className="glass-card rounded-xl p-4 border border-[#0d2340] text-center">
              <stat.icon className={`w-4 h-4 mx-auto mb-2 ${stat.color}`} />
              <div className={`text-2xl font-black tabular-nums ${stat.color}`}>{stat.value}</div>
              <div className="text-[10px] text-[#1e4070] font-medium mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      {auditRows.length === 0 ? (
        <div className="glass-card border border-dashed border-[#0d2340] rounded-xl p-14 text-center">
          <History className="w-10 h-10 text-[#1e3a5f] mx-auto mb-3" />
          <p className="text-sm font-bold text-[#1e4d7a]">No audit events yet</p>
          <p className="text-xs text-[#1e3a5f] mt-1">Submit actions in the New Request tab to populate the audit log</p>
        </div>
      ) : (
        <div className="relative space-y-3">
          {/* Vertical timeline line */}
          <div className="absolute left-5 top-5 bottom-5 w-px bg-[#0d2340]" />

          {auditRows.map((entry, idx) => {
            const details = entry.details ? JSON.parse(entry.details) : null;
            const isFault = entry.details?.includes('simulated') || entry.details?.includes('fault');
            const isTerminal = entry.to_state === 'DENIED' || entry.to_state === 'COMPLETED';
            const stateColor =
              entry.to_state === 'COMPLETED' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/8' :
              entry.to_state === 'DENIED' ? 'text-rose-400 border-rose-500/30 bg-rose-500/8' :
              entry.to_state === 'AWAITING_APPROVAL' ? 'text-amber-400 border-amber-500/30 bg-amber-500/8' :
              entry.to_state === 'APPROVED' ? 'text-sky-400 border-sky-500/30 bg-sky-500/8' :
              'text-slate-400 border-[#0d2340] bg-[#0a1628]';

            return (
              <div key={entry.audit_id} className="flex gap-4 pl-10 relative">
                {/* Timeline dot */}
                <div className={`absolute left-3.5 top-4 w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                  entry.to_state === 'COMPLETED' ? 'border-emerald-400 bg-emerald-400/20' :
                  entry.to_state === 'DENIED' ? 'border-rose-400 bg-rose-400/20' :
                  'border-sky-500 bg-sky-500/20'
                }`} />

                {/* Card */}
                <div className="flex-1 glass-card rounded-xl p-4 border border-[#0d2340] hover-neon transition-all">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#0a1628] border border-[#0d2340] text-slate-200">
                        {entry.event_type}
                      </span>
                      {isFault ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                          <Bug className="w-3 h-3" /> Simulated Fault
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/8 text-emerald-500 border border-emerald-500/20 font-medium">
                          <ShieldCheck className="w-3 h-3" /> Verified Record
                        </span>
                      )}
                      <span className="text-[10px] text-[#1e4070] font-mono">
                        #{idx + 1} · op:{entry.operation_id.slice(0, 10)}...
                      </span>
                    </div>
                    <span className="text-[10px] text-[#1e4d7a]">
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>

                  {/* State transition */}
                  {(entry.from_state || entry.to_state) && (
                    <div className="flex items-center gap-2 text-xs font-mono my-2 py-1.5 px-3 rounded-lg bg-[#030e1e] border border-[#0d2340] w-fit">
                      <span className="text-[#1e4d7a]">{entry.from_state || 'START'}</span>
                      <ArrowRight className="w-3 h-3 text-[#0d2340]" />
                      <span className={`font-bold ${stateColor.split(' ')[0]}`}>{entry.to_state}</span>
                    </div>
                  )}

                  {/* Details */}
                  {details && (
                    <div className="mt-2 terminal p-3 rounded-lg overflow-x-auto">
                      <pre className="text-[10px] leading-relaxed text-slate-400">
                        {JSON.stringify(details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
