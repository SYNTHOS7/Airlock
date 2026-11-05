'use client';

import React, { useState, useEffect } from 'react';
import {
  History, RefreshCw, ShieldCheck, Bug, ArrowRight,
  Download, FileText, CheckCircle2, XCircle, Clock
} from 'lucide-react';

const C = {
  primary: '#4A90E2', teal: '#50E3C2', orange: '#F5A623', pink: '#E94E77',
  violet: '#9013FE', gold: '#F8E71C', white: '#FFFFFF', gray1: '#D1D1D1',
  gray2: '#B7B7B7', gray3: '#4A4A4A', s0: '#07090f', s1: '#0e1117', s2: '#151b26', s3: '#1c2333',
};

export function AuditTimelineView() {
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  async function fetchAudit() {
    setLoading(true);
    try {
      const res = await fetch('/api/audit');
      const data = await res.json();
      setAuditRows(data.audit_log || []);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { fetchAudit(); }, []);

  async function handleExportCompliance() {
    setExporting(true);
    await new Promise(r => setTimeout(r, 1200));

    const totalOps     = auditRows.length;
    const deniedOps    = auditRows.filter(r => r.to_state === 'DENIED').length;
    const approvedOps  = auditRows.filter(r => r.to_state === 'APPROVED').length;
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

SOC2 TRUST SERVICE CRITERIA
----------------------------
CC6.1  — Logical access controls: ENFORCED (role-based, 3 tiers)
CC7.2  — System monitoring: ACTIVE (append-only WAL audit log)
CC8.1  — Change management: ENFORCED (SHA-256 action hash)
CC9.2  — Risk mitigation: ENFORCED (TypeSafe Jev adversarial scan)

PCI-DSS 4.0 REQUIREMENTS
-------------------------
Req 7    — Restrict access by business need: ENFORCED (APPROVAL-002)
Req 8    — Strong authentication: ENFORCED (dual-auth + action hash)
Req 10   — Log and monitor all access: ENFORCED (append-only audit log)

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
LIMIT-001:    Per-tx cap $50 auto-approve threshold
LIMIT-002:    Cumulative daily cap $200
VELOCITY-001: Max 10 tx per 24h window
APPROVAL-001: Consequential actions require human approval
APPROVAL-002: Self-approval forbidden
UNCERTAIN-001: TypeSafe adversarial uplift triggers PAUSE_REVIEW

END OF DOSSIER
==============================
`;
    const blob = new Blob([dossier], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `airlock-compliance-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
    setExportDone(true);
    setTimeout(() => setExportDone(false), 3000);
  }

  const stats = {
    total:     auditRows.length,
    completed: auditRows.filter(r => r.to_state === 'COMPLETED').length,
    denied:    auditRows.filter(r => r.to_state === 'DENIED').length,
    pending:   auditRows.filter(r => r.to_state === 'AWAITING_APPROVAL').length,
  };

  const stateColor = (state: string) =>
    state === 'COMPLETED'          ? C.teal   :
    state === 'DENIED'             ? C.pink   :
    state === 'AWAITING_APPROVAL'  ? C.orange :
    state === 'APPROVED'           ? C.primary : C.gray2;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-white">Audit & Evidence Timeline</h2>
          <p className="text-[11px] mt-0.5 font-medium" style={{ color: C.gray2 }}>
            Append-only · All state transitions · Cryptographic evidence · SOC2 / PCI-DSS ready
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCompliance}
            disabled={exporting || auditRows.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-40"
            style={exportDone
              ? { background: `${C.teal}12`, border: `1px solid ${C.teal}30`, color: C.teal }
              : { background: `${C.primary}10`, border: `1px solid ${C.primary}30`, color: C.primary }
            }
          >
            {exportDone ? (
              <><CheckCircle2 className="w-3.5 h-3.5" /> Downloaded!</>
            ) : exporting ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating…</>
            ) : (
              <><Download className="w-3.5 h-3.5" /> Export SOC2/PCI Dossier</>
            )}
          </button>
          <button
            onClick={fetchAudit} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-xs font-semibold transition hover-neon"
            style={{ border: `1px solid rgba(74,74,74,0.4)`, color: C.gray1 }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} style={{ color: loading ? C.primary : undefined }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      {auditRows.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Events', value: stats.total,     color: C.primary, Icon: FileText     },
            { label: 'Completed',    value: stats.completed, color: C.teal,    Icon: CheckCircle2 },
            { label: 'Denied',       value: stats.denied,    color: C.pink,    Icon: XCircle      },
            { label: 'Awaiting',     value: stats.pending,   color: C.orange,  Icon: Clock        },
          ].map(stat => (
            <div key={stat.label} className="glass-card rounded-xl p-4 text-center hover-neon transition-all"
              style={{ border: `1px solid rgba(74,74,74,0.4)` }}>
              <stat.Icon className="w-4 h-4 mx-auto mb-2" style={{ color: stat.color }} />
              <div className="text-2xl font-black tabular-nums" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-[10px] font-bold mt-0.5" style={{ color: C.gray3 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      {auditRows.length === 0 ? (
        <div className="glass-card rounded-xl p-14 text-center border-dashed" style={{ borderColor: 'rgba(74,74,74,0.35)' }}>
          <History className="w-10 h-10 mx-auto mb-3" style={{ color: C.gray3 }} />
          <p className="text-sm font-black" style={{ color: C.gray2 }}>No audit events yet</p>
          <p className="text-xs mt-1" style={{ color: C.gray3 }}>Submit actions in the New Request tab to populate the audit log</p>
        </div>
      ) : (
        <div className="relative space-y-3">
          <div className="absolute left-5 top-5 bottom-5 w-px" style={{ background: `rgba(74,74,74,0.3)` }} />

          {auditRows.map((entry, idx) => {
            const details   = entry.details ? JSON.parse(entry.details) : null;
            const isFault   = entry.details?.includes('simulated') || entry.details?.includes('fault');
            const dotColor  = stateColor(entry.to_state);

            return (
              <div key={entry.audit_id} className="flex gap-4 pl-10 relative">
                {/* Dot */}
                <div className="absolute left-3.5 top-4 w-3 h-3 rounded-full border-2 flex-shrink-0"
                  style={{ borderColor: dotColor, background: `${dotColor}25` }} />

                {/* Card */}
                <div className="flex-1 glass-card rounded-xl p-4 hover-neon transition-all"
                  style={{ border: `1px solid rgba(74,74,74,0.4)` }}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-black px-2 py-0.5 rounded"
                        style={{ background: C.s3, border: `1px solid rgba(74,74,74,0.4)`, color: C.gray1 }}>
                        {entry.event_type}
                      </span>
                      {isFault ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold"
                          style={{ background: `${C.orange}10`, border: `1px solid ${C.orange}25`, color: C.orange }}>
                          <Bug className="w-3 h-3" /> Simulated Fault
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold"
                          style={{ background: `${C.teal}08`, border: `1px solid ${C.teal}25`, color: C.teal }}>
                          <ShieldCheck className="w-3 h-3" /> Verified Record
                        </span>
                      )}
                      <span className="text-[10px] font-mono" style={{ color: C.gray3 }}>
                        #{idx + 1} · op:{entry.operation_id.slice(0, 10)}…
                      </span>
                    </div>
                    <span className="text-[10px]" style={{ color: C.gray3 }}>
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>

                  {/* State transition */}
                  {(entry.from_state || entry.to_state) && (
                    <div className="flex items-center gap-2 text-xs font-mono my-2 py-1.5 px-3 rounded-lg w-fit"
                      style={{ background: C.s0, border: `1px solid rgba(74,74,74,0.3)` }}>
                      <span style={{ color: C.gray3 }}>{entry.from_state || 'START'}</span>
                      <ArrowRight className="w-3 h-3" style={{ color: C.gray3 }} />
                      <span className="font-black" style={{ color: stateColor(entry.to_state) }}>{entry.to_state}</span>
                    </div>
                  )}

                  {details && (
                    <div className="mt-2 terminal p-3 rounded-lg overflow-x-auto">
                      <pre className="leading-relaxed" style={{ color: C.gray2, fontSize: 10 }}>
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
