import { describe, it, expect } from 'vitest';
import { runEvaluation } from './runner.js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Airlock 100+ Scenario Benchmark Suite (Precision & Safety Verification)', () => {
  it('evaluates all 105 real-world scenarios and demonstrates superior accuracy with zero false-blocks', async () => {
    const { summary, markdownReport, results } = await runEvaluation('benchmark-100');

    // Invariant assertions
    expect(summary.totalScenarios).toBeGreaterThanOrEqual(100);
    expect(summary.jevPolicy.accuracyRate).toBeGreaterThanOrEqual(95);
    expect(summary.jevPolicy.falseBlockRate).toBe(0); // Never over-block safe actions
    expect(summary.overTightenedCount).toBe(0);
    expect(summary.upliftCount).toBeGreaterThan(0); // Caught adversarial and intent mismatches

    // Monotonic strictness: Verify that in no scenario did Jev loosen an authoritative policy DENY
    for (const r of results) {
      if (r.rulesOnlyDisposition === 'DENY') {
        expect(r.jevPolicyDisposition).toBe('DENY');
      }
    }

    // Verify report files exist and contain valid results
    const reportPath = resolve(process.cwd(), 'tests/eval/results/benchmark-100-report.md');
    const jsonPath = resolve(process.cwd(), 'tests/eval/results/benchmark-100-results.json');
    expect(existsSync(reportPath)).toBe(true);
    expect(existsSync(jsonPath)).toBe(true);

    const reportContent = readFileSync(reportPath, 'utf8');
    expect(reportContent).toContain('Airlock Evaluation Report');
    expect(reportContent).toContain('**Total Scenarios:** 105');
  });
});
