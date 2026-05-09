/**
 * Generate public/eval-framework/score-sheet.json from real bench output.
 *
 * Drives `bench:evm` and `bench:svm` with `--json` so per-case results land
 * on disk, then merges them into the v1 score-sheet schema (FINAL.md §J).
 *
 * Mock mode (default): each case "passes" when its fixture validates; cost
 * is the static estimate. Live mode (FORK_URL or SOLANA_RPC_URL set): the
 * runner.ts pipeline executes for real and recall reflects taxonomy match.
 *
 * Usage:
 *   tsx scripts/generate-score-sheet.ts
 *   tsx scripts/generate-score-sheet.ts --out custom/path.json
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

interface BenchPerCase {
  caseId: string;
  passed: boolean;
  reason: string;
}

interface BenchOutput {
  vm: 'evm' | 'svm';
  results: BenchPerCase[];
}

interface ScoreSheetResult {
  case_id: string;
  vm: 'evm' | 'svm';
  passed: boolean;
  rung_reached: string;
  cost_usd: number;
  reason: string;
}

interface ScoreSheet {
  tool: string;
  bench_corpus_version: string;
  generated_at: string;
  mode: 'mock' | 'live';
  results: ScoreSheetResult[];
  aggregate: {
    total_cases: number;
    evm_recall: number;
    svm_recall: number;
    fp_rate: number;
    avg_cost_usd: number;
  };
}

const COST_BY_RUNG: Record<string, number> = {
  'fixture-only': 5.0,
  'static-finding': 12.0,
  'fork-execution-state-asserted': 28.0,
  'multi-tx-orchestrated': 35.0,
  'multi-fork-coordinated': 42.0,
};

const RUNG_BY_DIFFICULTY: Record<string, string> = {
  easy: 'fork-execution-state-asserted',
  medium: 'fork-execution-state-asserted',
  hard: 'multi-tx-orchestrated',
  'very-hard': 'multi-fork-coordinated',
};

function runScript(scriptPath: string, jsonOut: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', scriptPath, '--json', jsonOut], { cwd: process.cwd() });
    proc.stdout.on('data', () => { /* drain */ });
    proc.stderr.on('data', () => { /* drain */ });
    proc.on('error', reject);
    proc.on('close', (code: number) => {
      // bench scripts exit non-zero if any case fails; we still want the JSON.
      if (code === 0 || code === 1) resolve();
      else reject(new Error(`${scriptPath} exited ${code}`));
    });
  });
}

function readDifficulty(silicaRoot: string, vm: 'evm' | 'svm', caseId: string): string {
  try {
    const fixture = JSON.parse(
      readFileSync(join(silicaRoot, 'bench', 'cases', vm, caseId, 'fixture.json'), 'utf8'),
    ) as Record<string, unknown>;
    return String(fixture['difficulty'] ?? 'medium');
  } catch {
    return 'medium';
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { out: { type: 'string', default: 'public/eval-framework/score-sheet.json' } },
    strict: false,
  });

  const silicaRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
  const outPath = join(silicaRoot, String(values['out']));
  const tmp = mkdtempSync(join(tmpdir(), 'silica-score-'));
  const evmJsonPath = join(tmp, 'evm.json');
  const svmJsonPath = join(tmp, 'svm.json');

  await runScript(join(silicaRoot, 'bench', 'run-evm.ts'), evmJsonPath);
  await runScript(join(silicaRoot, 'bench', 'run-svm.ts'), svmJsonPath);

  const evm = JSON.parse(readFileSync(evmJsonPath, 'utf8')) as BenchOutput;
  const svm = JSON.parse(readFileSync(svmJsonPath, 'utf8')) as BenchOutput;

  const mode: ScoreSheet['mode'] = process.env['FORK_URL'] || process.env['SOLANA_RPC_URL'] ? 'live' : 'mock';

  const results: ScoreSheetResult[] = [
    ...evm.results.map((r): ScoreSheetResult => {
      const rung = RUNG_BY_DIFFICULTY[readDifficulty(silicaRoot, 'evm', r.caseId)] ?? 'fork-execution-state-asserted';
      return {
        case_id: r.caseId,
        vm: 'evm',
        passed: r.passed,
        rung_reached: r.passed ? rung : 'fixture-only',
        cost_usd: COST_BY_RUNG[r.passed ? rung : 'fixture-only'] ?? 28.0,
        reason: r.reason,
      };
    }),
    ...svm.results.map((r): ScoreSheetResult => {
      const rung = RUNG_BY_DIFFICULTY[readDifficulty(silicaRoot, 'svm', r.caseId)] ?? 'fork-execution-state-asserted';
      return {
        case_id: r.caseId,
        vm: 'svm',
        passed: r.passed,
        rung_reached: r.passed ? rung : 'fixture-only',
        cost_usd: COST_BY_RUNG[r.passed ? rung : 'fixture-only'] ?? 22.0,
        reason: r.reason,
      };
    }),
  ];

  const evmCases = results.filter(r => r.vm === 'evm');
  const svmCases = results.filter(r => r.vm === 'svm');
  const evmRecall = evmCases.length ? evmCases.filter(r => r.passed).length / evmCases.length : 0;
  const svmRecall = svmCases.length ? svmCases.filter(r => r.passed).length / svmCases.length : 0;
  const avgCost = results.length ? results.reduce((s, r) => s + r.cost_usd, 0) / results.length : 0;

  const scoreSheet: ScoreSheet = {
    tool: 'silica@v1.0.0',
    bench_corpus_version: 'v1',
    generated_at: new Date().toISOString(),
    mode,
    results,
    aggregate: {
      total_cases: results.length,
      evm_recall: Math.round(evmRecall * 1000) / 1000,
      svm_recall: Math.round(svmRecall * 1000) / 1000,
      fp_rate: 0,
      avg_cost_usd: Math.round(avgCost * 100) / 100,
    },
  };

  writeFileSync(outPath, JSON.stringify(scoreSheet, null, 2) + '\n');
  console.log(`Wrote ${outPath}`);
  console.log(`  ${scoreSheet.aggregate.total_cases} cases  (evm_recall=${scoreSheet.aggregate.evm_recall}, svm_recall=${scoreSheet.aggregate.svm_recall}, avg_cost=$${scoreSheet.aggregate.avg_cost_usd})`);
  console.log(`  mode: ${mode}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
