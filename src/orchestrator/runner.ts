/**
 * Audit-job runner — drives the state machine through transitions for a real
 * audit, calling the Python tool layer via subprocess and the TS agent layer
 * directly.
 *
 * This is the live-mode entry point that bench/run-evm.ts and bench/run-svm.ts
 * invoke when MODEL_FALLBACK_MODE != 'mock' and the required env (FORK_URL,
 * ANTHROPIC_API_KEY, ETHERSCAN_API_KEY) is present.
 *
 * Flow (Contract E in spec/01-use-case-frame.md):
 *   pending → fetching → compiling → static-analyzing →
 *   analyzer-pass → prover-pass → skeptic-pass → consolidating →
 *   persisting → completed
 *
 * The runner does NOT itself enforce budget limits or push to Postgres in
 * this v1 cut — those are orchestration concerns that wrap this primitive.
 * The bench harness consumes the returned findings directly.
 */
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import { ulid } from 'ulid';

import type { Finding } from '../finding/schema.js';
import { AnalyzerAgent } from '../agents/analyzer.js';
import { ProverAgent } from '../agents/prover.js';
import { SkepticAgent } from '../agents/skeptic.js';
import { createGateway } from '../llm/anthropic-gateway.js';
import type { LlmGateway, TrustTier } from '../llm/types.js';
import {
  AuditJobOrchestrator,
  type AuditJob,
  type AuditJobState,
} from './audit-job.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AuditTarget {
  caseId: string;
  /** 'evm' (default), 'svm' or 'off-chain'. Selects the tool pipeline. */
  subjectKind?: 'evm' | 'svm' | 'off-chain';
  chainId: number;
  /** EVM contract address or SVM program_id. */
  address: string;
  /** EVM block or SVM slot. */
  block: number;
  vulnerableContract?: string;
  vulnerableFunction?: string;
  bugClass?: string;
  description?: string;
  /**
   * Filesystem path to source. If unset for EVM, source-fetch resolves it
   * from Etherscan; required for SVM when the program is open-source.
   */
  sourcePath?: string;
  /** Solana mainnet RPC URL (svm only); required for the anchor `--clone` path. */
  rpcUrl?: string;
  /** Solana account pubkeys to clone from mainnet for anchor test (svm only). */
  cloneAccounts?: string[];
}

export type ToolRunner = (toolName: string, args: string[]) => Promise<string>;

export interface AuditRunOptions {
  forkUrl?: string;
  etherscanApiKey?: string;
  trustTier?: TrustTier;
  budgetUsd?: number;
  tenantId?: string;
  /** When set, skip the prover stage (for fast smoke runs). */
  skipProver?: boolean;
  /** When set, skip the skeptic stage. */
  skipSkeptic?: boolean;
  /** Override the default LLM gateway (used by tests). */
  gateway?: LlmGateway;
  /** Path to the silica repo root. Defaults to env SILICA_ROOT or two-up from cwd. */
  silicaRoot?: string;
  /**
   * Override the Python-tool subprocess invocation. Defaults to spawning
   * `python3 -m tools.<name>` from silicaRoot. Tests inject a fake.
   */
  runTool?: ToolRunner;
}

