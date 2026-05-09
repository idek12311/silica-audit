/**
 * Heuristic sanitization — Private → Shared/Public promotion.
 *
 * Per design/heuristic-schema.md §Sanitization:
 * - Strip tenant-identifying applicability constraints
 * - Generalize specific addresses to placeholder selectors
 * - Replace tenant-specific code patterns with abstract pattern descriptors
 * - Remove magic constants tied to tenant economy
 *
 * This module implements the sanitization gate (Invariant #5):
 * Private-pool heuristics never leak into Shared or Public pools
 * without sanitization.
 */
import type { Heuristic, TenantVisibility } from './schema.js';

export type SanitizationTarget = 'shared-pool' | 'public';

export interface SanitizationResult {
  sanitized: Heuristic;
  removedFields: string[];
  warnings: string[];
}

/**
 * Sanitizes a private-tenant heuristic for promotion to shared or public pool.
 *
 * Throws if the heuristic is not private-tenant or if the target is
 * less visible than the current pool.
 */
export function sanitizeForPromotion(
  heuristic: Heuristic,
  target: SanitizationTarget,
): SanitizationResult {
  if (heuristic.tenant_visibility !== 'private-tenant') {
    throw new Error(
      `Cannot sanitize: heuristic ${heuristic.id} is already '${heuristic.tenant_visibility}', not 'private-tenant'`,
    );
  }

  const removedFields: string[] = [];
  const warnings: string[] = [];

  // Remove tenant_id — the most direct leak
  const sanitized: Heuristic = {
    ...heuristic,
    tenant_id: null,
    tenant_visibility: target === 'public' ? 'public' : 'shared-pool',
    // Clear founding findings (may contain tenant-identifying audit IDs)
    minted_by: {
      ...heuristic.minted_by,
      founding_findings: [],
      minted_by_audit: undefined,
    },
  };
  removedFields.push('tenant_id');
  removedFields.push('minted_by.founding_findings');
  removedFields.push('minted_by.minted_by_audit');

  // Sanitize applicability constraints
  if (heuristic.applicability?.applicable_when) {
    const sanitizedConstraints = heuristic.applicability.applicable_when.map(constraint =>
      sanitizeConstraintString(constraint),
    );
    if (sanitizedConstraints.some((c, i) => c !== heuristic.applicability?.applicable_when?.[i])) {
      removedFields.push('applicability.applicable_when (address-generalized)');
    }
    sanitized.applicability = {
      ...heuristic.applicability,
      applicable_when: sanitizedConstraints,
    };
  }

  // Warn if regression_cases contain tenant-specific IDs
  if (heuristic.regression_cases.some(c => c.includes('tnt_') || c.includes('aud_'))) {
    warnings.push('regression_cases may contain tenant-specific IDs — review before publishing');
  }

  return { sanitized, removedFields, warnings };
}

/** Generalizes specific EVM addresses and tenant-economy amounts in constraint strings. */
function sanitizeConstraintString(constraint: string): string {
  // Replace 0x hex addresses (40 hex chars) with [CONTRACT_ADDRESS]
  const withoutAddresses = constraint.replace(/0x[0-9a-fA-F]{40}/g, '[CONTRACT_ADDRESS]');
  // Replace large numeric constants (likely magic amounts) with [AMOUNT]
  const withoutAmounts = withoutAddresses.replace(/\b\d{6,}\b/g, '[AMOUNT]');
  return withoutAmounts;
}
