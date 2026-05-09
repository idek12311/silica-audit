import type { ValidationRungHandler, ValidationContext, ValidationResult } from '../tiers.js';
import { CONFIDENCE_CEILING } from '../../finding/schema.js';
import type { Finding } from '../../finding/schema.js';

/**
 * R4 — fork-execution-with-mocked-actor
 *
 * Applicable when the bug requires a hostile external actor (compromised admin, governance proposer, oracle operator).
 * Confidence ceiling: 0.88.
 *
 * Applicability: finding.class implies actor_assumptions
 *
 * This shell throws "not yet bound" until a VM-specific implementor is registered
 * via ValidationHandlerRegistry at src/validation/registry.ts.
 */
export class ForkExecutionWithMockedActorHandler implements ValidationRungHandler {
  readonly rung = 'fork-execution-with-mocked-actor' as const;
  readonly confidenceCeiling = CONFIDENCE_CEILING['fork-execution-with-mocked-actor'];

  applicableFor(_finding: Finding): boolean {
    // Default: false — VM-specific implementors override with real predicate.
    // R0 is the only always-applicable rung.
    return false;
  }

  async attempt(_finding: Finding, _ctx: ValidationContext): Promise<ValidationResult> {
    throw new Error('R4 fork-execution-with-mocked-actor: no implementor bound for this VM. Bind via ValidationHandlerRegistry.');
  }
}

export const handler: ValidationRungHandler = new ForkExecutionWithMockedActorHandler();
