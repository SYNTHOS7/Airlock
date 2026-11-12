'use client';
import React from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
export interface UserContextValue { id: string; name: string; role: 'support_agent' | 'approver' | 'viewer'; }
type HeaderProps = { currentUser: UserContextValue; onUserChange: (user: UserContextValue) => void; pendingApprovalsCount: number };
export const USERS: UserContextValue[] = [
  { id: 'agent_1', name: 'Agent Sarah', role: 'support_agent' },
  { id: 'approver_1', name: 'Manager Dave', role: 'approver' },
  { id: 'viewer_1', name: 'Auditor Emma', role: 'viewer' },
];
export function Header({ currentUser, onUserChange, pendingApprovalsCount }: HeaderProps) {
  const roleName = currentUser.role === 'support_agent' ? 'Support agent' : currentUser.role === 'approver' ? 'Approver' : 'Auditor';
  return <header className="dashboard-header">
    <div className="brand-lockup"><span className="brand-mark" aria-hidden="true"><svg width="24" height="26" viewBox="0 0 24 26" fill="none"><path d="M3 23V3h12v20M9 23V3h12v20" stroke="currentColor" strokeWidth="1.6"/><path d="M3 13h6m6 0h6" stroke="currentColor" strokeWidth="1.6"/></svg></span><span className="brand-name">airlock<span className="brand-name-dot">.</span></span><span className="environment-badge">DEMO</span></div>
    <div className="header-context"><ShieldCheck size={14} />Agent payment controls</div>
    <div className="header-user-area">
      {pendingApprovalsCount > 0 && <span className="header-pending"><span className="small-dot dot-review" />{pendingApprovalsCount} awaiting approval</span>}
      <label className="role-switcher" title="Demo identities are simulations, not production authentication">
        <span className="persona-avatar">{currentUser.name.split(' ').map(part => part[0]).join('')}</span>
        <span className="persona-copy"><span className="persona-caption">Demo identity · {roleName}</span><select aria-label="Choose demo role (simulation only)" value={currentUser.id} onChange={event => { const user = USERS.find(item => item.id === event.target.value); if (user) onUserChange(user); }}>{USERS.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></span><ChevronDown size={13} aria-hidden="true" />
      </label>
    </div>
  </header>;
}

