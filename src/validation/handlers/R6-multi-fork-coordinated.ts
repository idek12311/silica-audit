import type { ValidationRungHandler, ValidationContext, ValidationResult } from '../tiers.js';
import { CONFIDENCE_CEILING } from '../../finding/schema.js';
import type { Finding } from '../../finding/schema.js';

/**
 * R6 — multi-fork-coordinated
 *
 * Applicable when the bug requires synchronized state across multiple chains/forks.
 * Confidence ceiling: 0.85.
 *
 * Applicability: finding has secondary_locators on a different VM
 *
 * This shell throws "not yet bound" until a VM-specific implementor is registered
 * via ValidationHandlerRegistry at src/validation/registry.ts.
 */
export class MultiForkCoordinatedHandler implements ValidationRungHandler {
  readonly rung = 'multi-fork-coordinated' as const;
  readonly confidenceCeiling = CONFIDENCE_CEILING['multi-fork-coordinated'];

  applicableFor(_finding: Finding): boolean {
    // Default: false — VM-specific implementors override with real predicate.
    // R0 is the only always-applicable rung.
    return false;
  }

  async attempt(_finding: Finding, _ctx: ValidationContext): Promise<ValidationResult> {
    throw new Error('R6 multi-fork-coordinated: no implementor bound for this VM. Bind via ValidationHandlerRegistry.');
  }
}

export const handler: ValidationRungHandler = new MultiForkCoordinatedHandler();
