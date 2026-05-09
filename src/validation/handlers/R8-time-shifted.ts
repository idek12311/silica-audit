import type { ValidationRungHandler, ValidationContext, ValidationResult } from '../tiers.js';
import { CONFIDENCE_CEILING } from '../../finding/schema.js';
import type { Finding } from '../../finding/schema.js';

/**
 * R8 — time-shifted
 *
 * Applicable when the bug requires evm_setNextBlockTimestamp or block warps.
 * Confidence ceiling: 0.90.
 *
 * Applicability: class is time-dependent (vesting, expiring, cooldown)
 *
 * This shell throws "not yet bound" until a VM-specific implementor is registered
 * via ValidationHandlerRegistry at src/validation/registry.ts.
 */
export class TimeShiftedHandler implements ValidationRungHandler {
  readonly rung = 'time-shifted' as const;
  readonly confidenceCeiling = CONFIDENCE_CEILING['time-shifted'];

  applicableFor(_finding: Finding): boolean {
    // Default: false — VM-specific implementors override with real predicate.
    // R0 is the only always-applicable rung.
    return false;
  }

  async attempt(_finding: Finding, _ctx: ValidationContext): Promise<ValidationResult> {
    throw new Error('R8 time-shifted: no implementor bound for this VM. Bind via ValidationHandlerRegistry.');
  }
}

export const handler: ValidationRungHandler = new TimeShiftedHandler();