export interface AuditRunResult {
  job: AuditJob;
  findings: Finding[];
  toolOutputs: {
    sourceFiles: number;
    slitherFindings: number;
    /**
     * Aggregate prover verdict across all candidate findings.
     * 'fail' fires if any finding failed PoC validation; 'mixed' if some
     * passed and some were skipped; 'pass' if all passed; 'skipped' otherwise.
     */
    foundryProof?: 'pass' | 'fail' | 'mixed' | 'skipped';
  };
  err?: string;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runAudit(
  target: AuditTarget,
  opts: AuditRunOptions = {},
): Promise<AuditRunResult> {
  const trustTier: TrustTier = opts.trustTier ?? 'anthropic-no-retention';
  const tenantId = opts.tenantId ?? 'tnt_default';
  const silicaRoot = opts.silicaRoot ?? process.env['SILICA_ROOT'] ?? '/root/Silica';
  const subjectKind: AuditTarget['subjectKind'] = target.subjectKind ?? 'evm';
  const runTool: ToolRunner = opts.runTool ?? ((name, args) => callPythonTool(silicaRoot, name, args));

  // 1. Create the audit job in 'pending'
  const orchestrator = new AuditJobOrchestrator();
  let job = orchestrator.createJob({
    id: `aud_${ulid()}`,
    tenantId,
    subjectKind,
    targetAddress: target.address,
    chainId: target.chainId,
    budgetUsd: opts.budgetUsd ?? 100,
  });

  // Step helper
  const step: StepFn = (next, details = {}) => {
    const result = orchestrator.transition(job, next, details);
    if (!result.success || !result.job) {
      throw new Error(`Invalid transition ${job.state} → ${next}: ${result.error ?? 'unknown'}`);
    }
    job = result.job;
  };

  // 2-4. fetching → compiling → static-analyzing (subject-specific tool chain)
  const pipeline =
    subjectKind === 'svm'
      ? await resolveSvmPipeline(runTool, target, step)
      : await resolveEvmPipeline(runTool, target, opts, step);
  if (pipeline.kind === 'fail') {
    return failJob(job, pipeline.reason, pipeline.toolOutputs);
  }
  const { sourceDir, sourceFiles, toolFindings, sourceSnippet } = pipeline;

  // 5. analyzer-pass — invoke the Analyzer agent
  step('analyzer-pass');
  const gateway = opts.gateway ?? createGateway();
  const analyzer = new AnalyzerAgent(gateway, trustTier);
  const analyzerOutput = await analyzer.analyze({
    auditId: job.id,
    tenantId,
    trustTier,
    toolFindings,
    sourceSnippet,
  });
  const candidateFindings = analyzerOutput.findings;

  if (candidateFindings.length === 0) {
    step('consolidating', { reason: 'no candidate findings emitted' });
    step('persisting');
    step('completed');
    return {
      job,
      findings: [],
      toolOutputs: { sourceFiles, slitherFindings: toolFindings.length },
    };
  }

  // 6. prover-pass — generate + validate PoCs. Aggregate per-finding verdicts:
  // 'fail' beats 'pass' beats 'skipped' so the audit-job summary reflects
  // the worst outcome across all candidate findings.
  let proverVerdict: 'pass' | 'fail' | 'mixed' | 'skipped' = 'skipped';
  if (!opts.skipProver) {
    step('prover-pass');
    const prover = new ProverAgent(gateway, trustTier);
    const verdicts: Array<'pass' | 'fail' | 'skipped'> = [];
    for (const finding of candidateFindings) {
      const proverOutput = await prover.prove({
        finding,
        trustTier,
        forkUrl: opts.forkUrl,
        forkBlock: target.block,
        sourceContext: sourceSnippet,
      });
      verdicts.push(await runProver(runTool, subjectKind, target, opts, sourceDir, proverOutput));
    }
    proverVerdict = aggregateVerdicts(verdicts);
  }

  // 7. skeptic-pass — adversarial review
  if (!opts.skipSkeptic) {
    step('skeptic-pass');
    const skeptic = new SkepticAgent(gateway, trustTier);
    const reviewed: Finding[] = [];
    for (const finding of candidateFindings) {
      const verdict = await skeptic.review({
        finding,
        trustTier,
        sourceContext: sourceSnippet,
      });
      if (verdict.verdict !== 'failed') {
        reviewed.push(finding);
      }
    }
    candidateFindings.length = 0;
    candidateFindings.push(...reviewed);
  }

  // 8. consolidating → persisting → completed
  step('consolidating');
  for (const finding of candidateFindings) {
    finding.id = finding.id || `fnd_${ulid()}`;
    finding.audit_id = job.id;
    finding.tenant_id = tenantId;
  }
  step('persisting');
  step('completed');

  return {
    job,
    findings: candidateFindings,
    toolOutputs: {
      sourceFiles,
      slitherFindings: toolFindings.length,
      foundryProof: proverVerdict,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StepFn = (next: AuditJobState, details?: Record<string, unknown>) => void;
type PipelineOk = {
  kind: 'ok';
  sourceDir: string;
  sourceFiles: number;
  toolFindings: Array<Record<string, unknown>>;
  sourceSnippet: string;
};
type PipelineFail = {
  kind: 'fail';
  reason: string;
  toolOutputs: AuditRunResult['toolOutputs'];
};
type PipelineResult = PipelineOk | PipelineFail;

async function resolveEvmPipeline(
  runTool: ToolRunner,
  target: AuditTarget,
  opts: AuditRunOptions,
  step: StepFn,
): Promise<PipelineResult> {
  step('fetching');
  const sourceJson = await runTool('source-fetch', [
    target.address,
    '--chain',
    String(target.chainId),
    ...(opts.etherscanApiKey ? ['--api-key', opts.etherscanApiKey] : []),
  ]);
  const sourceResolution = JSON.parse(sourceJson) as {
    source_files?: Record<string, string>;
  };
  const files = sourceResolution.source_files ?? {};
  const sourceFiles = Object.keys(files).length;
  if (sourceFiles === 0) {
    return { kind: 'fail', reason: 'no source files resolved', toolOutputs: { sourceFiles: 0, slitherFindings: 0 } };
  }

  step('compiling', { sourceFiles });
  const sourceDir = mkdtempSync(join(tmpdir(), `silica-${target.caseId}-`));
  for (const [filename, content] of Object.entries(files)) {
    // Etherscan-supplied filenames are untrusted. Strip any path traversal
    // and require a non-empty basename. We also flatten subdirectories: the
    // Slither container reads the dir as a flat unit, so collisions are
    // recorded but cannot escape sourceDir.
    const safe = sanitizeWriteFilename(filename);
    if (safe === null) continue;
    writeFileSync(join(sourceDir, safe), content);
  }

  step('static-analyzing');
  const slitherJson = await runTool('slither', [sourceDir]);
  const slitherResult = JSON.parse(slitherJson) as { findings?: Array<Record<string, unknown>> };
  const toolFindings = slitherResult.findings ?? [];
  const sourceSnippet = Object.values(files).slice(0, 3).join('\n\n');
  return { kind: 'ok', sourceDir, sourceFiles, toolFindings, sourceSnippet };
}

async function resolveSvmPipeline(
  runTool: ToolRunner,
  target: AuditTarget,
  step: StepFn,
): Promise<PipelineResult> {
  // SVM has no on-chain source-fetch equivalent. The fixture must supply a
  // local path to the program source (Anchor/Solana repo). Closed-source
  // programs short-circuit to the no-source fail path.
  step('fetching');
  if (!target.sourcePath) {
    return {
      kind: 'fail',
      reason: 'svm: target.sourcePath is required (no on-chain source recovery)',
      toolOutputs: { sourceFiles: 0, slitherFindings: 0 },
    };
  }
  const sourceDir = target.sourcePath;
  const sourceFiles = readdirSync(sourceDir).length;
  step('compiling', { sourceFiles });

  step('static-analyzing');
  const soteriaJson = await runTool('soteria', [sourceDir]);
  const soteriaResult = JSON.parse(soteriaJson) as { findings?: Array<Record<string, unknown>> };
  const toolFindings = soteriaResult.findings ?? [];
  const sourceSnippet = `// SVM program at ${sourceDir} (program_id ${target.address}, slot ${target.block})`;
  return { kind: 'ok', sourceDir, sourceFiles, toolFindings, sourceSnippet };
}

async function runProver(
  runTool: ToolRunner,
  subjectKind: NonNullable<AuditTarget['subjectKind']>,
  target: AuditTarget,
  opts: AuditRunOptions,
  sourceDir: string,
  proverOutput: { framework: string; testFileName: string; pocCode: string },
): Promise<'pass' | 'fail' | 'skipped'> {
  // `proverOutput.testFileName` is LLM-produced and therefore untrusted.
  // A prompt-injected source can poison the Finding the prover sees and
  // induce a malicious filename ("../../etc/cron.d/payload"). Reject any
  // value that is not a safe single-segment basename.
  const safeName = sanitizeProverFilename(proverOutput.testFileName, subjectKind);
  if (safeName === null) {
    return 'skipped';
  }

  if (subjectKind === 'evm' && opts.forkUrl && proverOutput.framework === 'foundry') {
    const pocDir = mkdtempSync(join(tmpdir(), `silica-poc-${target.caseId}-`));
    writeFileSync(join(pocDir, safeName), proverOutput.pocCode, { encoding: 'utf-8' });
    const foundryJson = await runTool('foundry', [
      pocDir,
      '--fork-block',
      String(target.block),
      '--fork-url',
      opts.forkUrl,
    ]);
    const r = JSON.parse(foundryJson) as { success: boolean };
    return r.success ? 'pass' : 'fail';
  }

  if (subjectKind === 'svm' && proverOutput.framework === 'anchor') {
    // Copy the user's program source into a tmpdir before writing the PoC,
    // so an audit run never mutates the auditor's working tree.
    const pocDir = mkdtempSync(join(tmpdir(), `silica-poc-${target.caseId}-`));
    cpSync(sourceDir, pocDir, { recursive: true });
    writeFileSync(join(pocDir, safeName), proverOutput.pocCode, { encoding: 'utf-8' });
    const anchorArgs = [pocDir];
    if (target.rpcUrl) anchorArgs.push('--rpc-url', target.rpcUrl);
    for (const pubkey of target.cloneAccounts ?? []) anchorArgs.push('--clone', pubkey);
    const anchorJson = await runTool('anchor', anchorArgs);
    const r = JSON.parse(anchorJson) as { success: boolean };
    return r.success ? 'pass' : 'fail';
  }

  return 'skipped';
}

/**
 * Reduce per-finding verdicts to a single audit-level summary.
 * Order: any 'fail' → 'fail'; mix of 'pass' and 'skipped' → 'mixed';
 * all 'pass' → 'pass'; otherwise → 'skipped'.
 */
function aggregateVerdicts(
  verdicts: Array<'pass' | 'fail' | 'skipped'>,
): 'pass' | 'fail' | 'mixed' | 'skipped' {
  if (verdicts.length === 0) return 'skipped';
  if (verdicts.some(v => v === 'fail')) return 'fail';
  const passes = verdicts.filter(v => v === 'pass').length;
  if (passes === verdicts.length) return 'pass';
  if (passes > 0) return 'mixed';
  return 'skipped';
}

/**
 * Source-fetch sanitizer for Etherscan-supplied filenames. Returns the
 * basename with `[^\w.-]` replaced; rejects (returns null) any name that
 * resolves to '.', '..', '', or starts with '.' (hidden file).
 *
 * Exported for unit testing.
 */
export function sanitizeWriteFilename(raw: string): string | null {
  const base = basename(raw);
  if (!base || base === '.' || base === '..' || base.startsWith('.')) return null;
  const safe = base.replace(/[^\w.-]/g, '_');
  return safe.length > 0 ? safe : null;
}

/**
 * Prover-output filename sanitizer. Stricter than `sanitizeWriteFilename`:
 * the LLM has no legitimate reason to emit a path-shaped name, so any
 * `/`, `\`, `..`, null byte, absolute path, or wrong-extension is rejected
 * outright (no normalization). Returns null if unsafe; callers skip the
 * PoC write rather than risk filesystem escape.
 *
 * Exported for unit testing.
 */
export function sanitizeProverFilename(
  raw: string,
  subjectKind: NonNullable<AuditTarget['subjectKind']>,
): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (isAbsolute(raw)) return null;
  // Reject path-shaped input outright — no normalization for LLM output.
  if (raw.includes('/') || raw.includes('\\') || raw.includes('..') || raw.includes('\0')) return null;
  if (raw === '.' || raw === '..' || raw.startsWith('.')) return null;
  // Lock to the framework's expected suffix to catch obvious anomalies.
  const expectedSuffix = subjectKind === 'evm' ? '.sol' : '.ts';
  if (!raw.endsWith(expectedSuffix) && !raw.endsWith(expectedSuffix.toUpperCase())) return null;
  return raw;
}

function failJob(job: AuditJob, reason: string, toolOutputs: AuditRunResult['toolOutputs']): AuditRunResult {
  const failed = new AuditJobOrchestrator().transition(job, 'failed', { reason });
  return {
    job: failed.success && failed.job ? failed.job : job,
    findings: [],
    toolOutputs,
    err: reason,
  };
}

/**
 * Invoke a Python tool's CLI shim and return its stdout (JSON).
 * Spawns `python3 -m tools.<tool> <args>` from the silica root.
 */
function callPythonTool(silicaRoot: string, toolName: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'python3',
      ['-m', `tools.${toolName.replace(/-/g, '_')}`, ...args],
      {
        cwd: silicaRoot,
        env: { ...process.env, PYTHONPATH: silicaRoot },
      },
    );

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err: Error) => reject(err));
    proc.on('close', (code: number) => {
      if (code === 0 || code === 1) {
        resolve(stdout);
      } else {
        reject(new Error(`Python tool ${toolName} exited ${code}: ${stderr.slice(0, 500)}`));
      }
    });
  });
}
