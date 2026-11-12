'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  History, RefreshCw, ShieldCheck, Bug, ArrowRight,
  Download, FileText, CheckCircle2, XCircle, Clock,
  Search, Filter, Layers, ChevronDown, ChevronRight,
  Copy, Check, UserCheck, AlertTriangle, Cpu, Sparkles,
  ExternalLink, ShieldAlert, Hash
} from 'lucide-react';

const C = {
  primary: '#4F46E5', // Electric Indigo
  teal:    '#06B6D4', // Cyber Cyan
  orange:  '#D946EF', // Neon Magenta for review states
  pink:    '#D946EF', // Neon Magenta
  spark:   '#A5F3FC', // Highlight Spark
  white:   '#FFFFFF',
  gray1:   '#E2E8F0',
  gray2:   '#94A3B8',
  gray3:   '#475569',
  s0: '#05050A',
  s1: '#0A0A12',
  s2: '#121220',
  s3: '#1A1A2E',
  s4: '#22223C',
};

type FilterCategory = 'ALL' | 'EVIDENCE' | 'TRANSITIONS' | 'DECISIONS' | 'FAULTS';
type ViewMode = 'TIMELINE' | 'GROUPED';

export function AuditTimelineView({ currentUserId }: { currentUserId: string }) {
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<Record<string, { outcome?: string; status?: string; error?: string; reason?: string }>>({});
  
  // Visual controls
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('GROUPED');
  const [expandedPayloads, setExpandedPayloads] = useState<Record<number, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function copyToClipboard(text: string, key: string) {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  function togglePayload(auditId: number) {
    setExpandedPayloads(prev => ({ ...prev, [auditId]: !prev[auditId] }));
  }

  async function handleVerifyOp(operationId: string) {
    setVerifyingId(operationId);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-airlock-user': currentUserId },
        body: JSON.stringify({ operation_id: operationId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVerifyStatus((prev) => ({ ...prev, [operationId]: { error: data.error || `HTTP ${res.status}` } }));
      } else {
        setVerifyStatus((prev) => ({ ...prev, [operationId]: data.verification || data }));
      }
      await fetchAudit();
    } catch (e: any) {
      setVerifyStatus((prev) => ({ ...prev, [operationId]: { error: e.message || 'Verification request failed' } }));
    } finally {
      setVerifyingId(null);
    }
  }

  async function fetchAudit() {
    setLoading(true);
    try {
      const res = await fetch('/api/audit', { headers: { 'x-airlock-user': currentUserId } });
      const data = await res.json();
      setAuditRows(data.audit_log || []);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { fetchAudit(); }, [currentUserId]);

  async function handleExportCompliance() {
    setExporting(true);
    await new Promise(r => setTimeout(r, 1000));

    const totalOps     = auditRows.length;
    const deniedOps    = auditRows.filter(r => r.to_state === 'DENIED').length;
    const approvedOps  = auditRows.filter(r => r.to_state === 'APPROVED').length;
    const completedOps = auditRows.filter(r => r.to_state === 'COMPLETED' || r.to_state === 'SUCCEEDED').length;

    const dossier = `AIRLOCK AUDIT & CONTROL ALIGNMENT DOSSIER
=========================================
Generated: ${new Date().toISOString()}
System:    Airlock Prototype — Financial AI Safety Gateway
Status:    Informational Prototype Architecture Reference (Self-assessment; not an audited certification)

EXECUTIVE SUMMARY
-----------------
Total Audit Events:    ${totalOps}
Operations Completed:  ${completedOps}
Operations Denied:     ${deniedOps}
Human Approvals Used:  ${approvedOps}

SECURITY CONTROL ALIGNMENT (Design Reference)
---------------------------------------------
Notice: The items below describe architectural design alignments to common standards.
They do NOT constitute audited or certified compliance under SOC 2 Type II or PCI-DSS 4.0.

SOC 2 Trust Services Criteria Alignment:
CC6.1  — Logical access controls: Role-based caller evaluation in policy engine
CC7.2  — System monitoring: Append-only relational state transition log
CC8.1  — Change management: SHA-256 action hash bound to approval
CC9.2  — Risk mitigation: Advisory text safety scan with fail-safe degradation

PCI-DSS 4.0 Requirements Alignment:
Req 7  — Restrict access by business need: APPROVAL-002 separation of duties
Req 8  — Identification & authentication: Server-side identity resolution & action fingerprinting
Req 10 — Log and monitor all access: Append-only audit log with timestamped evidence

FULL AUDIT LOG
--------------
${auditRows.map(r => {
  const details = r.details ? JSON.parse(r.details) : null;
  return [
    `[${r.created_at}] ${r.event_type}`,
    `  Operation: ${r.operation_id}`,
    `  Transition: ${r.from_state || 'START'} → ${r.to_state || 'N/A'}`,
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

  // Filtered rows
  const filteredRows = useMemo(() => {
    return auditRows.filter(row => {
      // Category filter
      if (filterCategory === 'EVIDENCE' && row.event_type !== 'EVIDENCE_RECORDED') return false;
      if (filterCategory === 'TRANSITIONS' && !['STATE_TRANSITION', 'OPERATION_CREATED'].includes(row.event_type)) return false;
      if (filterCategory === 'DECISIONS' && !['DECISION_RECORDED', 'APPROVAL_REQUESTED', 'APPROVAL_GRANTED'].includes(row.event_type)) return false;
      if (filterCategory === 'FAULTS' && row.event_type !== 'SIMULATED_FAULT') return false;

      // Text query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const opMatch = row.operation_id?.toLowerCase().includes(q);
        const typeMatch = row.event_type?.toLowerCase().includes(q);
        const stateMatch = (row.from_state?.toLowerCase().includes(q) || row.to_state?.toLowerCase().includes(q));
        const detailsMatch = row.details?.toLowerCase().includes(q);
        if (!opMatch && !typeMatch && !stateMatch && !detailsMatch) return false;
      }
      return true;
    });
  }, [auditRows, filterCategory, searchQuery]);

  // Grouped by operation
  const groupedOperations = useMemo(() => {
    const groups: { operation_id: string; events: any[]; latestTimestamp: string; finalState?: string; isVerified?: boolean; hasEvidence?: boolean }[] = [];
    const map = new Map<string, any[]>();

    for (const row of filteredRows) {
      const opId = row.operation_id || 'unassigned';
      if (!map.has(opId)) {
        map.set(opId, []);
      }
      map.get(opId)!.push(row);
    }

    for (const [opId, events] of map.entries()) {
      // sorted chronologically within group (oldest to newest for natural flow)
      const sortedEvents = [...events].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      let finalState = 'UNKNOWN';
      let isVerified = false;
      let hasEvidence = false;

      for (const ev of sortedEvents) {
        if (ev.to_state) finalState = ev.to_state;
        if (ev.event_type === 'EVIDENCE_RECORDED') {
          hasEvidence = true;
          try {
            const d = JSON.parse(ev.details || '{}');
            if (d.outcome === 'VERIFIED_SUCCESS') isVerified = true;
          } catch {}
        }
      }

      groups.push({
        operation_id: opId,
        events: sortedEvents,
        latestTimestamp: sortedEvents[sortedEvents.length - 1]?.created_at || '',
        finalState,
        isVerified,
        hasEvidence,
      });
    }

    // Sort operations by latest event timestamp descending
    return groups.sort((a, b) => new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime());
  }, [filteredRows]);

  const stats = useMemo(() => {
    return {
      total: auditRows.length,
      succeeded: auditRows.filter(r => r.to_state === 'SUCCEEDED' || r.to_state === 'COMPLETED').length,
      evidence: auditRows.filter(r => r.event_type === 'EVIDENCE_RECORDED').length,
      denied: auditRows.filter(r => r.to_state === 'DENIED').length,
      awaiting: auditRows.filter(r => r.to_state === 'AWAITING_APPROVAL').length,
    };
  }, [auditRows]);

  const stateColor = (state: string) => {
    switch (state) {
      case 'SUCCEEDED':
      case 'COMPLETED':
        return C.teal;
      case 'DENIED':
        return C.pink;
      case 'AWAITING_APPROVAL':
        return C.orange;
      case 'APPROVED':
        return C.primary;
      case 'EXECUTING':
        return '#38BDF8';
      case 'READY':
        return '#818CF8';
      case 'EVALUATING':
        return '#C084FC';
      default:
        return C.gray2;
    }
  };

  const getEventBadge = (eventType: string) => {
    switch (eventType) {
      case 'EVIDENCE_RECORDED':
        return {
          icon: ShieldCheck,
          label: 'Evidence Recorded',
          bg: 'rgba(6, 182, 212, 0.12)',
          border: 'rgba(6, 182, 212, 0.35)',
          color: C.teal,
        };
      case 'STATE_TRANSITION':
        return {
          icon: ArrowRight,
          label: 'State Transition',
          bg: 'rgba(79, 70, 229, 0.12)',
          border: 'rgba(79, 70, 229, 0.35)',
          color: '#818CF8',
        };
      case 'OPERATION_CREATED':
        return {
          icon: Cpu,
          label: 'Intake / Created',
          bg: 'rgba(165, 243, 252, 0.08)',
          border: 'rgba(165, 243, 252, 0.25)',
          color: C.spark,
        };
      case 'DECISION_RECORDED':
        return {
          icon: Sparkles,
          label: 'Policy Decision',
          bg: 'rgba(217, 70, 239, 0.10)',
          border: 'rgba(217, 70, 239, 0.30)',
          color: C.pink,
        };
      case 'APPROVAL_REQUESTED':
      case 'APPROVAL_GRANTED':
        return {
          icon: UserCheck,
          label: eventType === 'APPROVAL_GRANTED' ? 'Approval Granted' : 'Approval Requested',
          bg: 'rgba(245, 158, 11, 0.12)',
          border: 'rgba(245, 158, 11, 0.35)',
          color: C.orange,
        };
      case 'SIMULATED_FAULT':
        return {
          icon: Bug,
          label: 'Simulated Fault',
          bg: 'rgba(245, 158, 11, 0.15)',
          border: 'rgba(245, 158, 11, 0.4)',
          color: C.orange,
        };
      default:
        return {
          icon: FileText,
          label: eventType,
          bg: 'rgba(148, 163, 184, 0.10)',
          border: 'rgba(148, 163, 184, 0.25)',
          color: C.gray2,
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b" style={{ borderColor: 'rgba(165,243,252,0.1)' }}>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-white tracking-wide">Audit & Evidence Timeline</h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider font-bold bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">
              Append-Only Ledger
            </span>
          </div>
          <p className="text-xs mt-1 font-medium" style={{ color: C.gray2 }}>
            Cryptographically linked state transitions, automated policy decisions, and live payment rail proofs.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleExportCompliance}
            disabled={exporting || auditRows.length === 0}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition shadow-sm disabled:opacity-40"
            style={exportDone
              ? { background: `${C.teal}18`, border: `1px solid ${C.teal}50`, color: C.teal }
              : { background: `${C.primary}18`, border: `1px solid ${C.primary}50`, color: '#A5B4FC' }
            }
          >
            {exportDone ? (
              <><CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" /> Dossier Exported!</>
            ) : exporting ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Compiling Dossier…</>
            ) : (
              <><Download className="w-3.5 h-3.5" /> Export Audit Dossier</>
            )}
          </button>

          <button
            onClick={fetchAudit}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg glass-card text-xs font-semibold transition hover-neon"
            style={{ border: `1px solid rgba(165,243,252,0.18)`, color: C.gray1 }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} style={{ color: loading ? C.teal : undefined }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {auditRows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total Events',   value: stats.total,     color: C.primary, Icon: FileText,     sub: 'Ledger depth' },
            { label: 'Succeeded',      value: stats.succeeded, color: C.teal,    Icon: CheckCircle2, sub: 'Provider executed' },
            { label: 'Evidence Proofs',value: stats.evidence,  color: C.spark,   Icon: ShieldCheck,  sub: 'Cryptographic' },
            { label: 'Denied / Blocked',value: stats.denied,   color: C.pink,    Icon: XCircle,      sub: 'Policy enforcement' },
            { label: 'Awaiting Signoff',value: stats.awaiting, color: C.orange,  Icon: Clock,        sub: 'Dual control' },
          ].map(stat => (
            <div
              key={stat.label}
              className="glass-card rounded-xl p-3.5 text-left hover-neon transition-all relative overflow-hidden"
              style={{ border: `1px solid rgba(165,243,252,0.12)` }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold" style={{ color: C.gray2 }}>{stat.label}</span>
                <stat.Icon className="w-4 h-4" style={{ color: stat.color }} />
              </div>
              <div className="text-2xl font-black tabular-nums tracking-tight" style={{ color: stat.color }}>
                {stat.value}
              </div>
              <div className="text-[10px] mt-0.5 font-medium" style={{ color: C.gray3 }}>
                {stat.sub}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter and View Controls Bar */}
      <div className="glass-card rounded-xl p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3"
        style={{ border: '1px solid rgba(165,243,252,0.12)' }}>
        
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {[
            { id: 'ALL', label: 'All Events', count: auditRows.length },
            { id: 'EVIDENCE', label: 'Evidence Proofs', count: stats.evidence },
            { id: 'TRANSITIONS', label: 'Transitions', count: auditRows.filter(r => ['STATE_TRANSITION', 'OPERATION_CREATED'].includes(r.event_type)).length },
            { id: 'DECISIONS', label: 'Decisions & Approvals', count: auditRows.filter(r => ['DECISION_RECORDED', 'APPROVAL_REQUESTED', 'APPROVAL_GRANTED'].includes(r.event_type)).length },
            { id: 'FAULTS', label: 'Simulated Faults', count: auditRows.filter(r => r.event_type === 'SIMULATED_FAULT').length },
          ].map(tab => {
            const active = filterCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilterCategory(tab.id as FilterCategory)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5"
                style={active ? {
                  background: 'rgba(6, 182, 212, 0.15)',
                  border: '1px solid rgba(6, 182, 212, 0.45)',
                  color: C.spark,
                } : {
                  background: 'rgba(18, 18, 32, 0.4)',
                  border: '1px solid rgba(74, 74, 74, 0.25)',
                  color: C.gray2,
                }}
              >
                <span>{tab.label}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono"
                  style={active ? { background: 'rgba(6,182,212,0.3)', color: '#FFFFFF' } : { background: 'rgba(74,74,74,0.3)', color: C.gray3 }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Layout toggle */}
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: C.gray3 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by Op ID, Capture ID, Hash..."
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg bg-black/40 border border-slate-700/60 focus:border-cyan-400 focus:outline-none text-slate-200 placeholder-slate-500 font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* View mode toggle */}
          <div className="flex items-center bg-black/40 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setViewMode('GROUPED')}
              title="Group by Operation (Full Lifecycle Journey)"
              className={`p-1.5 rounded text-xs flex items-center gap-1 font-medium transition ${
                viewMode === 'GROUPED'
                  ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">By Operation</span>
            </button>
            <button
              onClick={() => setViewMode('TIMELINE')}
              title="Chronological Continuous Stream"
              className={`p-1.5 rounded text-xs flex items-center gap-1 font-medium transition ${
                viewMode === 'TIMELINE'
                  ? 'bg-cyan-600/30 text-cyan-200 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Stream</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {filteredRows.length === 0 ? (
        <div className="glass-card rounded-xl p-14 text-center border-dashed" style={{ borderColor: 'rgba(165,243,252,0.15)' }}>
          <History className="w-10 h-10 mx-auto mb-3" style={{ color: C.gray3 }} />
          <p className="text-sm font-black text-white">No matching audit events</p>
          <p className="text-xs mt-1" style={{ color: C.gray3 }}>
            {auditRows.length === 0
              ? 'Submit actions in the New Request tab to populate the audit ledger.'
              : 'Try clearing your search query or switching categories.'}
          </p>
        </div>
      ) : viewMode === 'GROUPED' ? (
        /* ══════════════════════════════════════════════════════════════════════════════
           GROUPED VIEW: Visual Operation Lifecycle Cards
           ══════════════════════════════════════════════════════════════════════════════ */
        <div className="space-y-4">
          {groupedOperations.map((group) => {
            const hasVerifySuccess = group.isVerified || verifyStatus[group.operation_id]?.outcome === 'VERIFIED_SUCCESS';
            const v = verifyStatus[group.operation_id];
            const isVerifying = verifyingId === group.operation_id;

            return (
              <div
                key={group.operation_id}
                className="glass-card rounded-xl p-4 transition-all border"
                style={{
                  borderColor: hasVerifySuccess ? 'rgba(6, 182, 212, 0.4)' : 'rgba(165, 243, 252, 0.12)',
                  background: 'rgba(14, 14, 24, 0.85)',
                }}
              >
                {/* Operation Summary Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded font-mono bg-indigo-950/70 text-indigo-300 border border-indigo-500/30">
                      Operation
                    </span>
                    <span className="font-mono text-xs font-black text-white">
                      {group.operation_id}
                    </span>
                    <button
                      onClick={() => copyToClipboard(group.operation_id, `op-${group.operation_id}`)}
                      className="text-slate-400 hover:text-cyan-300 transition"
                      title="Copy Operation ID"
                    >
                      {copiedKey === `op-${group.operation_id}` ? (
                        <Check className="w-3.5 h-3.5 text-cyan-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    
                    {hasVerifySuccess ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-400/50 shadow-[0_0_12px_rgba(6,182,212,0.25)]">
                        <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" /> Verified On Rail ✓
                      </span>
                    ) : group.finalState === 'SUCCEEDED' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-500/40">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Succeeded
                      </span>
                    ) : group.finalState === 'DENIED' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-fuchsia-950/60 text-fuchsia-300 border border-fuchsia-500/40">
                        <XCircle className="w-3.5 h-3.5 text-fuchsia-400" /> Denied
                      </span>
                    ) : group.finalState === 'AWAITING_APPROVAL' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-300 border border-amber-500/40">
                        <Clock className="w-3.5 h-3.5 text-amber-400" /> Awaiting Approval
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-900 text-slate-300 border border-slate-700">
                        {group.finalState}
                      </span>
                    )}
                  </div>

                  {/* Actions / Verification Button */}
                  <div className="flex items-center gap-2">
                    {group.finalState === 'SUCCEEDED' && (
                      <button
                        onClick={() => handleVerifyOp(group.operation_id)}
                        disabled={isVerifying || hasVerifySuccess}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 border transition ${
                          hasVerifySuccess
                            ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 cursor-default opacity-80'
                            : v?.outcome === 'UNRESOLVED'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
                              : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border-cyan-500/40 shadow-sm'
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {isVerifying
                          ? 'Checking Rail State…'
                          : hasVerifySuccess
                            ? 'Provider State Verified ✓'
                            : 'Verify on Rail'}
                      </button>
                    )}
                    <span className="text-[10px] text-slate-400">
                      {new Date(group.latestTimestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                {/* Visual Lifecycle Steps Flow */}
                <div className="py-3 px-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1">
                    <span>Lifecycle Trace</span>
                    <span className="text-slate-600">({group.events.length} recorded events)</span>
                  </div>

                  <div className="relative pl-6 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                    {group.events.map((ev, stepIdx) => {
                      const badge = getEventBadge(ev.event_type);
                      const Icon = badge.icon;
                      const details = ev.details ? (typeof ev.details === 'string' ? JSON.parse(ev.details) : ev.details) : null;
                      const isExpanded = !!expandedPayloads[ev.audit_id];

                      return (
                        <div key={ev.audit_id} className="relative group">
                          {/* Dot on timeline */}
                          <div
                            className="absolute -left-6 top-1.5 w-4 h-4 rounded-full border flex items-center justify-center bg-slate-950 transition"
                            style={{ borderColor: badge.color }}
                          >
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: badge.color }} />
                          </div>

                          {/* Event Row */}
                          <div className="bg-slate-900/60 hover:bg-slate-900/90 border border-slate-800/80 hover:border-slate-700 rounded-lg p-3 transition">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded font-mono"
                                  style={{ background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color }}
                                >
                                  <Icon className="w-3 h-3" />
                                  {badge.label}
                                </span>

                                {/* State Transition Display */}
                                {(ev.from_state || ev.to_state) && (
                                  <div className="inline-flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded bg-black/60 border border-slate-800">
                                    <span className="text-slate-400">{ev.from_state || 'START'}</span>
                                    <ArrowRight className="w-3 h-3 text-slate-600" />
                                    <span className="font-bold" style={{ color: stateColor(ev.to_state) }}>
                                      {ev.to_state}
                                    </span>
                                  </div>
                                )}

                                {/* Highlight Outcome if Evidence */}
                                {details?.outcome && (
                                  <span
                                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${
                                      details.outcome === 'VERIFIED_SUCCESS'
                                        ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-400/40'
                                        : details.outcome === 'UNRESOLVED'
                                          ? 'bg-amber-950/80 text-amber-300 border border-amber-400/40'
                                          : 'bg-rose-950/80 text-rose-300 border border-rose-400/40'
                                    }`}
                                  >
                                    Outcome: {details.outcome}
                                  </span>
                                )}

                                {/* Provider Ref if available */}
                                {(details?.providerOperationId || details?.provider_refund_id) && (
                                  <div className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/30 text-cyan-200">
                                    <span>Rail Ref:</span>
                                    <span className="font-bold">{details.providerOperationId || details.provider_refund_id}</span>
                                    <button
                                      onClick={() => copyToClipboard(details.providerOperationId || details.provider_refund_id, `ref-${ev.audit_id}`)}
                                      title="Copy Provider Reference"
                                      className="text-cyan-400 hover:text-white"
                                    >
                                      {copiedKey === `ref-${ev.audit_id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                {details && Object.keys(details).length > 0 && (
                                  <button
                                    onClick={() => togglePayload(ev.audit_id)}
                                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 hover:bg-slate-700 transition flex items-center gap-1"
                                    title="Inspect JSON Payload"
                                  >
                                    <span>{'{ }'}</span>
                                    {isExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Human readable detail highlight */}
                            {details?.context && (
                              <p className="text-xs text-slate-300 mt-2 font-sans pl-1 border-l-2 border-indigo-500/50">
                                {details.context}
                              </p>
                            )}
                            {details?.message && (
                              <p className="text-xs text-amber-300/90 mt-2 font-sans pl-1 border-l-2 border-amber-500/50">
                                {details.message}
                              </p>
                            )}
                            {details?.evidence_id && (
                              <div className="mt-2 flex items-center gap-2 text-[10px] font-mono text-slate-400 bg-black/40 px-2 py-1 rounded border border-slate-800">
                                <span className="text-cyan-400 font-bold">Evidence ID:</span>
                                <span className="truncate">{details.evidence_id}</span>
                                <button
                                  onClick={() => copyToClipboard(details.evidence_id, `ev-${details.evidence_id}`)}
                                  className="text-slate-400 hover:text-cyan-300"
                                >
                                  {copiedKey === `ev-${details.evidence_id}` ? <Check className="w-3 h-3 text-cyan-400" /> : <Copy className="w-3 h-3" />}
                                </button>
                              </div>
                            )}

                            {/* Collapsible Raw JSON */}
                            {isExpanded && details && (
                              <div className="mt-2.5 pt-2 border-t border-slate-800">
                                <div className="text-[10px] text-slate-400 font-mono mb-1">Raw Ledger Record Payload:</div>
                                <pre className="text-[10px] font-mono p-2.5 rounded bg-black/80 border border-slate-800 text-cyan-300/90 overflow-x-auto leading-relaxed">
                                  {JSON.stringify(details, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════════════════════
           STREAM VIEW: Continuous Chronological Vertical Rail
           ══════════════════════════════════════════════════════════════════════════════ */
        <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
          {filteredRows.map((entry, idx) => {
            const badge = getEventBadge(entry.event_type);
            const Icon = badge.icon;
            const details = entry.details ? (typeof entry.details === 'string' ? JSON.parse(entry.details) : entry.details) : null;
            const isFault = entry.event_type === 'SIMULATED_FAULT' || entry.details?.includes('fault');
            const isExpanded = !!expandedPayloads[entry.audit_id];

            return (
              <div key={entry.audit_id} className="relative group">
                {/* Timeline Node Dot */}
                <div
                  className="absolute -left-6 top-3 w-4 h-4 rounded-full border-2 flex items-center justify-center bg-slate-950 transition shadow-sm"
                  style={{ borderColor: badge.color }}
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: badge.color }} />
                </div>

                {/* Event Card */}
                <div
                  className="glass-card rounded-xl p-4 hover-neon transition-all border"
                  style={{ border: `1px solid rgba(165,243,252,0.12)` }}
                >
                  {/* Top Bar: Event Type, Status, Timestamp */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="inline-flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded"
                        style={{ background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color }}
                      >
                        <Icon className="w-3 h-3" />
                        {entry.event_type}
                      </span>

                      {isFault && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40">
                          <Bug className="w-3 h-3" /> Simulated Fault
                        </span>
                      )}

                      <span className="text-[10px] font-mono text-slate-400">
                        #{entry.audit_id} · op:{entry.operation_id?.slice(0, 8)}…
                      </span>
                    </div>

                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>

                  {/* Transition and Verification Banner */}
                  <div className="flex flex-wrap items-center justify-between gap-2 my-2.5">
                    {(entry.from_state || entry.to_state) && (
                      <div className="flex items-center gap-2 text-xs font-mono py-1.5 px-3 rounded-lg bg-black/60 border border-slate-800">
                        <span className="text-slate-400">{entry.from_state || 'START'}</span>
                        <ArrowRight className="w-3 h-3 text-slate-600" />
                        <span className="font-black" style={{ color: stateColor(entry.to_state) }}>
                          {entry.to_state}
                        </span>
                      </div>
                    )}

                    {/* Outcome verification trigger on SUCCEEDED state */}
                    {entry.to_state === 'SUCCEEDED' && (() => {
                      const v = verifyStatus[entry.operation_id];
                      const isSuccess = v?.outcome === 'VERIFIED_SUCCESS';
                      const isFailure = v?.outcome === 'VERIFIED_FAILURE';
                      const isUnresolved = v?.outcome === 'UNRESOLVED';
                      const isError = !!v?.error;

                      return (
                        <div className="flex items-center gap-2 flex-wrap">
                          {isSuccess && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 bg-cyan-950/80 text-cyan-300 border border-cyan-500/40">
                              <ShieldCheck className="w-3 h-3 text-cyan-400" /> Provider verified
                            </span>
                          )}
                          {isFailure && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 bg-fuchsia-950/80 text-fuchsia-300 border border-fuchsia-500/40">
                              <XCircle className="w-3 h-3 text-fuchsia-400" /> Confirmed Failure
                            </span>
                          )}
                          {isUnresolved && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 bg-amber-950/80 text-amber-300 border border-amber-500/40">
                              <Clock className="w-3 h-3 text-amber-400" /> Inconclusive
                            </span>
                          )}
                          {isError && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 bg-pink-950/80 text-pink-300 border border-pink-500/40">
                              <Bug className="w-3 h-3 text-pink-400" /> {v?.error}
                            </span>
                          )}

                          <button
                            onClick={() => handleVerifyOp(entry.operation_id)}
                            disabled={verifyingId === entry.operation_id || isSuccess}
                            className={`text-[10px] font-bold px-2.5 py-1 rounded flex items-center gap-1 border transition ${
                              isSuccess
                                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 cursor-default opacity-60'
                                : isFailure || isUnresolved || isError
                                  ? 'bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border-indigo-500/50 cursor-pointer'
                                  : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border-cyan-500/30 cursor-pointer'
                            }`}
                          >
                            <ShieldCheck className="w-3 h-3" />
                            {verifyingId === entry.operation_id
                              ? 'Verifying...'
                              : isSuccess
                                ? 'Verified ✓'
                                : 'Verify on Provider Rail'}
                          </button>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Highlights section (Evidence, Provider Op ID, Context) */}
                  {details && (
                    <div className="space-y-2 mt-2">
                      {details.context && (
                        <p className="text-xs text-slate-300 font-sans border-l-2 border-indigo-500/60 pl-2">
                          {details.context}
                        </p>
                      )}
                      {details.message && (
                        <p className="text-xs text-amber-300/90 font-sans border-l-2 border-amber-500/60 pl-2">
                          {details.message}
                        </p>
                      )}

                      {/* Structured Metadata Badges */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {details.providerOperationId && (
                          <div className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/30 text-cyan-200">
                            <span>Rail Ref:</span>
                            <span className="font-bold">{details.providerOperationId}</span>
                            <button
                              onClick={() => copyToClipboard(details.providerOperationId, `stream-ref-${entry.audit_id}`)}
                              className="text-cyan-400 hover:text-white"
                            >
                              {copiedKey === `stream-ref-${entry.audit_id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        )}

                        {details.evidence_id && (
                          <div className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                            <span className="text-cyan-400 font-bold">Evidence:</span>
                            <span>{details.evidence_id.slice(0, 12)}…</span>
                            <button
                              onClick={() => copyToClipboard(details.evidence_id, `stream-ev-${entry.audit_id}`)}
                              className="text-slate-400 hover:text-cyan-300"
                            >
                              {copiedKey === `stream-ev-${entry.audit_id}` ? <Check className="w-3 h-3 text-cyan-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        )}

                        {details.outcome && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            details.outcome === 'VERIFIED_SUCCESS'
                              ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40'
                              : 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                          }`}>
                            Outcome: {details.outcome}
                          </span>
                        )}

                        <button
                          onClick={() => togglePayload(entry.audit_id)}
                          className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 transition flex items-center gap-1"
                        >
                          <span>{'{ } Raw Payload'}</span>
                          {isExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                        </button>
                      </div>

                      {/* Expandable JSON payload */}
                      {isExpanded && (
                        <div className="mt-2 pt-2 border-t border-slate-800">
                          <pre className="text-[10px] font-mono p-2.5 rounded bg-black/80 border border-slate-800 text-cyan-300/90 overflow-x-auto leading-relaxed">
                            {JSON.stringify(details, null, 2)}
                          </pre>
                        </div>
                      )}
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
