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
import { Bot, Bug, Clock, FilePlus2, History, House, SlidersHorizontal } from 'lucide-react';

const C = { primary: '#4A90E2', teal: '#50E3C2', orange: '#F5A623', pink: '#E94E77', gold: '#F8E71C', white: '#FFFFFF', gray3: '#4A4A4A', s0: '#07090f' };
type TabId = 'overview' | 'agentic' | 'request' | 'queue' | 'audit' | 'redteam' | 'studio';
type OverviewStats = { pending: number; review: number; completed: number };

const TABS: { id: TabId; label: string; Icon: React.ElementType; color: string }[] = [
  { id: 'overview', label: 'Overview', Icon: House, color: C.teal },
  { id: 'request', label: 'Refund request', Icon: FilePlus2, color: C.primary },
  { id: 'queue', label: 'Approvals', Icon: Clock, color: C.orange },
  { id: 'audit', label: 'Activity & evidence', Icon: History, color: C.primary },
  { id: 'redteam', label: 'Safety lab', Icon: Bug, color: C.pink },
  { id: 'studio', label: 'Policy settings', Icon: SlidersHorizontal, color: C.gold },
  { id: 'agentic', label: 'Agentic commerce', Icon: Bot, color: C.teal },
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
      <main className="dashboard-main flex-1 max-w-7xl w-full mx-auto px-4 py-5 md:px-8 md:py-7">
        <nav aria-label="Dashboard sections" role="tablist" className="dashboard-tabs mb-6 flex items-center gap-1 overflow-x-auto p-1.5">
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

        <div id="dashboard-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="dashboard-panel">
          {activeTab === 'overview' && <OverviewView counts={overviewStats} onNavigate={setActiveTab} />}
          {activeTab === 'agentic' && <AgenticCommerceView currentUser={currentUser} onActionComplete={updateOverviewStats} policySettings={policySettings} activeProvider={activeProvider} />}
          {activeTab === 'request' && <NewRequestView currentUser={currentUser} onActionComplete={updateOverviewStats} policySettings={policySettings} activeProvider={activeProvider} />}
          {activeTab === 'queue' && <ApprovalQueueView currentUser={currentUser} onActionComplete={updateOverviewStats} />}
          {activeTab === 'audit' && <AuditTimelineView currentUserId={currentUser.id} />}
          {activeTab === 'redteam' && <RedTeamView currentUser={currentUser} />}
          {activeTab === 'studio' && <PolicyStudioView settings={policySettings} onSettingsChange={setPolicySettings} currentUser={currentUser} />}
        </div>
      </main>
      <footer className="border-t border-slate-800/70 bg-slate-950/40 px-5 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 text-xs text-slate-500">
          <span>Airlock demo environment</span>
          <span className="flex items-center gap-1.5 font-semibold">
            Payment rail:
            <span className={`px-2 py-0.5 rounded text-[11px] font-mono ${
              activeProvider === 'paypal_sandbox'
                ? 'bg-blue-950 text-blue-300 border border-blue-500/30'
                : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}>
              {activeProvider === 'paypal_sandbox' ? 'PayPal Sandbox / Test Mode' : 'Mock (Local In-Memory)'}
            </span>
          </span>
        </div>
      </footer>
    </div>
  );
}
