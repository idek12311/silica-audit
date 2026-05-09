import type { Finding, LifecycleEvent } from './schema.js';

export type FindingStatus = Finding['status'];

/** Allowed status transitions */
const ALLOWED_TRANSITIONS: Record<FindingStatus, readonly FindingStatus[]> = {
  candidate: ['confirmed', 'disputed', 'rejected'],
  confirmed: ['disputed', 'fixed'],
  disputed: ['confirmed', 'rejected'],
  rejected: [],
  fixed: [],
} as const;

export interface StatusTransitionResult {
  success: boolean;
  finding?: Finding;
  error?: string;
}

/**
 * Transitions a finding's status, appending a lifecycle event.
 * Returns an error result if the transition is not allowed.
 */
export function transitionFindingStatus(
  finding: Finding,
  toStatus: FindingStatus,
  by: string,
): StatusTransitionResult {
  const allowed = ALLOWED_TRANSITIONS[finding.status];
  if (!allowed.includes(toStatus)) {
    return {
      success: false,
      error: `Status transition '${finding.status}' → '${toStatus}' is not allowed`,
    };
  }

  const event: LifecycleEvent = {
    at: new Date().toISOString(),
    event: 'status_changed',
    by,
    from: finding.status,
    to: toStatus,
  };

  return {
    success: true,
    finding: {
      ...finding,
      status: toStatus,
      updated_at: event.at,
      lifecycle: [...finding.lifecycle, event],
    },
  };
}

/**
 * Appends a lifecycle event without changing status.
 * Used for rung-validated, skeptic-passed, remediation-proposed, etc.
 */
export function appendLifecycleEvent(finding: Finding, event: LifecycleEvent): Finding {
  return {
    ...finding,
    updated_at: event.at,
    lifecycle: [...finding.lifecycle, event],
  };
}

/**
 * Returns whether a status transition is structurally valid
 * (does not enforce actor permissions — that is the orchestrator's job).
 */
export function isAllowedTransition(from: FindingStatus, to: FindingStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] as readonly string[]).includes(to);
}
