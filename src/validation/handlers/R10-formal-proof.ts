import type { ValidationRungHandler, ValidationContext, ValidationResult } from '../tiers.js';
import { CONFIDENCE_CEILING } from '../../finding/schema.js';
import type { Finding } from '../../finding/schema.js';

/**
 * R10 — formal-proof
 *
 * Applicable for self-contained primitives where SMT/symbolic execution is tractable.
 * Confidence ceiling: 0.99.
 *
 * Applicability: function is loop-free and has no dynamic dispatch (rare in practice)
 *
 * This shell throws "not yet bound" until a VM-specific implementor is registered
 * via ValidationHandlerRegistry at src/validation/registry.ts.
 */
export class FormalProofHandler implements ValidationRungHandler {
  readonly rung = 'formal-proof' as const;
  readonly confidenceCeiling = CONFIDENCE_CEILING['formal-proof'];

  applicableFor(_finding: Finding): boolean {
    // Default: false — VM-specific implementors override with real predicate.
    // R0 is the only always-applicable rung.
    return false;
  }

  async attempt(_finding: Finding, _ctx: ValidationContext): Promise<ValidationResult> {
    throw new Error('R10 formal-proof: no implementor bound for this VM. Bind via ValidationHandlerRegistry.');
  }
}

export const handler: ValidationRungHandler = new FormalProofHandler();
