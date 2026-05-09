import type { Finding } from '../finding/schema.js';
import { CONFIDENCE_CEILING } from '../finding/schema.js';
import type { ValidationRungName } from '../finding/schema.js';

// Re-export for consumers of the validation module
export type { ValidationRungName };

// ---------------------------------------------------------------------------
// ValidationContext — what the handler receives alongside the finding
// ---------------------------------------------------------------------------

export interface ValidationContext {
  /** Absolute path to the source tree for this audit job */
  sourcePath: string;
  /** RPC endpoint for fork simulations */
  rpcUrl?: string;
  /** Block / slot to fork at (resolved by source-fetcher) */
  forkAnchor?: { chainId?: number; block?: number; slot?: number };
  /** Maximum wall-clock seconds allowed for this rung attempt */
  timeoutSeconds: number;
  /** Tool-runner endpoint (e.g., Docker socket path or remote URL) */
  toolRunnerEndpoint?: string;
}

// ---------------------------------------------------------------------------
// ValidationResult — what a handler returns
// ---------------------------------------------------------------------------

export type ValidationOutcome =
  | 'pass'
  | 'fail-hard'      // definitive failure — do not retry
  | 'fail-flaky'     // transient failure — retry once
  | 'not-applicable' // this rung does not apply to this finding
  | 'skipped';       // budget or policy skip

export interface ValidationResult {
  outcome: ValidationOutcome;
  /** Confidence score if outcome is pass. Bounded by rung's ceiling. */
  confidence?: number;
  /** URI pointing to the artifact produced (PoC file, trace log, etc.) */
  artifactUri?: string;
  /** Human-readable reason for the outcome */
  reason?: string;
  /** Wall-clock duration of the attempt in milliseconds */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// ValidationRungHandler — the spine interface (Contract C)
// ---------------------------------------------------------------------------

/**
 * Per-rung handler interface.
 *
 * Implementors live in src/validation/handlers/<rung>.ts and are bound
 * to specific VMs in src/validation/registry.ts (not here — the spine
 * must not import EVM or SVM tool runners).
 */
export interface ValidationRungHandler {
  readonly rung: ValidationRungName;
  /** Confidence ceiling for this rung, per validation-tiers.md */
  readonly confidenceCeiling: number;

  /**
   * Returns true if this rung is applicable to the given finding.
   * Must not perform any I/O — pure predicate over the finding shape.
   */
  applicableFor(finding: Finding): boolean;

  /**
   * Attempts the rung.
   * Must respect ctx.timeoutSeconds — exceeding it is a fail-flaky result.
   */
  attempt(finding: Finding, ctx: ValidationContext): Promise<ValidationResult>;
}

// ---------------------------------------------------------------------------
// Rung ordering (monotone ladder)
// ---------------------------------------------------------------------------

export const RUNG_ORDER: readonly ValidationRungName[] = [
  'static-signal-only',
  'compile-only',
  'fork-execution-no-revert',
  'fork-execution-state-asserted',
  'fork-execution-with-mocked-actor',
  'multi-tx-orchestrated',
  'multi-fork-coordinated',
  'mempool-replay',
  'time-shifted',
  'invariant-fuzz-counterexample',
  'formal-proof',
  'applicable-but-unprovable',
] as const;

/** Returns the rung that comes after `current` in the ladder, or null if at the top */
export function nextRung(current: ValidationRungName): ValidationRungName | null {
  const idx = RUNG_ORDER.indexOf(current);
  if (idx < 0 || idx === RUNG_ORDER.length - 1) return null;
  return RUNG_ORDER[idx + 1] ?? null;
}

/** Returns true if `candidate` is strictly higher than `reference` in the ladder */
export function isHigherRung(candidate: ValidationRungName, reference: ValidationRungName): boolean {
  return RUNG_ORDER.indexOf(candidate) > RUNG_ORDER.indexOf(reference);
}

/** Bounds a raw confidence score to the ceiling for the given rung */
export function boundConfidence(score: number, rung: ValidationRungName): number {
  const ceiling = CONFIDENCE_CEILING[rung];
  return Math.min(score, ceiling);
}

// ---------------------------------------------------------------------------
// Handler registry type (implementations bind at the adapter layer)
// ---------------------------------------------------------------------------

export type VmKind = 'evm' | 'svm' | 'off-chain';

export interface ValidationHandlerRegistry {
  /**
   * Returns the bound handler for a specific rung and VM.
   * Returns null if no implementor is registered for this combination.
   */
  handlerFor(rung: ValidationRungName, vm: VmKind): ValidationRungHandler | null;

  /** All registered handlers for a given VM, in ladder order */
  handlersForVm(vm: VmKind): ValidationRungHandler[];
}
