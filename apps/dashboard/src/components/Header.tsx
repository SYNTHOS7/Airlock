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
  { id: 'agent_1',   name: 'Agent Sarah',   role: 'support_agent' },
  { id: 'approver_1',name: 'Manager Dave',  role: 'approver' },
  { id: 'viewer_1',  name: 'Auditor Emma',  role: 'viewer' },
];

export function Header({ currentUser, onUserChange, pendingApprovalsCount, metrics }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50" style={{ borderBottom: '1px solid rgba(74,74,74,0.4)', background: 'rgba(7,9,15,0.97)', backdropFilter: 'blur(20px)' }}>

      {/* ── Metrics ticker ─────────────────────────────────── */}
      <div style={{ background: 'rgba(14,17,23,0.8)', borderBottom: '1px solid rgba(74,74,74,0.25)' }} className="px-6 py-1.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-8">
            <MetricPill label="PROTECTED"   value={metrics.protected} color="#50E3C2" />
            <MetricPill label="BLOCKED"     value={metrics.blocked}   color="#E94E77" />
            <MetricPill label="EVAL SPEED"  value={`${metrics.latencyMs}ms`} color="#4A90E2" />
          </div>
          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'rgba(74,144,226,0.5)' }}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#50E3C2' }} />
            <span style={{ color: '#50E3C2' }} className="font-semibold">MCP Live</span>
            <span style={{ color: 'rgba(74,74,74,0.6)' }}>·</span>
            <span>PayPal AI Hackathon 2025</span>
          </div>
        </div>
      </div>

      {/* ── Main header row ────────────────────────────────── */}
      <div className="px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center animate-float"
              style={{ background: 'linear-gradient(135deg,#4A90E2,#9013FE)', boxShadow: '0 0 24px rgba(74,144,226,0.45)' }}
            >
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-black text-xl tracking-tight text-white">Airlock</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-black" style={{ background: '#F8E71C', color: '#07090f' }}>v1.0</span>
                <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ color: '#B7B7B7', border: '1px solid rgba(74,74,74,0.5)', background: 'rgba(21,27,38,0.8)' }}>Sandbox</span>
              </div>
              <p className="text-[11px] mt-0.5 font-medium" style={{ color: '#B7B7B7' }}>
                Zero-Trust Financial AI Safety · MCP Protocol
              </p>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {pendingApprovalsCount > 0 && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold animate-pulse-orange"
                style={{ background: 'rgba(245,166,35,0.12)', border: '1px solid rgba(245,166,35,0.3)', color: '#F5A623' }}
              >
                <Zap className="w-3.5 h-3.5" />
                {pendingApprovalsCount} Awaiting Approval
              </div>
            )}

            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: 'rgba(21,27,38,0.9)', border: '1px solid rgba(74,74,74,0.4)' }}
            >
              <span className="text-[11px] font-semibold" style={{ color: '#4A4A4A' }}>Identity:</span>
              <select
                value={currentUser.id}
                onChange={(e) => {
                  const found = USERS.find(u => u.id === e.target.value);
                  if (found) onUserChange(found);
                }}
                className="bg-transparent text-sm font-bold focus:outline-none cursor-pointer"
                style={{ color: '#D1D1D1' }}
              >
                {USERS.map(user => (
                  <option key={user.id} value={user.id} style={{ background: '#0e1117', color: '#FFFFFF' }}>
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

function MetricPill({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-0.5 h-6 rounded-full" style={{ background: color }} />
      <div>
        <div className="metric-num text-sm animate-count-up" style={{ color }}>{value}</div>
        <div className="text-[9px] font-bold tracking-widest uppercase" style={{ color: 'rgba(74,74,74,0.9)' }}>{label}</div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'support_agent') return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: 'rgba(74,144,226,0.12)', color: '#4A90E2', border: '1px solid rgba(74,144,226,0.25)' }}>
      <Bot className="w-3 h-3" /> Agent
    </span>
  );
  if (role === 'approver') return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: 'rgba(245,166,35,0.12)', color: '#F5A623', border: '1px solid rgba(245,166,35,0.25)' }}>
      <UserCheck className="w-3 h-3" /> Approver
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: 'rgba(74,74,74,0.15)', color: '#B7B7B7', border: '1px solid rgba(74,74,74,0.3)' }}>
      <Eye className="w-3 h-3" /> Auditor
    </span>
  );
}
