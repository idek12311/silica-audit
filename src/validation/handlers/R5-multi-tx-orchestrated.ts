import type { ValidationRungHandler, ValidationContext, ValidationResult } from '../tiers.js';
import { CONFIDENCE_CEILING } from '../../finding/schema.js';
import type { Finding } from '../../finding/schema.js';

/**
 * R5 — multi-tx-orchestrated
 *
 * Applicable when the bug requires a sequence of txs across multiple blocks/slots.
 * Confidence ceiling: 0.92.
 *
 * Applicability: class is governance-flashloan, vesting, multi-step
 *
 * This shell throws "not yet bound" until a VM-specific implementor is registered
 * via ValidationHandlerRegistry at src/validation/registry.ts.
 */
export class MultiTxOrchestratedHandler implements ValidationRungHandler {
  readonly rung = 'multi-tx-orchestrated' as const;
  readonly confidenceCeiling = CONFIDENCE_CEILING['multi-tx-orchestrated'];

  applicableFor(_finding: Finding): boolean {
    // Default: false — VM-specific implementors override with real predicate.
    // R0 is the only always-applicable rung.
    return false;
  }

  async attempt(_finding: Finding, _ctx: ValidationContext): Promise<ValidationResult> {
    throw new Error('R5 multi-tx-orchestrated: no implementor bound for this VM. Bind via ValidationHandlerRegistry.');
  }
}

export const handler: ValidationRungHandler = new MultiTxOrchestratedHandler();
