'use client';

import React, { useState, useEffect } from 'react';
import { Header, type UserContextValue, USERS } from '@/components/Header';
import { NewRequestView } from '@/components/NewRequestView';
import { ApprovalQueueView } from '@/components/ApprovalQueueView';
import { AuditTimelineView } from '@/components/AuditTimelineView';
import { PlusCircle, Clock, History } from 'lucide-react';

export default function DashboardPage() {
  const [currentUser, setCurrentUser] = useState<UserContextValue>(USERS[0]);
  const [activeTab, setActiveTab] = useState<'request' | 'queue' | 'audit'>('request');
  const [pendingCount, setPendingCount] = useState<number>(0);

  async function updatePendingCount() {
    try {
      const res = await fetch('/api/approvals');
      const data = await res.json();
      setPendingCount(data.approvals?.length || 0);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    updatePendingCount();
    const interval = setInterval(updatePendingCount, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header with User Switcher */}
      <Header
        currentUser={currentUser}
        onUserChange={setCurrentUser}
        pendingApprovalsCount={pendingCount}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-8">
        {/* Navigation Tabs (Three Views per Spec) */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab('request')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'request'
                ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <PlusCircle className="w-4 h-4 text-emerald-400" />
            1. New Request
          </button>

          <button
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition relative ${
              activeTab === 'queue'
                ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Clock className="w-4 h-4 text-amber-400" />
            2. Approval Queue
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[11px] font-bold bg-amber-500 text-slate-950">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'audit'
                ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <History className="w-4 h-4 text-blue-400" />
            3. Audit Timeline
          </button>
        </div>

        {/* View Routing */}
        <div>
          {activeTab === 'request' && (
            <NewRequestView
              currentUser={currentUser}
              onActionComplete={updatePendingCount}
            />
          )}

          {activeTab === 'queue' && (
            <ApprovalQueueView
              currentUser={currentUser}
              onActionComplete={updatePendingCount}
            />
          )}

          {activeTab === 'audit' && <AuditTimelineView />}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 px-6 text-center text-xs text-slate-500">
        Airlock — Autonomous Financial AI Safety & Outcome Verification Rail • PayPal AI Hackathon
      </footer>
    </div>
  );
}

