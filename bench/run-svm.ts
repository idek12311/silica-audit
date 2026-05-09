/**
 * Silica SVM bench runner.
 * Walks bench/cases/svm/ and validates fixtures in mock mode.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface BenchResult { caseId: string; passed: boolean; reason: string; }

async function main(): Promise<void> {
  const benchDir = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
  const svmDir = join(benchDir, 'cases', 'svm');

  if (!existsSync(svmDir)) {
    console.log('No SVM bench cases yet');
    process.exit(1);
  }

  const caseDirs = readdirSync(svmDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  console.log(`\nSilica SVM Bench\n`);

  const results: BenchResult[] = [];
  for (const name of caseDirs) {
    const casePath = join(svmDir, name);
    try {
      const fixture = JSON.parse(readFileSync(join(casePath, 'fixture.json'), 'utf8')) as Record<string, unknown>;
      const ef = JSON.parse(readFileSync(join(casePath, 'expected-finding.json'), 'utf8')) as { class?: { taxonomy_id?: string }; severity?: { level?: string } };
      if (!fixture['case_id'] || !ef.class?.taxonomy_id) {
        results.push({ caseId: name, passed: false, reason: 'Missing required fields' });
      } else {
        results.push({ caseId: name, passed: true, reason: 'Fixture validation passed (mock mode)' });
      }
    } catch (err) {
      results.push({ caseId: name, passed: false, reason: String(err) });
    }
    console.log(`  [${results[results.length - 1]!.passed ? 'PASS' : 'FAIL'}] ${name}: ${results[results.length - 1]!.reason}`);
  }

  const passed = results.filter(r => r.passed).length;
  console.log(`\nResult: ${passed}/${results.length} passed\n`);
  process.exit(passed < results.length ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
