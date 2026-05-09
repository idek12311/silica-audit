/**
 * Silica full bench runner — runs EVM + SVM + perimeter.
 * Delegates to run-evm.ts and run-svm.ts.
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(script: string): boolean {
  const result = spawnSync('npx', ['tsx', join(__dirname, script)], { stdio: 'inherit' });
  return result.status === 0;
}

const evmPass = run('run-evm.ts');
const svmPass = run('run-svm.ts');

if (!evmPass || !svmPass) {
  process.exit(1);
}
