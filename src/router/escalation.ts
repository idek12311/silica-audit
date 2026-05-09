import type { Finding } from '../finding/schema.js';
import { RUNG_ORDER, isHigherRung } from '../validation/tiers.js';
import type { ValidationRungName } from '../finding/schema.js';

/**
 * Escalation Router — cheap-first → expensive-on-fail.
 *
 * notes.md §6: "Slither (sec) → Mythril (min) → Echidna (hours)"
 * design/cost-model.md §Budget enforcement: escalate only when projected cost ≤ ceiling
 */

export interface EscalationDecision {
  nextRung: ValidationRungName | null;
  shouldEscalate: boolean;
  reason: string;
  estimatedCostUsd: number;
}

export interface EscalationContext {
  /** Total cost incurred so far for this audit */
  accumulatedCostUsd: number;
  /** Maximum allowed cost for this audit */
  costCeilingUsd: number;
  /** The finding that needs escalation */
  finding: Finding;
}

/** Estimated cost per rung attempt (from cost-model.md) */
const RUNG_COST_USD: Partial<Record<ValidationRungName, number>> = {
  'static-signal-only': 0.01,
  'compile-only': 0.02,
  'fork-execution-no-revert': 0.50,
  'fork-execution-state-asserted': 2.00,
  'fork-execution-with-mocked-actor': 2.50,
  'multi-tx-orchestrated': 5.00,
  'multi-fork-coordinated': 10.00,
  'mempool-replay': 3.00,
  'time-shifted': 2.00,
  'invariant-fuzz-counterexample': 20.00,
  'formal-proof': 50.00,
  'applicable-but-unprovable': 0.05,
};

export function estimateRungCost(rung: ValidationRungName): number {
  return RUNG_COST_USD[rung] ?? 1.00;
}

/**
 * Decides whether to escalate the finding to the next validation rung.
 * Returns null nextRung if: budget would be exceeded, or no higher rung exists,
 * or the highest applicable rung has already been reached.
 */
export function decideEscalation(ctx: EscalationContext): EscalationDecision {
  const { finding, accumulatedCostUsd, costCeilingUsd } = ctx;
  const currentRung = finding.validation.highest_passed;
  const highestApplicable = finding.validation.highest_applicable;

  // Already at or above highest applicable
  if (!isHigherRung(highestApplicable, currentRung) && currentRung !== highestApplicable) {
    return {
      nextRung: null,
      shouldEscalate: false,
      reason: 'Already at highest applicable rung',
      estimatedCostUsd: 0,
    };
  }

  // Find next rung in order
  const currentIdx = RUNG_ORDER.indexOf(currentRung);
  const nextInOrder = currentIdx >= 0 && currentIdx < RUNG_ORDER.length - 1
    ? RUNG_ORDER[currentIdx + 1] ?? null
    : null;

  if (!nextInOrder) {
    return {
      nextRung: null,
      shouldEscalate: false,
      reason: 'No higher rung available',
      estimatedCostUsd: 0,
    };
  }

  // Check if next rung exceeds highest applicable
  if (isHigherRung(nextInOrder, highestApplicable)) {
    return {
      nextRung: null,
      shouldEscalate: false,
      reason: `Next rung ${nextInOrder} exceeds highest applicable ${highestApplicable}`,
      estimatedCostUsd: 0,
    };
  }

  const estimatedCost = estimateRungCost(nextInOrder);
  const projectedTotal = accumulatedCostUsd + estimatedCost;

  if (projectedTotal > costCeilingUsd) {
    return {
      nextRung: null,
      shouldEscalate: false,
      reason: `Budget would be exceeded: projected $${projectedTotal.toFixed(2)} > ceiling $${costCeilingUsd.toFixed(2)}`,
      estimatedCostUsd: estimatedCost,
    };
  }

  return {
    nextRung: nextInOrder,
    shouldEscalate: true,
    reason: `Escalating from ${currentRung} to ${nextInOrder}`,
    estimatedCostUsd: estimatedCost,
  };
}
