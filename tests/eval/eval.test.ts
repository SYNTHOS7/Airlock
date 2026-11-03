import { describe, it, expect } from 'vitest';
import { runEvaluation } from './runner.js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Day 4: AI & Evaluation Benchmark (Rules Only vs. Jev + Policy)', () => {
  it('executes primary benchmark and confirms positive Jev uplift without over-tightening', async () => {
    const { summary, markdownReport } = await runEvaluation(false);

    expect(summary.totalScenarios).toBeGreaterThanOrEqual(25);
    expect(summary.jevPolicy.accuracyRate).toBeGreaterThanOrEqual(95);
    expect(summary.upliftCount).toBeGreaterThan(0); // Confirms Jev catches threats rules missed
    expect(summary.overTightenedCount).toBe(0); // Confirms Jev did not false-block safe transactions

    // Verify report was written to disk
    const reportPath = resolve(process.cwd(), 'tests/eval/results/eval-report.md');
    expect(existsSync(reportPath)).toBe(true);
    expect(readFileSync(reportPath, 'utf8')).toContain('Airlock Evaluation Report');
  });

  it('generalizes to held-out scenarios without data leakage', async () => {
    const { summary } = await runEvaluation(true);

    expect(summary.heldOutScenarios).toBeGreaterThanOrEqual(8);
    expect(summary.jevPolicy.accuracyRate).toBeGreaterThanOrEqual(90);
    expect(summary.overTightenedCount).toBe(0);

    const heldOutReportPath = resolve(process.cwd(), 'tests/eval/results/held-out-report.md');
    expect(existsSync(heldOutReportPath)).toBe(true);
  });
});

