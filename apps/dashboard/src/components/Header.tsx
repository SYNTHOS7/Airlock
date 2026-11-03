'use client';

import React from 'react';
import { ShieldCheck, UserCheck, Eye, Bot } from 'lucide-react';

export interface UserContextValue {
  id: string;
  name: string;
  role: 'support_agent' | 'approver' | 'viewer';
}

interface HeaderProps {
  currentUser: UserContextValue;
  onUserChange: (user: UserContextValue) => void;
  pendingApprovalsCount: number;
}

export const USERS: UserContextValue[] = [
  { id: 'agent_1', name: 'Agent Sarah', role: 'support_agent' },
  { id: 'approver_1', name: 'Manager Dave', role: 'approver' },
  { id: 'viewer_1', name: 'Auditor Emma', role: 'viewer' },
];

export function Header({ currentUser, onUserChange, pendingApprovalsCount }: HeaderProps) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-xl text-slate-100 tracking-tight">Airlock</h1>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                Sandbox Mode
              </span>
            </div>
            <p className="text-xs text-slate-400">Financial AI Safety & Outcome Verification Layer</p>
          </div>
        </div>

        {/* User Switcher (Separation of Duties Demo) */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
            <span className="text-xs text-slate-400 font-medium">Demo Identity:</span>
            <select
              value={currentUser.id}
              onChange={(e) => {
                const found = USERS.find((u) => u.id === e.target.value);
                if (found) onUserChange(found);
              }}
              className="bg-transparent text-sm text-slate-200 focus:outline-none cursor-pointer font-medium"
            >
              {USERS.map((user) => (
                <option key={user.id} value={user.id} className="bg-slate-900 text-slate-200">
                  {user.name} ({user.role})
                </option>
              ))}
            </select>

            {/* Role Badge */}
            {currentUser.role === 'support_agent' && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Bot className="w-3 h-3" /> Requester
              </span>
            )}
            {currentUser.role === 'approver' && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <UserCheck className="w-3 h-3" /> Approver
              </span>
            )}
            {currentUser.role === 'viewer' && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20">
                <Eye className="w-3 h-3" /> Read-Only
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

