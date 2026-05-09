import type { ValidationRungHandler, ValidationContext, ValidationResult } from '../tiers.js';
import { CONFIDENCE_CEILING } from '../../finding/schema.js';
import type { Finding } from '../../finding/schema.js';

/**
 * R1 — compile-only
 *
 * Applicable when PoC generation is meaningful (skipped for informational-only findings).
 * Confidence ceiling: 0.65.
 *
 * Applicability: finding.class.taxonomy_id is not purely informational
 *
 * This shell throws "not yet bound" until a VM-specific implementor is registered
 * via ValidationHandlerRegistry at src/validation/registry.ts.
 */
export class CompileOnlyHandler implements ValidationRungHandler {
  readonly rung = 'compile-only' as const;
  readonly confidenceCeiling = CONFIDENCE_CEILING['compile-only'];

  applicableFor(_finding: Finding): boolean {
    // Default: false — VM-specific implementors override with real predicate.
    // R0 is the only always-applicable rung.
    return false;
  }

  async attempt(_finding: Finding, _ctx: ValidationContext): Promise<ValidationResult> {
    throw new Error('R1 compile-only: no implementor bound for this VM. Bind via ValidationHandlerRegistry.');
  }
}

export const handler: ValidationRungHandler = new CompileOnlyHandler();
