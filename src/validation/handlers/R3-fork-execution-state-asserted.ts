import type { ValidationRungHandler, ValidationContext, ValidationResult } from '../tiers.js';
import { CONFIDENCE_CEILING } from '../../finding/schema.js';
import type { Finding } from '../../finding/schema.js';

/**
 * R3 — fork-execution-state-asserted
 *
 * Applicable when the bug has measurable post-state (most real findings).
 * Confidence ceiling: 0.92.
 *
 * Applicability: finding has execution-proof evidence or a state-assertion shape
 *
 * This shell throws "not yet bound" until a VM-specific implementor is registered
 * via ValidationHandlerRegistry at src/validation/registry.ts.
 */
export class ForkExecutionStateAssertedHandler implements ValidationRungHandler {
  readonly rung = 'fork-execution-state-asserted' as const;
  readonly confidenceCeiling = CONFIDENCE_CEILING['fork-execution-state-asserted'];

  applicableFor(_finding: Finding): boolean {
    // Default: false — VM-specific implementors override with real predicate.
    // R0 is the only always-applicable rung.
    return false;
  }

  async attempt(_finding: Finding, _ctx: ValidationContext): Promise<ValidationResult> {
    throw new Error('R3 fork-execution-state-asserted: no implementor bound for this VM. Bind via ValidationHandlerRegistry.');
  }
}

export const handler: ValidationRungHandler = new ForkExecutionStateAssertedHandler();
