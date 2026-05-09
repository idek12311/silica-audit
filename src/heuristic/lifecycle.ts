import type { Heuristic, HeuristicStatus } from './schema.js';

/** Allowed status transitions for a heuristic */
const ALLOWED_TRANSITIONS: Record<HeuristicStatus, readonly HeuristicStatus[]> = {
  proposed: ['active', 'deprecated'],
  active: ['deprecated'],
  deprecated: [],
} as const;

export interface HeuristicTransitionResult {
  success: boolean;
  heuristic?: Heuristic;
  error?: string;
}

/**
 * Transitions a heuristic's status.
 * Incrementing the version is the caller's responsibility when adding
 * content changes alongside the status change.
 */
export function transitionHeuristicStatus(
  heuristic: Heuristic,
  toStatus: HeuristicStatus,
  reason?: string,
): HeuristicTransitionResult {
  const allowed = ALLOWED_TRANSITIONS[heuristic.status];
  if (!(allowed as readonly string[]).includes(toStatus)) {
    return {
      success: false,
      error: `Heuristic status transition '${heuristic.status}' → '${toStatus}' is not allowed`,
    };
  }

  const isDeprecating = toStatus === 'deprecated';

  return {
    success: true,
    heuristic: {
      ...heuristic,
      status: toStatus,
      deprecated: isDeprecating ? true : heuristic.deprecated,
      deprecation_reason: isDeprecating ? (reason ?? null) : heuristic.deprecation_reason,
    },
  };
}

/**
 * Promotes a Proposed heuristic to Active.
 * Requires that at least one implementation reference and one regression case exist.
 */
export function promoteToActive(heuristic: Heuristic): HeuristicTransitionResult {
  if (heuristic.status !== 'proposed') {
    return { success: false, error: 'Only proposed heuristics can be promoted to active' };
  }
  if (heuristic.implementations.length === 0) {
    return { success: false, error: 'Cannot promote: no implementations attached' };
  }
  if (heuristic.regression_cases.length === 0) {
    return { success: false, error: 'Cannot promote: no regression cases attached' };
  }
  return transitionHeuristicStatus(heuristic, 'active');
}

export function isAllowedHeuristicTransition(from: HeuristicStatus, to: HeuristicStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] as readonly string[]).includes(to);
}
