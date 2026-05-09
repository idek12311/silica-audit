/**
 * Scope enforcement gate.
 *
 * All off-chain perimeter tools must call `requireScope()` before executing.
 * Throws ScopeEnforcementError if no valid scope artifact is found or if
 * the requested surface is not permitted.
 *
 * Per ops/perimeter-playbook.md §Authorization is gating:
 * "Off-chain agents refuse to run without an active scope."
 *
 * Per 01-use-case-frame.md Invariant #1 + CLAUDE.md Hard stops:
 * "Off-chain agent runs without scope_artifact_id → stop."
 */
import type { ScopeArtifactStore } from './store.js';
import type { ScopeArtifact } from './artifact.js';

export type PerimeterSurface = ScopeArtifact['permitted_surfaces'][number];

export class ScopeEnforcementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopeEnforcementError';
  }
}

export interface ScopeCheckResult {
  scope: ScopeArtifact;
  surface: PerimeterSurface;
}

/**
 * Requires a valid, non-expired scope artifact for the given surface.
 *
 * Fails-closed: if scopeArtifactId is null/undefined, throws immediately.
 * This is the hard stop from CLAUDE.md and ops/perimeter-playbook.md.
 */
export async function requireScope(
  scopeArtifactId: string | null | undefined,
  surface: PerimeterSurface,
  store: ScopeArtifactStore,
  now: Date = new Date(),
): Promise<ScopeCheckResult> {
  if (!scopeArtifactId) {
    throw new ScopeEnforcementError(
      `Off-chain perimeter tool refused: no scope_artifact_id provided. ` +
      `Surface '${surface}' requires a valid scope artifact.`,
    );
  }

  const scope = await store.findById(scopeArtifactId);
  if (!scope) {
    throw new ScopeEnforcementError(
      `Scope artifact '${scopeArtifactId}' not found. Surface '${surface}' denied.`,
    );
  }

  // Check expiry
  const expiry = new Date(scope.expires_at);
  if (now >= expiry) {
    throw new ScopeEnforcementError(
      `Scope artifact '${scopeArtifactId}' expired at ${scope.expires_at}. Surface '${surface}' denied.`,
    );
  }

  // Check permitted surfaces
  if (!scope.permitted_surfaces.includes(surface)) {
    throw new ScopeEnforcementError(
      `Scope artifact '${scopeArtifactId}' does not permit surface '${surface}'. ` +
      `Permitted: ${scope.permitted_surfaces.join(', ')}.`,
    );
  }

  return { scope, surface };
}
