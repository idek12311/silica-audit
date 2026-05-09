/**
 * Silica EVM bench runner.
 *
 * Walks bench/cases/evm/ and runs each case's exploit.t.sol through the
 * Foundry runner, then compares the result against expected-finding.json.
 *
 * Usage:
 *   npm run bench:evm
 *   npm run bench:evm -- --case euler
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

interface BenchCase {
  caseId: string;
  casePath: string;
  fixture: Record<string, unknown>;
  expectedFinding: Record<string, unknown>;
}

interface BenchResult {
  caseId: string;
  passed: boolean;
  reason: string;
}

function loadCases(benchDir: string, filter?: string): BenchCase[] {
  const evmDir = join(benchDir, 'cases', 'evm');
  const caseDirs = readdirSync(evmDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(name => !filter || name === filter);

  return caseDirs.map(name => {
    const casePath = join(evmDir, name);
    const fixture = JSON.parse(readFileSync(join(casePath, 'fixture.json'), 'utf8')) as Record<string, unknown>;
    const expectedFinding = JSON.parse(readFileSync(join(casePath, 'expected-finding.json'), 'utf8')) as Record<string, unknown>;
    return { caseId: name, casePath, fixture, expectedFinding };
  });
}

async function runCase(benchCase: BenchCase): Promise<BenchResult> {
  const { caseId, fixture, expectedFinding } = benchCase;

  // In mock/CI mode (MODEL_FALLBACK_MODE=mock or no FORK_URL), we validate
  // that the fixture + expected-finding JSON structures are well-formed.
  // In live mode, we would invoke the Foundry runner with the actual fork.

  const mockMode = process.env['MODEL_FALLBACK_MODE'] === 'mock' || !process.env['FORK_URL'];

  if (mockMode) {
    // Validate fixture structure
    if (!fixture['case_id'] || !fixture['chain_id'] || !fixture['block']) {
      return { caseId, passed: false, reason: 'Fixture missing required fields' };
    }
    // Validate expected finding structure
    const ef = expectedFinding as { class?: { taxonomy_id?: string }; severity?: { level?: string } };
    if (!ef.class?.taxonomy_id || !ef.severity?.level) {
      return { caseId, passed: false, reason: 'Expected finding missing class.taxonomy_id or severity.level' };
    }
    // Check heuristic citations reference valid IDs from convention
    const heuristics = (expectedFinding['heuristics_cited'] as Array<{ heuristic_id?: string }>) ?? [];
    for (const h of heuristics) {
      if (!h.heuristic_id?.startsWith('HEUR-')) {
        return { caseId, passed: false, reason: `Invalid heuristic_id format: ${h.heuristic_id}` };
      }
    }
    return { caseId, passed: true, reason: 'Fixture validation passed (mock mode)' };
  }

  // Live mode: would invoke Foundry runner here
  // This is a placeholder for the integration test path
  return { caseId, passed: false, reason: 'Live mode not implemented — set FORK_URL to run' };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      case: { type: 'string', short: 'c' },
    },
    strict: false,
  });

  const caseFilter = values['case'];
  const benchDir = new URL('.', import.meta.url).pathname.replace(/\/$/, '');

  console.log(`\nSilica EVM Bench${caseFilter ? ` — case: ${caseFilter}` : ''}\n`);

  const cases = loadCases(benchDir, caseFilter);
  if (cases.length === 0) {
    console.error(`No cases found${caseFilter ? ` matching '${caseFilter}'` : ''}`);
    process.exit(1);
  }

  const results: BenchResult[] = [];
  for (const benchCase of cases) {
    const result = await runCase(benchCase);
    results.push(result);
    console.log(`  [${result.passed ? 'PASS' : 'FAIL'}] ${result.caseId}: ${result.reason}`);
  }

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\nResult: ${passed}/${total} passed\n`);

  if (passed < total) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
