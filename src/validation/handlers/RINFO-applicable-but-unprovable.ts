import type { ValidationRungHandler, ValidationContext, ValidationResult } from '../tiers.js';
import { CONFIDENCE_CEILING } from '../../finding/schema.js';
import type { Finding } from '../../finding/schema.js';

/**
 * RINFO — applicable-but-unprovable
 *
 * Applies to informational findings where no execution can prove the finding.
 * Confidence ceiling: 0.70.
 *
 * Applicability: finding.class is informational by nature
 *
 * This shell throws "not yet bound" until a VM-specific implementor is registered
 * via ValidationHandlerRegistry at src/validation/registry.ts.
 */
export class ApplicableButUnprovableHandler implements ValidationRungHandler {
  readonly rung = 'applicable-but-unprovable' as const;
  readonly confidenceCeiling = CONFIDENCE_CEILING['applicable-but-unprovable'];

  applicableFor(_finding: Finding): boolean {
    // Default: false — VM-specific implementors override with real predicate.
    // R0 is the only always-applicable rung.
    return false;
  }

  async attempt(_finding: Finding, _ctx: ValidationContext): Promise<ValidationResult> {
    throw new Error('RINFO applicable-but-unprovable: no implementor bound for this VM. Bind via ValidationHandlerRegistry.');
  }
}

export const handler: ValidationRungHandler = new ApplicableButUnprovableHandler();
