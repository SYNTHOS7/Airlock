'use client';

import React from 'react';
import {
  ArrowDownRight, ArrowRight, Bot, CheckCircle2, Clock3, FileCheck2,
  FilePlus2, History, SearchCheck, ShieldAlert, UserRoundCheck,
} from 'lucide-react';

type OverviewViewProps = {
  counts: { pending: number; review: number; completed: number };
  onNavigate: (tab: 'request' | 'queue' | 'audit' | 'redteam' | 'studio' | 'agentic') => void;
  activeProvider: 'mock' | 'paypal_sandbox';
};

const steps = [
  { number: '01', title: 'Request', text: 'An agent proposes a refund.', Icon: FilePlus2, tone: 'blue' },
  { number: '02', title: 'Safety check', text: 'Rules and a text scan check for risk.', Icon: SearchCheck, tone: 'violet' },
  { number: '03', title: 'Human review', text: 'A person steps in when a request needs approval.', Icon: UserRoundCheck, tone: 'amber' },
  { number: '04', title: 'Record result', text: 'The demo rail reports an outcome; Airlock records it.', Icon: FileCheck2, tone: 'green' },
];

const actions = [
  { title: 'Create a refund request', detail: 'Enter the amount and reason to see the checks.', Icon: FilePlus2, tab: 'request' as const, action: 'Start a request' },
  { title: 'Review approvals', detail: 'See requests waiting for a manager.', Icon: Clock3, tab: 'queue' as const, action: 'Open approvals' },
  { title: 'Follow the activity', detail: 'Read the decision history and recorded evidence.', Icon: History, tab: 'audit' as const, action: 'View activity' },
  { title: 'Explore safety checks', detail: 'Try example text and inspect the response.', Icon: ShieldAlert, tab: 'redteam' as const, action: 'Open safety lab' },
];

export function OverviewView({ counts, onNavigate, activeProvider }: OverviewViewProps) {
  return (
    <div className="overview-layout">
      <section className="overview-hero rounded-2xl p-6 md:p-8" aria-labelledby="overview-title">
        <div className="hero-copy">
          <p className="section-eyebrow">PAYMENT OPERATIONS / REFUNDS</p>
          <h2 id="overview-title" className="mt-3 max-w-2xl text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl">
            Every refund gets a clear decision before release.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 md:text-base">
            Review requests, route exceptions to a person, and keep the provider outcome attached to the record.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button onClick={() => onNavigate('request')} className="overview-primary inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold">
              Create refund request <ArrowRight className="h-4 w-4" />
            </button>
            <span className="inline-flex items-center gap-2 text-xs text-slate-400"><span className="status-dot" /> Demo environment</span>
          </div>
        </div>
        <aside className="demo-note" aria-label="Demo environment details">
          <div className="demo-note-heading"><span className="demo-note-icon"><ShieldAlert className="h-4 w-4" /></span><span>Current payment rail</span></div>
          <div className="rail-summary">
            <span className="rail-summary-label">Connected mode</span>
            <span className={`rail-summary-value ${activeProvider === 'paypal_sandbox' ? 'is-paypal' : ''}`}>
              <span className="rail-summary-dot" />
              {activeProvider === 'paypal_sandbox' ? 'PayPal Sandbox' : 'Mock provider'}
            </span>
            <span className="rail-summary-caption">{activeProvider === 'paypal_sandbox' ? 'Test Mode · no live funds' : 'Local in-memory · no external calls'}</span>
          </div>
          <ul className="mt-4 space-y-3">
            <li><CheckCircle2 className="h-4 w-4" /><span>Policy checks before action</span></li>
            <li><CheckCircle2 className="h-4 w-4" /><span>Human approval when required</span></li>
            <li><CheckCircle2 className="h-4 w-4" /><span>Provider outcomes recorded for review</span></li>
          </ul>
          <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-5 text-slate-400">This dashboard is a controlled demonstration. It does not process live payments.</p>
        </aside>
      </section>

      <section className="overview-section" aria-labelledby="status-heading">
        <div className="overview-section-heading">
          <div><p className="section-eyebrow">ACTIVITY</p><h3 id="status-heading" className="mt-1 text-lg font-semibold text-white">At a glance</h3></div>
          <span className="section-caption">Updates automatically</span>
        </div>
        <div className="count-grid">
          <CountCard label="Waiting for approval" value={counts.pending} detail="Needs a manager decision" tone="amber" Icon={Clock3} />
          <CountCard label="Needs review" value={counts.review} detail="Paused for a closer look" tone="violet" Icon={ShieldAlert} />
          <CountCard label="Completed" value={counts.completed} detail="Execution recorded" tone="green" Icon={CheckCircle2} />
        </div>
      </section>

      <section className="overview-section" aria-labelledby="flow-heading">
        <div className="overview-section-heading">
          <div><p className="section-eyebrow">DECISION PATH</p><h3 id="flow-heading" className="mt-1 text-lg font-semibold text-white">From request to evidence</h3></div>
          <span className="section-caption">Four checkpoints, one traceable operation</span>
        </div>
        <div className="flow-grid">
          {steps.map(({ number, title, text, Icon, tone }, index) => (
            <React.Fragment key={title}>
              <article className="flow-card">
                <div className={`flow-icon ${tone}`}><Icon className="h-5 w-5" /></div>
                <span className="flow-number">STEP {number}</span>
                <h4 className="mt-1 text-sm font-semibold text-white">{title}</h4>
                <p className="mt-1.5 text-sm leading-5 text-slate-400">{text}</p>
              </article>
              {index < steps.length - 1 && <div className="flow-arrow" aria-hidden="true"><ArrowRight className="h-4 w-4" /></div>}
            </React.Fragment>
          ))}
        </div>
        <p className="flow-footnote"><ArrowDownRight className="h-3.5 w-3.5" /> Human approval happens only when policy requires it.</p>
      </section>

      <section className="overview-section" aria-labelledby="actions-heading">
        <div className="overview-section-heading">
          <div><p className="section-eyebrow">QUICK ACCESS</p><h3 id="actions-heading" className="mt-1 text-lg font-semibold text-white">Where would you like to go?</h3></div>
          <span className="section-caption">All sections are also in the menu above</span>
        </div>
        <div className="action-grid">
          {actions.map(({ title, detail, Icon, tab, action }) => (
            <button key={title} onClick={() => onNavigate(tab)} className="action-card text-left">
              <span className="action-icon"><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{title}</span><span className="mt-1 block text-sm leading-5 text-slate-400">{detail}</span><span className="mt-3 inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-sky-300">{action}<ArrowRight className="h-3.5 w-3.5" /></span></span>
            </button>
          ))}
        </div>
        <div className="advanced-shortcut"><Bot className="h-4 w-4 shrink-0 text-sky-300" /><span>For the full agent demo, open <button onClick={() => onNavigate('agentic')}>Agentic commerce <ArrowRight className="h-3 w-3" /></button>.</span></div>
      </section>
    </div>
  );
}

function CountCard({ label, value, detail, tone, Icon }: { label: string; value: number; detail: string; tone: string; Icon: React.ElementType }) {
  return (
    <article className={`count-card count-${tone}`}>
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-medium text-slate-300"><Icon className="h-4 w-4" />{label}</div><span className="count-indicator" /></div>
      <div className="mt-4 flex items-end justify-between"><span className="count-value">{value}</span><span className="mb-1 text-xs text-slate-500">in this demo</span></div>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </article>
  );
}
