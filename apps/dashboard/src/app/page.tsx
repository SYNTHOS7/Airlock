'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Header, type UserContextValue, USERS } from '@/components/Header';
import { NewRequestView } from '@/components/NewRequestView';
import { ApprovalQueueView } from '@/components/ApprovalQueueView';
import { AuditTimelineView } from '@/components/AuditTimelineView';
import { RedTeamView } from '@/components/RedTeamView';
import { PlusCircle, Clock, History, Bug, ShieldCheck } from 'lucide-react';

const C = {
  primary: '#4A90E2', teal: '#50E3C2', orange: '#F5A623', pink: '#E94E77',
  violet: '#9013FE', gold: '#F8E71C', white: '#FFFFFF', gray1: '#D1D1D1',
  gray2: '#B7B7B7', gray3: '#4A4A4A', s0: '#07090f', s1: '#0e1117', s3: '#1c2333',
};

type TabId = 'request' | 'queue' | 'audit' | 'redteam';
interface Metrics { protected: number; blocked: number; latencyMs: number; }

const TABS: { id: TabId; label: string; Icon: React.FC<any>; color: string; badge?: true; isNew?: true }[] = [
  { id: 'request', label: 'New Request',    Icon: PlusCircle, color: C.teal    },
  { id: 'queue',   label: 'Approval Queue', Icon: Clock,      color: C.orange, badge: true },
  { id: 'audit',   label: 'Audit Timeline', Icon: History,    color: C.primary },
  { id: 'redteam', label: 'Red-Team Lab',   Icon: Bug,        color: C.pink,   isNew: true },
];

export default function DashboardPage() {
  const [currentUser, setCurrentUser] = useState<UserContextValue>(USERS[0]);
  const [activeTab,   setActiveTab]   = useState<TabId>('request');
  const [pendingCount, setPendingCount] = useState(0);
  const [metrics, setMetrics] = useState<Metrics>({ protected: 0, blocked: 0, latencyMs: 0 });

  async function updatePendingCount() {
    try {
      const res = await fetch('/api/approvals');
      const data = await res.json();
      setPendingCount(data.approvals?.length || 0);
    } catch {}
  }

  async function fetchMetrics() {
    try {
      const t0  = Date.now();
      const res = await fetch('/api/audit');
      const data = await res.json();
      const latency = Date.now() - t0;
      const rows: any[] = data.audit_log || [];
      setMetrics({
        protected: rows.filter(r => ['COMPLETED', 'AWAITING_APPROVAL'].includes(r.to_state)).length,
        blocked:   rows.filter(r => r.to_state === 'DENIED').length,
        latencyMs: latency,
      });
    } catch {}
  }

  useEffect(() => {
    updatePendingCount();
    fetchMetrics();
    const iv = setInterval(() => { updatePendingCount(); fetchMetrics(); }, 6000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.s0, color: C.white }}>
      <Header
        currentUser={currentUser}
        onUserChange={setCurrentUser}
        pendingApprovalsCount={pendingCount}
        metrics={metrics}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-6">

        {/* Nav Tabs */}
        <div className="flex items-center gap-1" style={{ borderBottom: `1px solid rgba(74,74,74,0.4)` }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-4 py-3 text-sm font-bold transition relative"
                style={{
                  color: isActive ? tab.color : C.gray3,
                  borderBottom: isActive ? `2px solid ${tab.color}` : '2px solid transparent',
                }}
              >
                <tab.Icon className="w-4 h-4" />
                {tab.label}
                {tab.badge && pendingCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black min-w-[18px] text-center"
                    style={{ background: C.orange, color: C.s0 }}>
                    {pendingCount}
                  </span>
                )}
                {tab.isNew && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-black"
                    style={{ background: `${C.pink}20`, border: `1px solid ${C.pink}40`, color: C.pink }}>
                    NEW
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* View */}
        <div>
          {activeTab === 'request'  && <NewRequestView    currentUser={currentUser} onActionComplete={updatePendingCount} />}
          {activeTab === 'queue'    && <ApprovalQueueView currentUser={currentUser} onActionComplete={updatePendingCount} />}
          {activeTab === 'audit'    && <AuditTimelineView />}
          {activeTab === 'redteam' && <RedTeamView currentUser={currentUser} />}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-3 px-6" style={{ borderTop: `1px solid rgba(74,74,74,0.25)`, background: 'rgba(14,17,23,0.8)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between text-[11px]" style={{ color: C.gray3 }}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5" style={{ color: `${C.teal}60` }} />
            <span>Airlock — Zero-Trust Financial AI Safety Gateway</span>
          </div>
          <div className="flex items-center gap-4">
            <span style={{ color: 'rgba(74,74,74,0.7)' }}>MCP · TypeSafe Jev · SHA-256 · WAL</span>
            <span className="font-black" style={{ color: `${C.primary}80` }}>PayPal AI Hackathon 2025</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
