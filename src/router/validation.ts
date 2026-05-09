import type { Finding } from '../finding/schema.js';
import { isHigherRung } from '../validation/tiers.js';
import type { ValidationRungName } from '../finding/schema.js';

/**
 * Validation Router — decides how hard to push falsification.
 *
 * notes.md §6: "Compile-check → fork-replay → invariant fuzz"
 * design/cost-model.md §Budget enforcement: R9 fuzz is the biggest line item.
 */

export interface ValidationRouterDecision {
  targetRung: ValidationRungName;
  shouldAttempt: boolean;
  reason: string;
}

export interface ValidationRouterOptions {
  /** The finding under consideration */
  finding: Finding;
  /** Maximum rung to attempt (budget/policy cap) */
  maxRung?: ValidationRungName;
  /**
   * Minimum confidence score threshold to bother attempting deeper validation.
   * If finding.confidence.score < this, skip escalation.
   */
  minConfidenceToEscalate?: number;
}

/**
 * Decides the target validation rung for a finding.
 *
 * Strategy:
 * - If the finding is already at or above highest_applicable → no attempt needed.
 * - If confidence < threshold → don't escalate (cost not worth it).
 * - If maxRung caps below highest_applicable → attempt up to maxRung.
 * - Otherwise → attempt highest_applicable.
 */
export function routeValidation(opts: ValidationRouterOptions): ValidationRouterDecision {
  const { finding } = opts;
  const highestApplicable = finding.validation.highest_applicable;
  const currentRung = finding.validation.highest_passed;
  const confidenceScore = finding.confidence.score;
  const minConfidence = opts.minConfidenceToEscalate ?? 0.3;

  // Already completed
  if (currentRung === highestApplicable) {
    return {
      targetRung: currentRung,
      shouldAttempt: false,
      reason: `Finding already at highest applicable rung (${currentRung})`,
    };
  }

  // Low confidence — not worth escalating
  if (confidenceScore < minConfidence) {
    return {
      targetRung: currentRung,
      shouldAttempt: false,
      reason: `Confidence ${confidenceScore.toFixed(2)} < threshold ${minConfidence} — skipping escalation`,
    };
  }

  // Apply max rung cap: if maxRung is lower than highestApplicable, cap at maxRung
  const effectiveTarget = opts.maxRung && isHigherRung(highestApplicable, opts.maxRung)
    ? opts.maxRung
    : highestApplicable;

  // If we're already at or above the effective target
  if (!isHigherRung(effectiveTarget, currentRung) && currentRung !== 'static-signal-only') {
    return {
      targetRung: currentRung,
      shouldAttempt: false,
      reason: `Already at or above effective target rung ${effectiveTarget}`,
    };
  }

  return {
    targetRung: effectiveTarget,
    shouldAttempt: true,
    reason: `Attempting to reach ${effectiveTarget} from ${currentRung}`,
  };
}
