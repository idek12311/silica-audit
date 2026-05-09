import { describe, it, expect } from 'vitest';
import { sanitizeForPromotion } from '../../../src/heuristic/sanitization.js';
import type { Heuristic } from '../../../src/heuristic/schema.js';

/**
 * Sanitization integration test (§I acceptance criterion):
 * Private-pool findings cannot promote to Shared or Public without
 * sanitization stripping tenant-identifying applicability constraints,
 * addresses, and magic-constants.
 */

function makePrivateHeuristic(): Heuristic {
  return {
    schema_version: 'silica.heuristic.v0',
    id: 'HEUR-PRIV-001',
    version: 1,
    status: 'active',
    deprecated: false,
    name: 'Private heuristic with tenant-specific data',
    summary: 'Contains 0xAbCdEf1234567890abcdef1234567890abcdef12 and amount 1000000000000000000',
    category: 'access-control',
    vm_scope: ['evm'],
    taxonomy_links: ['DEFI-AC-001'],
    confidence_prior: 0.85,
    severity_default: 'high',
    tenant_visibility: 'private-tenant',
    tenant_id: 'tnt_acme',
    minted_by: {
      founding_findings: ['fnd_acme_001', 'fnd_acme_002'],
      evidence_class: 'audit-finding',
      minted_at: '2026-05-08T00:00:00Z',
      minted_by_agent: 'analyzer@v1',
      minted_by_audit: 'aud_acme_2026_q1',
    },
    implementations: [{ kind: 'slither-detector', ref: 'uri:silica/acme-specific.py', version: '1.0' }],
    regression_cases: ['bench_acme_private_001'],
    false_positive_shapes: [],
    lineage: [{ version: 1, summary: 'Minted from ACME audit' }],
    n_observations: 3,
    applicability: {
      applicable_when: [
        'Contract is 0xAbCdEf1234567890abcdef1234567890abcdef12 (ACME vault)',
        'Amount > 1000000000000000000',
      ],
    },
  };
}

describe('sanitizeForPromotion', () => {
  it('changes visibility from private-tenant to shared-pool', () => {
    const heuristic = makePrivateHeuristic();
    const { sanitized } = sanitizeForPromotion(heuristic, 'shared-pool');
    expect(sanitized.tenant_visibility).toBe('shared-pool');
  });

  it('removes tenant_id', () => {
    const heuristic = makePrivateHeuristic();
    const { sanitized, removedFields } = sanitizeForPromotion(heuristic, 'shared-pool');
    expect(sanitized.tenant_id).toBeNull();
    expect(removedFields).toContain('tenant_id');
  });

  it('clears founding_findings (tenant-identifying audit IDs)', () => {
    const heuristic = makePrivateHeuristic();
    const { sanitized } = sanitizeForPromotion(heuristic, 'shared-pool');
    expect(sanitized.minted_by.founding_findings).toHaveLength(0);
  });

  it('generalizes addresses in applicability constraints', () => {
    const heuristic = makePrivateHeuristic();
    const { sanitized } = sanitizeForPromotion(heuristic, 'shared-pool');
    const constraints = sanitized.applicability?.applicable_when ?? [];
    expect(constraints.some(c => c.includes('0xAbCdEf'))).toBe(false);
    expect(constraints.some(c => c.includes('[CONTRACT_ADDRESS]'))).toBe(true);
  });

  it('generalizes large amounts in applicability constraints', () => {
    const heuristic = makePrivateHeuristic();
    const { sanitized } = sanitizeForPromotion(heuristic, 'shared-pool');
    const constraints = sanitized.applicability?.applicable_when ?? [];
    expect(constraints.some(c => c.includes('1000000000000000000'))).toBe(false);
    expect(constraints.some(c => c.includes('[AMOUNT]'))).toBe(true);
  });

  it('throws when heuristic is not private-tenant', () => {
    const heuristic = makePrivateHeuristic();
    const { sanitized } = sanitizeForPromotion(heuristic, 'shared-pool');
    expect(() => sanitizeForPromotion(sanitized, 'public')).toThrow(/already.*shared-pool/i);
  });
});
