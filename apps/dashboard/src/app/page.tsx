'use client';

import React, { useEffect, useState } from 'react';
import { Header, type UserContextValue, USERS } from '@/components/Header';
import { AgenticCommerceView } from '@/components/AgenticCommerceView';
import { NewRequestView } from '@/components/NewRequestView';
import { ApprovalQueueView } from '@/components/ApprovalQueueView';
import { AuditTimelineView } from '@/components/AuditTimelineView';
import { RedTeamView } from '@/components/RedTeamView';
import { PolicyStudioView, type PolicyStudioSettings } from '@/components/PolicyStudioView';
import { OverviewView } from '@/components/OverviewView';
import { Bot, Bug, Clock, FilePlus2, History, House, ShieldCheck, SlidersHorizontal } from 'lucide-react';

const C = {
  primary: '#4F46E5', // Electric Indigo
  teal:    '#06B6D4', // Cyber Cyan
  orange:  '#D946EF', // Neon Magenta for review states
  pink:    '#D946EF', // Neon Magenta
  spark:   '#A5F3FC', // Highlight Spark
  gold:    '#D946EF',
  white:   '#FFFFFF',
  gray3:   '#475569',
  s0:      '#05050A', // Void Base
};
type TabId = 'overview' | 'agentic' | 'request' | 'queue' | 'audit' | 'redteam' | 'studio';
type OverviewStats = { pending: number; review: number; completed: number };

const TABS: { id: TabId; label: string; Icon: React.ElementType; color: string }[] = [
  { id: 'overview', label: 'Overview', Icon: House, color: C.teal },
  { id: 'request', label: 'Refund request', Icon: FilePlus2, color: C.primary },
  { id: 'queue', label: 'Approvals', Icon: Clock, color: C.orange },
  { id: 'audit', label: 'Activity & evidence', Icon: History, color: C.teal },
  { id: 'redteam', label: 'Safety lab', Icon: Bug, color: C.pink },
  { id: 'studio', label: 'Policy settings', Icon: SlidersHorizontal, color: C.primary },
  { id: 'agentic', label: 'Agentic commerce', Icon: Bot, color: C.pink },
];

export default function DashboardPage() {
  const [currentUser, setCurrentUser] = useState<UserContextValue>(USERS[0]);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [overviewStats, setOverviewStats] = useState<OverviewStats>({ pending: 0, review: 0, completed: 0 });
  const [policySettings, setPolicySettings] = useState<PolicyStudioSettings>({ approvalThreshold: 50, cumulativeCap: 200, velocityLimit: 5, jevSensitivity: 'standard' });
  const [activeProvider, setActiveProvider] = useState<'mock' | 'paypal_sandbox'>('mock');

  async function updateOverviewStats() {
    try {
      const headers = { 'x-airlock-user': currentUser.id };
      const [opsRes, approvalsRes] = await Promise.all([fetch('/api/operations', { headers }), fetch('/api/approvals', { headers })]);
      const [opsData, approvalsData] = await Promise.all([opsRes.json(), approvalsRes.json()]);
      const operations: any[] = opsData.operations || [];
      const pending = approvalsData.approvals?.length || 0;
      if (opsData.provider) setActiveProvider(opsData.provider);
      setOverviewStats({ pending, review: operations.filter(op => op.state === 'NEEDS_REVIEW').length, completed: operations.filter(op => op.state === 'SUCCEEDED').length });
    } catch { /* Keep the last known dashboard counts if the API is temporarily unavailable. */ }
  }

  useEffect(() => {
    void updateOverviewStats();
    const interval = setInterval(() => void updateOverviewStats(), 10000);
    return () => clearInterval(interval);
  }, [currentUser]);

  return (
    <div className="dashboard-shell min-h-screen flex flex-col" style={{ color: C.white }}>
      <Header currentUser={currentUser} onUserChange={setCurrentUser} pendingApprovalsCount={overviewStats.pending} />
      <div className="dashboard-workspace">
        <aside className="dashboard-sidebar" aria-label="Workspace navigation">
          <div className="sidebar-section-label">Workspace</div>
          <nav aria-label="Dashboard sections" role="tablist" className="dashboard-tabs">
          {TABS.map(tab => {
            const selected = activeTab === tab.id;
            return (
              <button key={tab.id} id={`tab-${tab.id}`} role="tab" aria-selected={selected} aria-controls="dashboard-panel"
                onClick={() => setActiveTab(tab.id)}
                className={`dashboard-tab flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap ${selected ? 'is-active' : ''}`}>
                <tab.Icon className="h-4 w-4" />{tab.label}
                {tab.id === 'queue' && overviewStats.pending > 0 && <span className="tab-count min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold">{overviewStats.pending}</span>}
              </button>
            );
          })}
          </nav>
          <div className="sidebar-note">
            <span className="sidebar-note-icon"><ShieldCheck className="h-4 w-4" /></span>
            <div>
              <p className="sidebar-note-title">Guardrails active</p>
              <p className="sidebar-note-copy">Every refund is checked before it reaches the payment rail.</p>
            </div>
          </div>
        </aside>

        <main id="dashboard-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="dashboard-main dashboard-panel">
          {activeTab === 'overview' && <OverviewView counts={overviewStats} onNavigate={setActiveTab} activeProvider={activeProvider} />}
          {activeTab === 'agentic' && <AgenticCommerceView currentUser={currentUser} onActionComplete={updateOverviewStats} policySettings={policySettings} activeProvider={activeProvider} />}
          {activeTab === 'request' && <NewRequestView currentUser={currentUser} onActionComplete={updateOverviewStats} policySettings={policySettings} activeProvider={activeProvider} />}
          {activeTab === 'queue' && <ApprovalQueueView currentUser={currentUser} onActionComplete={updateOverviewStats} />}
          {activeTab === 'audit' && <AuditTimelineView currentUserId={currentUser.id} />}
          {activeTab === 'redteam' && <RedTeamView currentUser={currentUser} />}
          {activeTab === 'studio' && <PolicyStudioView settings={policySettings} onSettingsChange={setPolicySettings} currentUser={currentUser} />}
        </main>
      </div>
      <footer className="border-t border-slate-800/70 bg-slate-950/40 px-5 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 text-xs text-slate-500">
          <span>Airlock demo environment</span>
          <span className="flex items-center gap-2 font-semibold">
            <span className="footer-rail-dot" />
            Payment rail:
            <span className={`rail-tag ${
              activeProvider === 'paypal_sandbox'
                ? 'rail-tag-paypal'
                : 'rail-tag-mock'
            }`}>
              {activeProvider === 'paypal_sandbox' ? 'PayPal Sandbox / Test Mode' : 'Mock (Local In-Memory)'}
            </span>
          </span>
        </div>
      </footer>
    </div>
  );
}
