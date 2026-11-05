'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Header, type UserContextValue, USERS } from '@/components/Header';
import { NewRequestView } from '@/components/NewRequestView';
import { ApprovalQueueView } from '@/components/ApprovalQueueView';
import { AuditTimelineView } from '@/components/AuditTimelineView';
import { RedTeamView } from '@/components/RedTeamView';
import { PlusCircle, Clock, History, Bug, ShieldCheck } from 'lucide-react';

type TabId = 'request' | 'queue' | 'audit' | 'redteam';

interface Metrics {
  protected: number;
  blocked: number;
  latencyMs: number;
}

export default function DashboardPage() {
  const [currentUser, setCurrentUser] = useState<UserContextValue>(USERS[0]);
  const [activeTab, setActiveTab] = useState<TabId>('request');
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [metrics, setMetrics] = useState<Metrics>({ protected: 0, blocked: 0, latencyMs: 0 });
  const metricsRef = useRef<Metrics>({ protected: 0, blocked: 0, latencyMs: 0 });

  async function updatePendingCount() {
    try {
      const res = await fetch('/api/approvals');
      const data = await res.json();
      setPendingCount(data.approvals?.length || 0);
    } catch {}
  }

  async function fetchAndUpdateMetrics() {
    try {
      const t0 = Date.now();
      const res = await fetch('/api/audit');
      const data = await res.json();
      const latency = Date.now() - t0;
      const rows: any[] = data.audit_log || [];

      const protected_ = rows.filter(r =>
        r.to_state === 'COMPLETED' || r.to_state === 'AWAITING_APPROVAL'
      ).length;

      const blocked = rows.filter(r =>
        r.to_state === 'DENIED' || r.event_type === 'OPERATION_DENIED'
      ).length;

      const updated = { protected: protected_, blocked, latencyMs: latency };
      metricsRef.current = updated;
      setMetrics(updated);
    } catch {}
  }

  useEffect(() => {
    updatePendingCount();
    fetchAndUpdateMetrics();
    const interval = setInterval(() => {
      updatePendingCount();
      fetchAndUpdateMetrics();
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const tabs: { id: TabId; label: string; Icon: React.FC<any>; color: string; badge?: number }[] = [
    { id: 'request',  label: 'New Request',      Icon: PlusCircle,  color: 'emerald' },
    { id: 'queue',    label: 'Approval Queue',   Icon: Clock,       color: 'amber', badge: pendingCount },
    { id: 'audit',    label: 'Audit Timeline',   Icon: History,     color: 'sky' },
    { id: 'redteam',  label: 'Red-Team Lab',     Icon: Bug,         color: 'rose' },
  ];

  const tabColorMap: Record<string, { active: string; icon: string }> = {
    emerald: { active: 'border-b-2 border-emerald-500 text-emerald-400',  icon: 'text-emerald-400' },
    amber:   { active: 'border-b-2 border-amber-500 text-amber-400',      icon: 'text-amber-400'   },
    sky:     { active: 'border-b-2 border-sky-500 text-sky-400',          icon: 'text-sky-400'     },
    rose:    { active: 'border-b-2 border-rose-500 text-rose-400',        icon: 'text-rose-400'    },
  };

  return (
    <div className="min-h-screen bg-[#060b14] text-slate-100 flex flex-col">
      <Header
        currentUser={currentUser}
        onUserChange={setCurrentUser}
        pendingApprovalsCount={pendingCount}
        metrics={metrics}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-6">

        {/* Nav Tabs */}
        <div className="flex items-center gap-1 border-b border-[#0d2340] relative">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            const colors = tabColorMap[tab.color];
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold transition relative ${
                  isActive
                    ? colors.active
                    : 'text-[#1e4d7a] hover:text-slate-300 border-b-2 border-transparent'
                }`}
              >
                <tab.Icon className={`w-4 h-4 ${isActive ? colors.icon : ''}`} />
                {tab.label}
                {tab.badge != null && tab.badge > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-black min-w-[18px] text-center">
                    {tab.badge}
                  </span>
                )}
                {tab.id === 'redteam' && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold">
                    NEW
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* View */}
        <div>
          {activeTab === 'request' && (
            <NewRequestView currentUser={currentUser} onActionComplete={updatePendingCount} />
          )}
          {activeTab === 'queue' && (
            <ApprovalQueueView currentUser={currentUser} onActionComplete={updatePendingCount} />
          )}
          {activeTab === 'audit' && <AuditTimelineView />}
          {activeTab === 'redteam' && <RedTeamView currentUser={currentUser} />}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#0d1f38] bg-[#030810]/80 py-3 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-[11px] text-[#1e3a5f]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/50" />
            <span>Airlock — Zero-Trust Financial AI Safety Gateway</span>
          </div>
          <div className="flex items-center gap-4">
            <span>MCP Protocol · TypeSafe Jev · SHA-256 Dual-Auth · WAL</span>
            <span className="text-sky-500/50 font-semibold">PayPal AI Hackathon 2025</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
