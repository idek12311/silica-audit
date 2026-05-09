/**
 * Silica SVM bench runner.
 *
 * Walks bench/cases/svm/ and runs each case in mock or live mode.
 *
 * Mock mode (default; MODEL_FALLBACK_MODE=mock or no SOLANA_RPC_URL): validates
 * that fixture + expected-finding JSON are well-formed.
 *
 * Live mode (SOLANA_RPC_URL set, fixture provides program_path): drives the
 * orchestrator runner against the local Anchor source — soteria for static
 * analysis + anchor test against solana-test-validator with --clone for
 * mainnet account state.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';

interface BenchResult {
  caseId: string;
  passed: boolean;
  reason: string;
}

async function runCase(caseId: string, casePath: string): Promise<BenchResult> {
  const fixture = JSON.parse(readFileSync(join(casePath, 'fixture.json'), 'utf8')) as Record<string, unknown>;
  const expectedFinding = JSON.parse(readFileSync(join(casePath, 'expected-finding.json'), 'utf8')) as Record<string, unknown>;

  const ef = expectedFinding as { class?: { taxonomy_id?: string }; severity?: { level?: string } };
  if (!fixture['case_id'] || !ef.class?.taxonomy_id) {
    return { caseId, passed: false, reason: 'Missing required fields' };
  }

  const mockMode = process.env['MODEL_FALLBACK_MODE'] === 'mock' || !process.env['SOLANA_RPC_URL'];
  if (mockMode) {
    return { caseId, passed: true, reason: 'Fixture validation passed (mock mode)' };
  }

  // Live mode requires a local checkout of the program — fixture supplies its
  // path. Closed-source cases (e.g. Crema) skip live mode and stay mock-only.
  const programPathRaw = fixture['program_path'] as string | undefined;
  if (!programPathRaw) {
    return { caseId, passed: true, reason: 'live-mode skipped: closed-source (no program_path)' };
  }
  const programPath = isAbsolute(programPathRaw) ? programPathRaw : join(casePath, programPathRaw);
  if (!existsSync(programPath)) {
    return { caseId, passed: false, reason: `live-mode: program_path ${programPath} not found` };
  }

  try {
    const { runAudit } = await import('../src/orchestrator/runner.js');
    const result = await runAudit(
      {
        caseId,
        subjectKind: 'svm',
        chainId: 101,
        address: String(fixture['program_id'] ?? ''),
        block: Number(fixture['slot'] ?? 0),
        bugClass: String(fixture['bug_class'] ?? ''),
        description: String(fixture['description'] ?? ''),
        sourcePath: programPath,
        rpcUrl: process.env['SOLANA_RPC_URL'],
        cloneAccounts: (fixture['clone_accounts'] as string[] | undefined) ?? [],
      },
      {
        trustTier: (process.env['TRUST_TIER'] as 'anthropic-no-retention' | 'self-hosted-vllm' | undefined) ?? 'anthropic-no-retention',
      },
    );

    const expectedClass = ef.class.taxonomy_id;
    const matched = result.findings.some(f => f.class.taxonomy_id === expectedClass);
    if (matched) {
      return {
        caseId,
        passed: true,
        reason: `live-mode: matched ${expectedClass} (${result.findings.length} findings, soteria=${result.toolOutputs.slitherFindings})`,
      };
    }
    return {
      caseId,
      passed: false,
      reason: `live-mode: expected class ${expectedClass} not in emitted findings (${result.findings.length} findings)`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { caseId, passed: false, reason: `live-mode error: ${msg.slice(0, 200)}` };
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      case: { type: 'string', short: 'c' },
      json: { type: 'string' },
    },
    strict: false,
  });
  const caseFilter = values['case'] as string | undefined;
  const jsonOut = values['json'] as string | undefined;

  const benchDir = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
  const svmDir = join(benchDir, 'cases', 'svm');
  if (!existsSync(svmDir)) {
    console.log('No SVM bench cases yet');
    process.exit(1);
  }

  const caseDirs = readdirSync(svmDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(name => !caseFilter || name === caseFilter);

  console.log(`\nSilica SVM Bench${caseFilter ? ` — case: ${caseFilter}` : ''}\n`);

  const results: BenchResult[] = [];
  for (const name of caseDirs) {
    const result = await runCase(name, join(svmDir, name));
    results.push(result);
    console.log(`  [${result.passed ? 'PASS' : 'FAIL'}] ${result.caseId}: ${result.reason}`);
  }

  const passed = results.filter(r => r.passed).length;
  console.log(`\nResult: ${passed}/${results.length} passed\n`);

  if (jsonOut) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(jsonOut, JSON.stringify({ vm: 'svm', results }, null, 2));
  }

  process.exit(passed < results.length ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
