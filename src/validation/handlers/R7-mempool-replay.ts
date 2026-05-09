import type { ValidationRungHandler, ValidationContext, ValidationResult } from '../tiers.js';
import { CONFIDENCE_CEILING } from '../../finding/schema.js';
import type { Finding } from '../../finding/schema.js';

/**
 * R7 — mempool-replay
 *
 * Applicable when the bug is front-runnable, back-runnable, or sandwich-able.
 * Confidence ceiling: 0.80.
 *
 * Applicability: class involves MEV / mempool ordering
 *
 * This shell throws "not yet bound" until a VM-specific implementor is registered
 * via ValidationHandlerRegistry at src/validation/registry.ts.
 */
export class MempoolReplayHandler implements ValidationRungHandler {
  readonly rung = 'mempool-replay' as const;
  readonly confidenceCeiling = CONFIDENCE_CEILING['mempool-replay'];

  applicableFor(_finding: Finding): boolean {
    // Default: false — VM-specific implementors override with real predicate.
    // R0 is the only always-applicable rung.
    return false;
  }

  async attempt(_finding: Finding, _ctx: ValidationContext): Promise<ValidationResult> {
    throw new Error('R7 mempool-replay: no implementor bound for this VM. Bind via ValidationHandlerRegistry.');
  }
}

export const handler: ValidationRungHandler = new MempoolReplayHandler();
