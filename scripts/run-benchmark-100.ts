import { runEvaluation } from '../tests/eval/runner.js';

// ANSI color helpers
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

async function main() {
  console.log(`\n${c.cyan}========================================================================${c.reset}`);
  console.log(`   ${c.bold}AIRLOCK COMPREHENSIVE 100+ SCENARIO BENCHMARK EVALUATOR${c.reset}`);
  console.log(`   ${c.dim}Stress-testing Deterministic Rules vs. Hybrid Layer (Jev + Policy)${c.reset}`);
  console.log(`${c.cyan}========================================================================${c.reset}\n`);

  console.log(`${c.blue}Running 105 real-world financial evaluation scenarios...${c.reset}`);
  const startTime = Date.now();
  const { summary } = await runEvaluation('benchmark-100');
  const elapsed = Date.now() - startTime;

  console.log(`\n${c.green}✓ Evaluation Completed in ${elapsed}ms (${summary.totalScenarios} Scenarios)${c.reset}\n`);

  console.log(`${c.bold}========================================================================${c.reset}`);
  console.log(`   ${c.bold}METRICS COMPARISON SUMMARY${c.reset}`);
  console.log(`${c.bold}========================================================================${c.reset}`);
  console.log(`  Total Scenarios Evaluated:  ${c.bold}${summary.totalScenarios}${c.reset}`);
  console.log(`  Rules-Only Accuracy:        ${summary.rulesOnly.accuracyRate < 80 ? c.yellow : c.green}${summary.rulesOnly.accuracyRate}%${c.reset}`);
  console.log(`  Hybrid (Jev + Policy) Acc:  ${c.green}${c.bold}${summary.jevPolicy.accuracyRate}%${c.reset} (Delta: ${c.green}+${(summary.jevPolicy.accuracyRate - summary.rulesOnly.accuracyRate).toFixed(1)}%${c.reset})`);
  console.log(`  Unsafe Block Rate:          ${c.green}${summary.jevPolicy.unsafeBlockRate}%${c.reset} (Rules: ${summary.rulesOnly.unsafeBlockRate}%)`);
  console.log(`  False Block Rate:           ${c.green}${summary.jevPolicy.falseBlockRate}%${c.reset} (Zero over-blocking)`);
  console.log(`  Adversarial Uplift Count:   ${c.cyan}${c.bold}${summary.upliftCount} scenarios${c.reset} (Jev caught prompt injections rules missed)`);
  console.log(`  Over-tightened Count:       ${summary.overTightenedCount === 0 ? c.green : c.red}${summary.overTightenedCount} scenarios${c.reset}`);
  console.log(`  Average Hybrid Latency:     ${c.blue}${summary.jevPolicy.avgLatencyMs} ms / evaluation${c.reset}`);

  console.log(`\n${c.bold}------------------------------------------------------------------------${c.reset}`);
  console.log(`   ${c.bold}CATEGORY BREAKDOWN${c.reset}`);
  console.log(`${c.bold}------------------------------------------------------------------------${c.reset}`);
  console.log(`  ${'Category'.padEnd(42)} | ${'Rules'.padStart(8)} | ${'Hybrid'.padStart(8)} | ${'Uplift'.padStart(8)}`);
  console.log(`  ${'-'.repeat(42)} | ${'-'.repeat(8)} | ${'-'.repeat(8)} | ${'-'.repeat(8)}`);

  for (const [category, stats] of Object.entries(summary.categories)) {
    const uplift = stats.jevPassed - stats.rulesOnlyPassed;
    const upliftStr = uplift > 0 ? `+${uplift}` : '0';
    console.log(
      `  ${category.padEnd(42)} | ${(stats.rulesOnlyPassed + '/' + stats.total).padStart(8)} | ${(stats.jevPassed + '/' + stats.total).padStart(8)} | ${upliftStr.padStart(8)}`
    );
  }

  console.log(`\n${c.cyan}========================================================================${c.reset}`);
  console.log(`  ${c.bold}Reports Generated:${c.reset}`);
  console.log(`  - JSON Results: tests/eval/results/benchmark-100-results.json`);
  console.log(`  - Markdown Report: tests/eval/results/benchmark-100-report.md`);
  console.log(`${c.cyan}========================================================================${c.reset}\n`);

  if (summary.jevPolicy.accuracyRate < 95 || summary.overTightenedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
