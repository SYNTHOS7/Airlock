'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Header, type UserContextValue, USERS } from '@/components/Header';
import { AgenticCommerceView } from '@/components/AgenticCommerceView';
import { NewRequestView } from '@/components/NewRequestView';
import { ApprovalQueueView } from '@/components/ApprovalQueueView';
import { AuditTimelineView } from '@/components/AuditTimelineView';
import { RedTeamView } from '@/components/RedTeamView';
import { PolicyStudioView, type PolicyStudioSettings } from '@/components/PolicyStudioView';
import { OverviewView } from '@/components/OverviewView';
import type { DashboardOperation, PaymentProvider } from '@/lib/dashboard-display';
import { AlertCircle, ArrowUpRight, Bot, Bug, Clock3, FilePlus2, History, House, RefreshCw, ShieldCheck, SlidersHorizontal } from 'lucide-react';

type TabId = 'overview' | 'agentic' | 'request' | 'queue' | 'audit' | 'redteam' | 'studio';
const TABS = [
  { id: 'overview' as const, label: 'Overview', Icon: House },
  { id: 'request' as const, label: 'Refund request', Icon: FilePlus2 },
  { id: 'queue' as const, label: 'Approvals', Icon: Clock3 },
  { id: 'audit' as const, label: 'Activity & evidence', Icon: History },
  { id: 'agentic' as const, label: 'Agent workspace', Icon: Bot },
  { id: 'studio' as const, label: 'Policy settings', Icon: SlidersHorizontal },
  { id: 'redteam' as const, label: 'Safety lab', Icon: Bug },
];

export default function DashboardPage() {
  const [currentUser, setCurrentUser] = useState<UserContextValue>(USERS[0]);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [operations, setOperations] = useState<DashboardOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [policySettings, setPolicySettings] = useState<PolicyStudioSettings>({ approvalThreshold: 50, cumulativeCap: 200, velocityLimit: 5, jevSensitivity: 'standard' });
  const [activeProvider, setActiveProvider] = useState<PaymentProvider | null>(null);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const res = await fetch('/api/operations', { headers: { 'x-airlock-user': currentUser.id }, cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load the workspace.');
      if (!Array.isArray(data.operations) || !['mock', 'paypal_sandbox'].includes(data.provider)) throw new Error('The server returned an incomplete workspace response.');
      if (version !== requestVersion.current) return;
      setOperations(data.operations);
      setActiveProvider(data.provider);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (version === requestVersion.current) setError(err instanceof Error ? err.message : 'Could not load the workspace.');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [currentUser.id]);

  useEffect(() => {
    setOperations([]);
    setActiveProvider(null);
    setLastUpdated(null);
    void refresh();
    const interval = setInterval(() => void refresh(), 15000);
    return () => { clearInterval(interval); requestVersion.current++; };
  }, [refresh]);

  const pending = operations.filter(op => op.state === 'AWAITING_APPROVAL').length;
  const section = TABS.find(tab => tab.id === activeTab)!;

  return (
    <div className="dashboard-shell">
      <a href="#workspace-content" className="skip-link">Skip to workspace</a>
      <Header currentUser={currentUser} onUserChange={setCurrentUser} pendingApprovalsCount={pending} />
      <div className="dashboard-workspace">
        <aside className="dashboard-sidebar" aria-label="Workspace navigation">
          <p className="sidebar-section-label">Operations</p>
          <nav aria-label="Dashboard sections" className="dashboard-tabs">
            {TABS.map((tab, index) => (
              <React.Fragment key={tab.id}>
                {index === 4 && <p className="sidebar-section-label sidebar-secondary-label">Control center</p>}
                <button aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => setActiveTab(tab.id)} className={'dashboard-tab ' + (activeTab === tab.id ? 'is-active' : '')}>
                  <tab.Icon size={17} strokeWidth={1.65} /><span>{tab.label}</span>
                  {tab.id === 'queue' && pending > 0 && <span className="tab-count" title="Awaiting approval among the latest 50 requests">{pending}</span>}
                </button>
              </React.Fragment>
            ))}
          </nav>
          <div className="sidebar-note">
            <ShieldCheck size={19} strokeWidth={1.5} />
            <p><strong>Policy before payment.</strong><span>Review the rules that govern each refund.</span></p>
            <button aria-label="Open policy settings" onClick={() => setActiveTab('studio')}><ArrowUpRight size={16} /></button>
          </div>
          <div className="sidebar-bottom"><span className="small-dot" />Demo workspace<span className="mono">v0.1</span></div>
        </aside>
        <main id="workspace-content" tabIndex={-1} className="dashboard-main">
          <div className="workspace-breadcrumb"><span>Workspace</span><span>/</span><strong>{section.label}</strong><span className="workspace-updated">{error ? 'Connection needs attention' : lastUpdated ? 'Updated ' + lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Connecting'}</span></div>
          {error && <div className="workspace-error" role="alert"><AlertCircle size={18} /><div><strong>Workspace could not refresh</strong><p>{error}{lastUpdated ? ' Showing the last received data.' : ''}</p></div><button onClick={() => void refresh()} disabled={loading}><RefreshCw size={14} />Retry</button></div>}
          <div className={'dashboard-panel view-' + activeTab}>
            {activeTab === 'overview' && <OverviewView operations={operations} onNavigate={setActiveTab} activeProvider={activeProvider} currentUser={currentUser} loading={loading} hasLoaded={!!lastUpdated} onRefresh={refresh} />}
            {activeTab !== 'overview' && !activeProvider && <div className="panel-empty"><ShieldCheck size={28} /><h2>{loading ? 'Connecting to your workspace' : 'Workspace unavailable'}</h2><p>{loading ? 'Loading the configured payment provider.' : 'Retry the connection above to continue.'}</p></div>}
            {activeProvider && <>
              {activeTab === 'agentic' && <AgenticCommerceView currentUser={currentUser} onActionComplete={refresh} policySettings={policySettings} activeProvider={activeProvider} />}
              {activeTab === 'request' && <NewRequestView currentUser={currentUser} onActionComplete={refresh} policySettings={policySettings} activeProvider={activeProvider} />}
              {activeTab === 'queue' && <ApprovalQueueView currentUser={currentUser} onActionComplete={refresh} />}
              {activeTab === 'audit' && <AuditTimelineView currentUserId={currentUser.id} />}
              {activeTab === 'redteam' && <RedTeamView currentUser={currentUser} />}
              {activeTab === 'studio' && <PolicyStudioView settings={policySettings} onSettingsChange={setPolicySettings} currentUser={currentUser} />}
            </>}
          </div>
          <footer className="workspace-footer"><span>Airlock / Payment controls for agents</span><span className="rail-tag">{activeProvider === 'paypal_sandbox' ? 'PayPal Sandbox · Test funds' : activeProvider === 'mock' ? 'Mock provider · Simulated funds' : 'Provider not yet confirmed'}</span></footer>
        </main>
      </div>
    </div>
  );
}
