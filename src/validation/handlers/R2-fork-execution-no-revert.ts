import type { ValidationRungHandler, ValidationContext, ValidationResult } from '../tiers.js';
import { CONFIDENCE_CEILING } from '../../finding/schema.js';
import type { Finding } from '../../finding/schema.js';

/**
 * R2 — fork-execution-no-revert
 *
 * Always applicable when a fork RPC is available.
 * Confidence ceiling: 0.75.
 *
 * Applicability: True — fork environment must be configured in ctx
 *
 * This shell throws "not yet bound" until a VM-specific implementor is registered
 * via ValidationHandlerRegistry at src/validation/registry.ts.
 */
export class ForkExecutionNoRevertHandler implements ValidationRungHandler {
  readonly rung = 'fork-execution-no-revert' as const;
  readonly confidenceCeiling = CONFIDENCE_CEILING['fork-execution-no-revert'];

  applicableFor(_finding: Finding): boolean {
    // Default: false — VM-specific implementors override with real predicate.
    // R0 is the only always-applicable rung.
    return false;
  }

  async attempt(_finding: Finding, _ctx: ValidationContext): Promise<ValidationResult> {
    throw new Error('R2 fork-execution-no-revert: no implementor bound for this VM. Bind via ValidationHandlerRegistry.');
  }
}

export const handler: ValidationRungHandler = new ForkExecutionNoRevertHandler();
