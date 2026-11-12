'use client';

import React from 'react';
import { Eye, ShieldCheck, UserCheck, Bot } from 'lucide-react';

export interface UserContextValue {
  id: string;
  name: string;
  role: 'support_agent' | 'approver' | 'viewer';
}

type HeaderProps = {
  currentUser: UserContextValue;
  onUserChange: (user: UserContextValue) => void;
  pendingApprovalsCount: number;
};

export const USERS: UserContextValue[] = [
  { id: 'agent_1', name: 'Agent Sarah', role: 'support_agent' },
  { id: 'approver_1', name: 'Manager Dave', role: 'approver' },
  { id: 'viewer_1', name: 'Auditor Emma', role: 'viewer' },
];

export function Header({ currentUser, onUserChange, pendingApprovalsCount }: HeaderProps) {
  return (
    <header className="dashboard-header sticky top-0 z-50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 md:px-8">
        <div className="flex items-center gap-3">
          <div className="brand-mark flex h-10 w-10 items-center justify-center rounded-xl"><ShieldCheck className="h-5 w-5 text-white" /></div>
          <div>
            <div className="flex items-center gap-2"><h1 className="text-lg font-bold tracking-tight text-white">Airlock</h1><span className="environment-badge">DEMO</span></div>
            <p className="text-xs text-slate-400">Refund safety workspace</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {pendingApprovalsCount > 0 && <span className="approval-indicator"><span className="approval-indicator-dot" />{pendingApprovalsCount} awaiting approval</span>}
          <label className="role-switcher flex items-center gap-2 px-3 py-2" title="Demo persona simulation for local testing (not production authentication)">
            <span className="text-xs text-slate-400">Demo Persona</span>
            <select value={currentUser.id} onChange={event => {
              const found = USERS.find(user => user.id === event.target.value);
              if (found) onUserChange(found);
            }} aria-label="Choose demo role (simulation only)" className="max-w-36 bg-transparent text-sm font-semibold text-slate-100 outline-none">
              {USERS.map(user => <option key={user.id} value={user.id} className="bg-slate-900">{user.name}</option>)}
            </select>
            <RoleBadge role={currentUser.role} />
          </label>
        </div>
      </div>
    </header>
  );
}

function RoleBadge({ role }: { role: string }) {
  const Icon = role === 'support_agent' ? Bot : role === 'approver' ? UserCheck : Eye;
  const name = role === 'support_agent' ? 'Agent' : role === 'approver' ? 'Approver' : 'Auditor';
  const colorClass =
    role === 'support_agent'
      ? 'text-cyan-300 border-cyan-500/40 bg-cyan-950/50'
      : role === 'approver'
        ? 'text-amber-300 border-amber-500/40 bg-amber-950/50'
        : 'text-indigo-300 border-indigo-500/40 bg-indigo-950/50';
  return (
    <span className={`role-badge hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${colorClass} sm:inline-flex`}>
      <Icon className="h-3 w-3" />
      {name}
    </span>
  );
}
