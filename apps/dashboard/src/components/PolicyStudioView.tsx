'use client';

import React, { useState, useEffect } from 'react';
import { SlidersHorizontal, ShieldCheck, Check, RotateCcw, Zap, Lock, Info, AlertCircle, Loader2 } from 'lucide-react';
import type { UserContextValue } from './Header';

const C = {
  primary: '#4F46E5', // Electric Indigo
  teal:    '#06B6D4', // Cyber Cyan
  orange:  '#D946EF', // Neon Magenta for review states
  pink:    '#D946EF', // Neon Magenta
  violet:  '#D946EF', // Neon Magenta
  gold:    '#D946EF',
  spark:   '#A5F3FC', // Highlight Spark
  white:   '#FFFFFF',
  gray1:   '#E2E8F0',
  gray2:   '#94A3B8',
  gray3:   '#77778C',
  s0: '#05050A',
  s1: '#0A0A12',
  s2: '#121220',
  s3: '#1A1A2E',
};

export interface PolicyStudioSettings {
  approvalThreshold: number; // in USD (default 50)
  cumulativeCap: number; // in USD (default 200)
  velocityLimit: number; // max per hour (default 5)
  jevSensitivity: 'standard' | 'strict';
}

interface PolicyStudioViewProps {
  settings: PolicyStudioSettings;
  onSettingsChange: (newSettings: PolicyStudioSettings) => void;
  currentUser: UserContextValue;
}

