'use client';

import React, { useState } from 'react';
import { SlidersHorizontal, ShieldCheck, Check, RotateCcw, Zap, Lock, Info } from 'lucide-react';

const C = {
  primary: '#4A90E2', teal: '#50E3C2', orange: '#F5A623', pink: '#E94E77',
  violet: '#9013FE', gold: '#F8E71C', white: '#FFFFFF', gray1: '#D1D1D1',
  gray2: '#B7B7B7', gray3: '#4A4A4A', s0: '#07090f', s1: '#0e1117', s2: '#151b26', s3: '#1c2333',
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
}

export function PolicyStudioView({ settings, onSettingsChange }: PolicyStudioViewProps) {
  const [localSettings, setLocalSettings] = useState<PolicyStudioSettings>(settings);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    onSettingsChange(localSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function handleReset() {
    const defaults: PolicyStudioSettings = {
      approvalThreshold: 50,
      cumulativeCap: 200,
      velocityLimit: 5,
      jevSensitivity: 'standard',
    };
    setLocalSettings(defaults);
    onSettingsChange(defaults);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const invariants = [
    { code: 'LIMIT-001', name: 'Auto-Approval Ceiling', desc: `Transactions > $${localSettings.approvalThreshold}.00 escalate to human approval`, status: 'ENFORCED' },
    { code: 'LIMIT-002', name: '24h Cumulative Cap', desc: `Per-merchant cap strictly capped at $${localSettings.cumulativeCap}.00`, status: 'ENFORCED' },
    { code: 'VELOCITY-001', name: 'Burst Rate Limiter', desc: `Max ${localSettings.velocityLimit} automated actions per rolling hour window`, status: 'ENFORCED' },
    { code: 'APPROVAL-001', name: 'Consequential Gate', desc: 'Consequential operations require distinct authenticated approver', status: 'ENFORCED' },
    { code: 'APPROVAL-002', name: 'Separation of Duties', desc: 'Requester cannot self-approve; cryptographic action hash bound', status: 'ENFORCED' },
    { code: 'PAYPAL-DISPUTE-001', name: 'Dispute Chargeback Shield', desc: 'Active dispute on PayPal auto-freezes refund to prevent double-loss', status: 'ENFORCED' },
    { code: 'UNCERTAIN-001', name: 'Two-Phase Commit WAL', desc: 'Network timeouts enter OUTCOME_UNKNOWN; blind retries blocked', status: 'ENFORCED' },
    { code: 'JEV-001', name: 'TypeSafe Adversarial Shield', desc: `Calibrated Decision Model scan (${localSettings.jevSensitivity.toUpperCase()})`, status: 'ENFORCED' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <SlidersHorizontal className="w-5 h-5" style={{ color: C.teal }} />
            <h2 className="text-base font-black text-white">Interactive Policy Studio</h2>
          </div>
          <p className="text-[11px] font-medium" style={{ color: C.gray2 }}>
            Adjust live financial safety thresholds & invariants · Applied in real-time to the policy evaluation engine
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold glass-card hover-neon transition"
            style={{ border: `1px solid rgba(74,74,74,0.4)`, color: C.gray2 }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
          <button
            onClick={handleSave}
            className="btn-primary flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold shadow-lg"
          >
            {saved ? <><Check className="w-3.5 h-3.5" /> Invariants Active!</> : <><Zap className="w-3.5 h-3.5" /> Apply Live Invariants</>}
          </button>
        </div>
      </div>

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
            type="range"
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
            type="range"
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
            type="range"
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
              <div className="text-xs font-black text-white">TypeSafe Jev AI Scan Sensitivity</div>
              <div className="text-[10px]" style={{ color: C.gray3 }}>Prompt injection & semantic ambiguity detection</div>
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
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">Active Invariants Matrix (Zero-Trust Guardrails)</h3>
          </div>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full" style={{ background: `${C.teal}12`, border: `1px solid ${C.teal}30`, color: C.teal }}>
            8/8 INVARIANTS ACTIVE
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

