'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, CheckCheck, CircleHelp, Clock3, FilePlus2, Inbox, RefreshCw, ShieldCheck, SlidersHorizontal, Waypoints } from 'lucide-react';
import type { UserContextValue } from './Header';
import { attentionStates, displayMoney, displayTime, operationStatus, type DashboardOperation, type PaymentProvider } from '@/lib/dashboard-display';

type Destination = 'request' | 'queue' | 'audit' | 'redteam' | 'studio' | 'agentic';
interface Props {
  operations: DashboardOperation[]; onNavigate: (tab: Destination) => void;
  activeProvider: PaymentProvider | null; currentUser: UserContextValue;
  loading: boolean; hasLoaded: boolean; onRefresh: () => Promise<void>;
}
interface RailStatus {
  configured: boolean; authenticated?: boolean; error?: string; oauth_latency_ms?: number;
  active_capture?: { id?: string; status?: string };
  verified_refunds?: Array<{ id: string; status: string; amount?: { value: string; currency_code: string } }>;
}
const checkpoints = [
  { title: 'Request', detail: 'Amount and reason', icon: FilePlus2 },
  { title: 'Policy', detail: 'Rules and text safety', icon: ShieldCheck },
  { title: 'Approval', detail: 'When rules require it', icon: Clock3 },
  { title: 'Execute', detail: 'Configured provider', icon: Waypoints },
  { title: 'Verify', detail: 'Separate provider check', icon: CheckCheck },
];
export function OverviewView({ operations, onNavigate, activeProvider, currentUser, loading, hasLoaded, onRefresh }: Props) {
  const [filter, setFilter] = useState<'all' | 'attention' | 'executed'>('all');
  const [rail, setRail] = useState<RailStatus | null>(null);
  const [railError, setRailError] = useState<string | null>(null);
  const [railLoading, setRailLoading] = useState(false);
  const loadRail = useCallback(async (signal?: AbortSignal) => {
    if (activeProvider !== 'paypal_sandbox') return;
    setRailLoading(true); setRailError(null);
    try {
      const res = await fetch('/api/rail/status', { headers: { 'x-airlock-user': currentUser.id }, signal, cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Provider connection could not be checked.');
      if (!signal?.aborted) setRail(data);
    } catch (err) {
      if (!signal?.aborted) setRailError(err instanceof Error ? err.message : 'Provider unavailable.');
    } finally { if (!signal?.aborted) setRailLoading(false); }
  }, [activeProvider, currentUser.id]);
  useEffect(() => {
    const controller = new AbortController();
    setRail(null); setRailError(null); setRailLoading(false);
    void loadRail(controller.signal);
    return () => controller.abort();
  }, [loadRail]);

  const counts = [
    { label: 'Awaiting approval', count: operations.filter(op => op.state === 'AWAITING_APPROVAL').length, detail: 'A manager decision is needed', tone: 'review', icon: Clock3, filter: 'attention' as const },
    { label: 'Needs review', count: operations.filter(op => ['NEEDS_REVIEW', 'OUTCOME_UNKNOWN', 'VERIFYING'].includes(op.state)).length, detail: 'Paused or outcome unresolved', tone: 'progress', icon: CircleHelp, filter: 'attention' as const },
    { label: 'Executed', count: operations.filter(op => op.state === 'SUCCEEDED').length, detail: 'Verification is a separate step', tone: 'success', icon: CheckCheck, filter: 'executed' as const },
  ];
  const filtered = operations.filter(op => filter === 'all' || (filter === 'attention' ? attentionStates.has(op.state) : op.state === 'SUCCEEDED'));
  const rows = filtered.slice(0, 8);
  const canReadAudit = currentUser.role === 'approver' || currentUser.role === 'viewer';
  return (
    <div className="ops-overview">
      <div className="page-heading">
        <div><p className="eyebrow">PAYMENT CONTROL PLANE</p><h1>Refund operations<span className="heading-period">.</span></h1><p>Every request, decision, and provider outcome in one place.</p></div>
        <button className="primary-action" onClick={() => onNavigate('request')} disabled={!activeProvider}><FilePlus2 size={16} />New refund request</button>
      </div>
      <div className="metrics-strip" aria-label="Counts among the latest 50 requests" aria-busy={loading}>
        {counts.map(({ label, count, detail, tone, icon: Icon, filter: nextFilter }) => <button key={label} className="metric-cell" onClick={() => setFilter(nextFilter)}><span className="metric-label"><Icon size={15} />{label}<ArrowUpRight size={14} /></span><strong>{hasLoaded ? count.toString().padStart(2, '0') : '—'}</strong><span className="metric-footnote">{detail}</span><span className={'metric-rule ' + tone} /></button>)}
      </div>
      <p className="scope-note">Counts reflect the latest {hasLoaded ? operations.length : '…'} requests, up to 50. They are not lifetime totals.</p>
      <div className="operations-grid">
        <section className="console-panel ledger-panel" aria-labelledby="requests-title">
          <div className="panel-heading"><div><h2 id="requests-title">Recent requests</h2><p>Follow the decision behind each refund.</p></div><button className="icon-button" aria-label="Refresh requests" onClick={() => void onRefresh()} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button></div>
          <div className="ledger-toolbar" aria-label="Filter requests">
            {([{ id: 'all', label: 'All requests' }, { id: 'attention', label: 'Needs attention' }, { id: 'executed', label: 'Executed' }] as const).map(item => <button key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={filter === item.id ? 'selected' : ''}>{item.label}</button>)}
            <span className="ledger-count">{hasLoaded ? filtered.length : '—'} requests</span>
          </div>
          {!hasLoaded ? <div className="panel-empty" role="status"><Inbox size={29} /><h3>{loading ? 'Loading requests' : 'Requests unavailable'}</h3><p>{loading ? 'Reading the latest activity from your workspace.' : 'Use Retry above to reconnect.'}</p></div> : rows.length === 0 ?
            <div className="panel-empty"><Inbox size={30} strokeWidth={1.3} /><h3>{operations.length ? 'No requests in this view' : 'Your first request starts here'}</h3><p>{operations.length ? 'Choose another filter to see the rest of your activity.' : 'Submit a refund to see its policy decision and execution status.'}</p>{operations.length === 0 && <button className="text-action" onClick={() => onNavigate('request')}>Create a request<ArrowRight size={14} /></button>}</div> :
            <div className="ledger-scroll"><table className="request-ledger"><caption className="sr-only">Latest refund requests and execution states</caption><thead><tr><th>Request / capture</th><th className="amount-column">Amount</th><th>Status</th><th>Provider</th></tr></thead><tbody>{rows.map(op => {
              const status = operationStatus(op.state);
              return <tr key={op.operation_id}><td><span className="request-id mono" title={op.operation_id}>{op.operation_id.slice(0, 16)}</span><span className="request-meta mono" title={op.payment_id}>{op.payment_id}</span><time dateTime={op.created_at}>{displayTime(op.created_at)}</time></td><td className="amount-column money">{displayMoney(op.amount_minor, op.currency)}</td><td><span className={'status-tag status-' + status.tone}><i />{status.label}</span></td><td><span className="provider-cell">{op.provider === 'paypal_sandbox' ? 'PayPal' : op.provider === 'mock' ? 'Mock' : op.provider}</span><span className="request-meta">{op.provider === 'paypal_sandbox' ? 'Sandbox' : 'Simulation'}</span></td></tr>;
            })}</tbody></table></div>}
          <div className="ledger-footer"><span>{hasLoaded ? 'Showing ' + rows.length + ' of ' + filtered.length + ' recent requests' : 'Waiting for workspace data'}</span>{canReadAudit ? <button className="text-action" onClick={() => onNavigate('audit')}>Activity & evidence<ArrowRight size={13} /></button> : <span>Switch to Auditor to inspect the full log</span>}</div>
        </section>
        <aside className="overview-aside">
          <section className="console-panel connection-panel" aria-labelledby="connection-title">
            <div className="panel-heading"><h2 id="connection-title">Payment connection</h2><Waypoints size={17} /></div>
            <div className="connection-provider"><span className="provider-monogram">{activeProvider === 'paypal_sandbox' ? 'P' : activeProvider === 'mock' ? 'M' : '—'}</span><div><strong>{activeProvider === 'paypal_sandbox' ? 'PayPal Sandbox' : activeProvider === 'mock' ? 'Mock provider' : 'Checking provider'}</strong><span>Test environment</span></div></div>
            <div className="connection-status"><span className={'small-dot ' + (railError ? 'dot-review' : '')} /><span>{activeProvider === 'mock' ? 'Local simulation selected' : railLoading ? 'Checking connection…' : railError ? 'Connection check failed' : rail?.authenticated ? 'OAuth connection confirmed' : 'Connection not yet confirmed'}</span></div>
            <dl className="connection-facts"><div><dt>Funds</dt><dd>Test funds only</dd></div><div><dt>Provider access</dt><dd>{activeProvider === 'mock' ? 'No external calls' : activeProvider ? 'Sandbox API' : 'Pending'}</dd></div>{activeProvider === 'paypal_sandbox' && <div><dt>OAuth response</dt><dd>{rail?.oauth_latency_ms != null ? rail.oauth_latency_ms + ' ms' : 'Not measured'}</dd></div>}</dl>
            {railError && <p className="connection-error" role="alert">{railError}</p>}
            {rail?.active_capture?.id && <div className="provider-evidence"><span>Latest workspace capture</span><code>{rail.active_capture.id}</code><p>{rail.active_capture.status || 'Status unavailable'}</p></div>}
            {!!rail?.verified_refunds?.length && <div className="provider-evidence"><span>Latest provider lookup</span><code>{rail.verified_refunds[0].id}</code><p>{rail.verified_refunds[0].status} · {rail.verified_refunds[0].amount?.value} {rail.verified_refunds[0].amount?.currency_code}</p></div>}
            <p className="connection-note">A connection check does not verify a refund. Verify each execution from its request or activity record.</p>
            {activeProvider === 'paypal_sandbox' && <button className="secondary-action" onClick={() => void loadRail()} disabled={railLoading}><RefreshCw size={14} />Check connection</button>}
          </section>
          <button className="policy-shortcut" onClick={() => onNavigate('studio')}><SlidersHorizontal size={18} /><span><strong>Review payment policy</strong><small>Thresholds, limits, and approval rules</small></span><ArrowUpRight size={16} /></button>
        </aside>
      </div>
      <section className="decision-path" aria-labelledby="path-title"><div className="path-heading"><h2 id="path-title">The path of a refund</h2><span>Approval applies only when policy requires it.</span></div><ol>{checkpoints.map(({ title, detail, icon: Icon }, i) => <li key={title}><span className="checkpoint-number">{'0' + (i + 1)}</span><Icon size={17} strokeWidth={1.5} /><div><strong>{title}</strong><span>{detail}</span></div></li>)}</ol></section>
    </div>
  );
}

