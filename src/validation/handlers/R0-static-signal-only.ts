import type { ValidationRungHandler, ValidationContext, ValidationResult } from '../tiers.js';
import { CONFIDENCE_CEILING } from '../../finding/schema.js';
import type { Finding } from '../../finding/schema.js';

/**
 * R0 — static-signal-only
 *
 * A deterministic detector (Slither, Mythril, Soteria, Semgrep, custom AST pattern)
 * fires on the source or bytecode.
 *
 * Always applicable. No execution required. Confidence ceiling: 0.60.
 *
 * Implementors are bound per-VM at src/validation/registry.ts.
 * This shell throws "not yet bound" until a VM-specific implementor is registered.
 */
export class StaticSignalOnlyHandler implements ValidationRungHandler {
  readonly rung = 'static-signal-only' as const;
  readonly confidenceCeiling = CONFIDENCE_CEILING['static-signal-only'];

  applicableFor(_finding: Finding): boolean {
    return true; // R0 is always applicable
  }

  async attempt(_finding: Finding, _ctx: ValidationContext): Promise<ValidationResult> {
    throw new Error('R0 static-signal-only: no implementor bound for this VM. Bind via ValidationHandlerRegistry.');
  }
}

export const handler: ValidationRungHandler = new StaticSignalOnlyHandler();
