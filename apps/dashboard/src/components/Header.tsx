'use client';

import React from 'react';
import { ShieldCheck, UserCheck, Eye, Bot, Zap } from 'lucide-react';

export interface UserContextValue {
  id: string;
  name: string;
  role: 'support_agent' | 'approver' | 'viewer';
}

interface HeaderProps {
  currentUser: UserContextValue;
  onUserChange: (user: UserContextValue) => void;
  pendingApprovalsCount: number;
  metrics: { protected: number; blocked: number; latencyMs: number };
}

export const USERS: UserContextValue[] = [
  { id: 'agent_1', name: 'Agent Sarah', role: 'support_agent' },
  { id: 'approver_1', name: 'Manager Dave', role: 'approver' },
  { id: 'viewer_1', name: 'Auditor Emma', role: 'viewer' },
];

export function Header({ currentUser, onUserChange, pendingApprovalsCount, metrics }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-[#0d2340] bg-[#060b14]/95 backdrop-blur-xl">
      {/* Top metrics bar */}
      <div className="border-b border-[#0d1f38] bg-[#030810]/60 px-6 py-1.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6 text-xs">
            <MetricPill
              label="OPERATIONS PROTECTED"
              value={metrics.protected}
              color="text-emerald-400"
              glow="emerald"
            />
            <MetricPill
              label="THREATS BLOCKED"
              value={metrics.blocked}
              color="text-rose-400"
              glow="rose"
            />
            <MetricPill
              label="AVG EVAL"
              value={`${metrics.latencyMs}ms`}
              color="text-sky-400"
              glow="sky"
            />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#1e4d7a]">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-500 font-medium">MCP Server Live</span>
            <span className="text-[#1e3a5f]">•</span>
            <span>PayPal AI Hackathon 2025</span>
          </div>
        </div>
      </div>

      {/* Main header row */}
      <div className="px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center relative animate-float"
              style={{ background: 'linear-gradient(135deg, #003087 0%, #009cde 100%)', boxShadow: '0 0 20px rgba(0,156,222,0.4)' }}>
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-black text-xl tracking-tight text-white">Airlock</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold text-black"
                  style={{ background: '#ffc439' }}>
                  v1.0
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded border border-[#0d2340] text-[#1e6fa0] bg-[#030e1e]">
                  Sandbox
                </span>
              </div>
              <p className="text-[11px] text-[#2a6fa0] mt-0.5">
                Zero-Trust Financial AI Safety Gateway · MCP Protocol
              </p>
            </div>
          </div>

          {/* Right side: identity + pending badge */}
          <div className="flex items-center gap-3">
            {pendingApprovalsCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-semibold animate-pulse-glow">
                <Zap className="w-3.5 h-3.5" />
                {pendingApprovalsCount} Awaiting Approval
              </div>
            )}

            <div className="flex items-center gap-2 bg-[#0a1628] border border-[#0d2340] rounded-lg px-3 py-2">
              <span className="text-[11px] text-[#1e4d7a] font-medium">Identity:</span>
              <select
                value={currentUser.id}
                onChange={(e) => {
                  const found = USERS.find((u) => u.id === e.target.value);
                  if (found) onUserChange(found);
                }}
                className="bg-transparent text-sm text-slate-200 focus:outline-none cursor-pointer font-semibold"
              >
                {USERS.map((user) => (
                  <option key={user.id} value={user.id} className="bg-[#0a1628] text-slate-200">
                    {user.name}
                  </option>
                ))}
              </select>
              <RoleBadge role={currentUser.role} />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function MetricPill({ label, value, color, glow }: {
  label: string;
  value: string | number;
  color: string;
  glow: 'emerald' | 'rose' | 'sky';
}) {
  const glowColors = {
    emerald: 'rgba(16,185,129,0.15)',
    rose: 'rgba(239,68,68,0.15)',
    sky: 'rgba(14,165,233,0.15)',
  };
  return (
    <div className="flex items-center gap-2">
      <div className="w-1 h-6 rounded-full" style={{ background: glowColors[glow].replace('0.15', '0.8') }} />
      <div>
        <div className={`font-black tabular-nums text-sm ${color} animate-count-up`}>{value}</div>
        <div className="text-[9px] text-[#1e4070] font-medium tracking-widest uppercase">{label}</div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'support_agent') return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
      <Bot className="w-3 h-3" /> Agent
    </span>
  );
  if (role === 'approver') return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
      <UserCheck className="w-3 h-3" /> Approver
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20 font-medium">
      <Eye className="w-3 h-3" /> Auditor
    </span>
  );
}