export function PolicyStudioView({ settings, onSettingsChange, currentUser }: PolicyStudioViewProps) {
  const [localSettings, setLocalSettings] = useState<PolicyStudioSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/policy')
      .then(res => res.json())
      .then(data => {
        if (data.config) {
          const loaded: PolicyStudioSettings = {
            approvalThreshold: Math.round(data.config.approval_threshold_minor / 100),
            cumulativeCap: Math.round(data.config.cumulative_cap_minor / 100),
            velocityLimit: data.config.velocity_max_count,
            jevSensitivity: 'standard',
          };
          setLocalSettings(loaded);
          onSettingsChange(loaded);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-airlock-user': currentUser.id },
        body: JSON.stringify({
          approval_threshold_minor: localSettings.approvalThreshold * 100,
          cumulative_cap_minor: localSettings.cumulativeCap * 100,
          velocity_max_count: localSettings.velocityLimit,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update server policy');
      }
      onSettingsChange(localSettings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    const defaults: PolicyStudioSettings = {
      approvalThreshold: 50,
      cumulativeCap: 200,
      velocityLimit: 5,
      jevSensitivity: 'standard',
    };
    setLocalSettings(defaults);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-airlock-user': currentUser.id },
        body: JSON.stringify({
          approval_threshold_minor: defaults.approvalThreshold * 100,
          cumulative_cap_minor: defaults.cumulativeCap * 100,
          velocity_max_count: defaults.velocityLimit,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset server policy');
      }
      onSettingsChange(defaults);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setSaving(false);
    }
  }

  const invariants = [
    { code: 'LIMIT-001', name: 'Auto-Approval Ceiling', desc: `Transactions > $${localSettings.approvalThreshold}.00 escalate to human approval`, status: 'ENFORCED' },
    { code: 'LIMIT-002', name: '24h Cumulative Cap', desc: `Per-merchant cap strictly capped at $${localSettings.cumulativeCap}.00`, status: 'ENFORCED' },
    { code: 'VELOCITY-001', name: 'Burst Rate Limiter', desc: `Max ${localSettings.velocityLimit} automated actions per rolling hour window`, status: 'ENFORCED' },
    { code: 'APPROVAL-001', name: 'Consequential Gate', desc: 'Consequential operations require distinct authenticated approver', status: 'ENFORCED' },
    { code: 'APPROVAL-002', name: 'Separation of Duties', desc: 'Requester cannot self-approve; cryptographic action hash bound', status: 'ENFORCED' },
    { code: 'PAYPAL-DISPUTE-001', name: 'Dispute Chargeback Shield', desc: 'Active dispute on PayPal auto-freezes refund to prevent double-loss', status: 'ENFORCED' },
    { code: 'UNCERTAIN-001', name: 'Two-Phase Commit WAL', desc: 'Network timeouts enter OUTCOME_UNKNOWN; blind retries blocked', status: 'ENFORCED' },
    { code: 'TEXT-001', name: 'Text safety checks', desc: 'Configured local model or heuristic signals (Standard policy; sensitivity toggle is demo preview)', status: 'ENFORCED' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <SlidersHorizontal className="w-5 h-5" style={{ color: C.teal }} />
            <h2 className="text-base font-black text-white">Payment policy</h2>
          </div>
          <p className="text-[11px] font-medium" style={{ color: C.gray2 }}>
            Save limits for refund requests and agent workflows. Demo settings reset on server restart.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={saving || currentUser.role !== 'approver'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold glass-card hover-neon transition disabled:opacity-50"
            style={{ border: `1px solid rgba(74,74,74,0.4)`, color: C.gray2 }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
          <button
            onClick={handleSave}
            disabled={saving || currentUser.role !== 'approver'}
            className="btn-primary flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold shadow-lg disabled:opacity-50"
          >
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</> :
             saved ? <><Check className="w-3.5 h-3.5" /> Policy saved</> :
             <><Zap className="w-3.5 h-3.5" /> Save policy</>}
          </button>
        </div>
      </div>

      {/* Role and Error Banners */}
      {currentUser.role !== 'approver' && (
        <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>Viewing as <strong>{currentUser.name}</strong> ({currentUser.role}). Authoritative policy modifications require an <strong>Approver</strong> role.</span>
          </div>
          <span className="text-[10px] uppercase font-bold text-amber-400 font-mono">Read-Only Mode</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-pink-950/40 border border-pink-500/40 text-xs text-pink-200 flex items-center gap-2 animate-count-up">
          <AlertCircle className="w-4 h-4 text-pink-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Sliders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Slider 1: Approval Threshold */}
        <div className="glass-card rounded-xl p-5 hover-neon transition-all" style={{ border: `1px solid rgba(74,74,74,0.4)` }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs font-black text-white">Auto-Approval Ceiling (LIMIT-001)</div>
              <div className="text-[10px]" style={{ color: C.gray3 }}>Amounts above this trigger REQUIRE_APPROVAL</div>
            </div>
            <div className="text-lg font-black font-mono" style={{ color: C.teal }}>
              ${localSettings.approvalThreshold}.00
            </div>
          </div>
          <input
            type="range" disabled={currentUser.role !== 'approver'}
            min="10"
            max="200"
            step="5"
            value={localSettings.approvalThreshold}
            onChange={(e) => setLocalSettings({ ...localSettings, approvalThreshold: Number(e.target.value) })}
            className="w-full accent-[#50E3C2] cursor-pointer h-1.5 rounded-lg"
          />
          <div className="flex justify-between text-[9px] mt-1.5 font-mono" style={{ color: C.gray3 }}>
            <span>$10.00 (Strict)</span>
            <span>$50.00 (Default)</span>
            <span>$200.00 (Permissive)</span>
          </div>
        </div>

        {/* Slider 2: Cumulative Cap */}
        <div className="glass-card rounded-xl p-5 hover-neon transition-all" style={{ border: `1px solid rgba(74,74,74,0.4)` }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs font-black text-white">24h Cumulative Cap (LIMIT-002)</div>
              <div className="text-[10px]" style={{ color: C.gray3 }}>Maximum aggregate disbursement per 24 hours</div>
            </div>
            <div className="text-lg font-black font-mono" style={{ color: C.primary }}>
              ${localSettings.cumulativeCap}.00
            </div>
          </div>
          <input
            type="range" disabled={currentUser.role !== 'approver'}
            min="50"
            max="1000"
            step="25"
            value={localSettings.cumulativeCap}
            onChange={(e) => setLocalSettings({ ...localSettings, cumulativeCap: Number(e.target.value) })}
            className="w-full accent-[#4A90E2] cursor-pointer h-1.5 rounded-lg"
          />
          <div className="flex justify-between text-[9px] mt-1.5 font-mono" style={{ color: C.gray3 }}>
            <span>$50.00</span>
            <span>$200.00 (Default)</span>
            <span>$1,000.00</span>
          </div>
        </div>

        {/* Slider 3: Velocity Limit */}
        <div className="glass-card rounded-xl p-5 hover-neon transition-all" style={{ border: `1px solid rgba(74,74,74,0.4)` }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs font-black text-white">Hourly Velocity Cap (VELOCITY-001)</div>
              <div className="text-[10px]" style={{ color: C.gray3 }}>Max automated transactions per rolling 60 min</div>
            </div>
            <div className="text-lg font-black font-mono" style={{ color: C.orange }}>
              {localSettings.velocityLimit} ops/hr
            </div>
          </div>
          <input
            type="range" disabled={currentUser.role !== 'approver'}
            min="1"
            max="20"
            step="1"
            value={localSettings.velocityLimit}
            onChange={(e) => setLocalSettings({ ...localSettings, velocityLimit: Number(e.target.value) })}
            className="w-full accent-[#F5A623] cursor-pointer h-1.5 rounded-lg"
          />
          <div className="flex justify-between text-[9px] mt-1.5 font-mono" style={{ color: C.gray3 }}>
            <span>1 (Conservative)</span>
            <span>5 (Default)</span>
            <span>20 (High-volume)</span>
          </div>
        </div>

        {/* Setting 4: Jev Sensitivity Toggle */}
        <div className="glass-card rounded-xl p-5 hover-neon transition-all" style={{ border: `1px solid rgba(74,74,74,0.4)` }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-white">Text safety scan sensitivity</span>
                <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-amber-500/30">Demo Only</span>
              </div>
              <div className="text-[10px]" style={{ color: C.gray3 }}>Advisory preset preview — does not alter deterministic evaluation rules</div>
            </div>
            <div className="text-xs font-black font-mono uppercase" style={{ color: localSettings.jevSensitivity === 'strict' ? C.pink : C.teal }}>
              {localSettings.jevSensitivity}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              onClick={() => setLocalSettings({ ...localSettings, jevSensitivity: 'standard' })}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition border ${
                localSettings.jevSensitivity === 'standard'
                  ? 'bg-teal-500/10 border-teal-500/40 text-teal-300'
                  : 'bg-black/20 border-white/10 text-slate-400'
              }`}
              style={{
                background: localSettings.jevSensitivity === 'standard' ? `${C.teal}15` : undefined,
                borderColor: localSettings.jevSensitivity === 'standard' ? `${C.teal}40` : undefined,
                color: localSettings.jevSensitivity === 'standard' ? C.teal : undefined,
              }}
            >
              Standard (Calibrated)
            </button>
            <button
              onClick={() => setLocalSettings({ ...localSettings, jevSensitivity: 'strict' })}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition border ${
                localSettings.jevSensitivity === 'strict'
                  ? 'bg-pink-500/10 border-pink-500/40 text-pink-300'
                  : 'bg-black/20 border-white/10 text-slate-400'
              }`}
              style={{
                background: localSettings.jevSensitivity === 'strict' ? `${C.pink}15` : undefined,
                borderColor: localSettings.jevSensitivity === 'strict' ? `${C.pink}40` : undefined,
                color: localSettings.jevSensitivity === 'strict' ? C.pink : undefined,
              }}
            >
              Strict (Zero-Tolerance)
            </button>
          </div>
        </div>
      </div>

      {/* Active Invariants Matrix */}
      <div className="glass-card rounded-xl p-5" style={{ border: `1px solid rgba(74,74,74,0.4)` }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" style={{ color: C.teal }} />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">Policy rules</h3>
          </div>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full" style={{ background: `${C.teal}12`, border: `1px solid ${C.teal}30`, color: C.teal }}>
            8 RULES
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {invariants.map((inv) => (
            <div key={inv.code} className="flex items-start justify-between p-3 rounded-lg" style={{ background: C.s0, border: `1px solid rgba(74,74,74,0.3)` }}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold" style={{ color: C.primary }}>{inv.code}</span>
                  <span className="text-xs font-bold text-white">{inv.name}</span>
                </div>
                <div className="text-[10px] mt-1 leading-snug" style={{ color: C.gray2 }}>{inv.desc}</div>
              </div>
              <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded font-mono flex-shrink-0 ml-2" style={{ background: `${C.teal}15`, color: C.teal }}>
                <Lock className="w-2.5 h-2.5" /> {inv.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}




