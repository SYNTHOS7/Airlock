'use client';

import React, { useState, useEffect } from 'react';
import { Header, type UserContextValue, USERS } from '@/components/Header';
import { AgenticCommerceView } from '@/components/AgenticCommerceView';
import { NewRequestView } from '@/components/NewRequestView';
import { ApprovalQueueView } from '@/components/ApprovalQueueView';
import { AuditTimelineView } from '@/components/AuditTimelineView';
import { RedTeamView } from '@/components/RedTeamView';
import { PolicyStudioView, type PolicyStudioSettings } from '@/components/PolicyStudioView';
import { Bot, PlusCircle, Clock, History, Bug, SlidersHorizontal, ShieldCheck } from 'lucide-react';

const C = {
  primary: '#4A90E2', teal: '#50E3C2', orange: '#F5A623', pink: '#E94E77',
  violet: '#9013FE', gold: '#F8E71C', white: '#FFFFFF', gray1: '#D1D1D1',
  gray2: '#B7B7B7', gray3: '#4A4A4A', s0: '#07090f', s1: '#0e1117', s3: '#1c2333',
};

type TabId = 'agentic' | 'request' | 'queue' | 'audit' | 'redteam' | 'studio';
interface Metrics { protected: number; blocked: number; latencyMs: number; capitalProtectedUsd?: number; }

const TABS: { id: TabId; label: string; Icon: React.FC<any>; color: string; badge?: true; isNew?: string }[] = [
  { id: 'agentic', label: 'Agentic Commerce', Icon: Bot,               color: C.teal,    isNew: 'AI WHEEL' },
  { id: 'request', label: 'New Request',      Icon: PlusCircle,        color: C.primary },
  { id: 'queue',   label: 'Approval Queue',   Icon: Clock,             color: C.orange,  badge: true },
  { id: 'audit',   label: 'Audit Timeline',   Icon: History,           color: C.primary },
  { id: 'redteam', label: 'Red-Team Lab',     Icon: Bug,               color: C.pink,    isNew: 'DEFENSE' },
  { id: 'studio',  label: 'Policy Studio',    Icon: SlidersHorizontal, color: C.gold,    isNew: 'STUDIO' },
];

export default function DashboardPage() {
  const [currentUser, setCurrentUser] = useState<UserContextValue>(USERS[0]);
  const [activeTab,   setActiveTab]   = useState<TabId>('agentic');
  const [pendingCount, setPendingCount] = useState(0);
  const [metrics, setMetrics] = useState<Metrics>({ protected: 0, blocked: 0, latencyMs: 0 });
  const [policySettings, setPolicySettings] = useState<PolicyStudioSettings>({
    approvalThreshold: 50,
    cumulativeCap: 200,
    velocityLimit: 5,
    jevSensitivity: 'standard',
  });

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
      const protectedCount = rows.filter(r => ['COMPLETED', 'AWAITING_APPROVAL'].includes(r.to_state)).length;
      const blockedCount = rows.filter(r => r.to_state === 'DENIED').length;

      setMetrics({
        protected: protectedCount,
        blocked:   blockedCount,
        latencyMs: latency,
        capitalProtectedUsd: blockedCount * 350 + 14850,
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
        <div className="flex items-center gap-1 overflow-x-auto pb-1" style={{ borderBottom: `1px solid rgba(74,74,74,0.4)` }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-4 py-3 text-sm font-bold transition relative whitespace-nowrap"
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
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-black tracking-wide"
                    style={{ background: `${tab.color}20`, border: `1px solid ${tab.color}40`, color: tab.color }}>
                    {tab.isNew}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* View Routing */}
        <div>
          {activeTab === 'agentic' && (
            <AgenticCommerceView
              currentUser={currentUser}
              onActionComplete={updatePendingCount}
            />
          )}
          {activeTab === 'request' && (
            <NewRequestView
              currentUser={currentUser}
              onActionComplete={updatePendingCount}
              policySettings={policySettings}
            />
          )}
          {activeTab === 'queue' && (
            <ApprovalQueueView
              currentUser={currentUser}
              onActionComplete={updatePendingCount}
            />
          )}
          {activeTab === 'audit' && <AuditTimelineView />}
          {activeTab === 'redteam' && <RedTeamView currentUser={currentUser} />}
          {activeTab === 'studio' && (
            <PolicyStudioView
              settings={policySettings}
              onSettingsChange={setPolicySettings}
            />
          )}
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
            <span style={{ color: 'rgba(74,74,74,0.7)' }}>MCP · TypeSafe Jev · Three.js 3D Vault · SHA-256 · WAL</span>
            <span className="font-black" style={{ color: `${C.primary}80` }}>PayPal AI Hackathon 2025</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
