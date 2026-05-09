import type { ValidationRungHandler, ValidationContext, ValidationResult } from '../tiers.js';
import { CONFIDENCE_CEILING } from '../../finding/schema.js';
import type { Finding } from '../../finding/schema.js';

/**
 * R9 — invariant-fuzz-counterexample
 *
 * Applicable when a fuzzer invariant can be specified ahead of time.
 * Confidence ceiling: 0.95.
 *
 * Applicability: invariant is specifiable; fuzzer budget available
 *
 * This shell throws "not yet bound" until a VM-specific implementor is registered
 * via ValidationHandlerRegistry at src/validation/registry.ts.
 */
export class InvariantFuzzCounterexampleHandler implements ValidationRungHandler {
  readonly rung = 'invariant-fuzz-counterexample' as const;
  readonly confidenceCeiling = CONFIDENCE_CEILING['invariant-fuzz-counterexample'];

  applicableFor(_finding: Finding): boolean {
    // Default: false — VM-specific implementors override with real predicate.
    // R0 is the only always-applicable rung.
    return false;
  }

  async attempt(_finding: Finding, _ctx: ValidationContext): Promise<ValidationResult> {
    throw new Error('R9 invariant-fuzz-counterexample: no implementor bound for this VM. Bind via ValidationHandlerRegistry.');
  }
}

export const handler: ValidationRungHandler = new InvariantFuzzCounterexampleHandler();
