import { describe, it, expect } from 'vitest';
import { computeCanonicalId, subjectToCanonicalLocator } from '../../../src/finding/canonical.js';
import type { Finding } from '../../../src/finding/schema.js';

describe('computeCanonicalId', () => {
  const baseParams = {
    canonicalSubjectLocator: { vm: 'evm', chain_id: 1, address: '0xabcd', impl_resolution_strategy: 'static' },
    taxonomyId: 'DEFI-REENTRANCY-001',
    canonicalInvariantViolated: { property: 'nonReentrant_violated', function: 'withdraw' },
  };

  it('returns a 64-character hex sha256 digest', () => {
    const id = computeCanonicalId(baseParams);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same inputs', () => {
    const id1 = computeCanonicalId(baseParams);
    const id2 = computeCanonicalId(baseParams);
    expect(id1).toBe(id2);
  });

  it('differs when taxonomyId changes', () => {
    const id1 = computeCanonicalId(baseParams);
    const id2 = computeCanonicalId({ ...baseParams, taxonomyId: 'DEFI-ORACLE-001' });
    expect(id1).not.toBe(id2);
  });

  it('differs when subject locator changes', () => {
    const id1 = computeCanonicalId(baseParams);
    const id2 = computeCanonicalId({
      ...baseParams,
      canonicalSubjectLocator: { ...baseParams.canonicalSubjectLocator, chain_id: 137 },
    });
    expect(id1).not.toBe(id2);
  });

  it('differs when invariant violated changes', () => {
    const id1 = computeCanonicalId(baseParams);
    const id2 = computeCanonicalId({
      ...baseParams,
      canonicalInvariantViolated: { property: 'different_invariant' },
    });
    expect(id1).not.toBe(id2);
  });

  it('is stable across JSON key ordering (RFC 8785)', () => {
    // RFC 8785 ensures key-order-independent serialization
    const id1 = computeCanonicalId({
      ...baseParams,
      canonicalSubjectLocator: { chain_id: 1, vm: 'evm', address: '0xabcd', impl_resolution_strategy: 'static' },
    });
    const id2 = computeCanonicalId({
      ...baseParams,
      canonicalSubjectLocator: { vm: 'evm', chain_id: 1, address: '0xabcd', impl_resolution_strategy: 'static' },
    });
    expect(id1).toBe(id2);
  });
});

describe('subjectToCanonicalLocator', () => {
  const baseEVMFinding: Finding = {
    schema_version: 'silica.finding.v0.1',
    id: '01HW',
    canonical_id: 'cf_abc',
    audit_id: 'aud_1',
    tenant_id: 'tnt_1',
    created_at: '2026-05-08T00:00:00Z',
    updated_at: '2026-05-08T00:00:00Z',
    subject: {
      kind: 'evm',
      primary_locator: {
        vm: 'evm',
        chain_id: 1,
        address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
        time_anchor: { kind: 'block_height', value: 16817993 },
        implementation_resolution: { strategy: 'static' },
      },
    },
    class: { taxonomy_id: 'DEFI-001', label: 'DeFi bug' },
    severity: { level: 'high' },
    confidence: { score: 0.75 },
    validation: {
      highest_passed: 'fork-execution-no-revert',
      highest_applicable: 'fork-execution-state-asserted',
    },
    evidence: [],
    heuristics_cited: [],
    agent_provenance: { discovering_agent: 'analyzer@v1' },
    remediation: { summary: 'Fix.' },
    status: 'candidate',
    lifecycle: [],
  };

  it('normalizes EVM address to lowercase', () => {
    const locator = subjectToCanonicalLocator(baseEVMFinding);
    expect((locator as { address: string }).address).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
  });

  it('includes vm, chain_id, address, impl_resolution_strategy for EVM', () => {
    const locator = subjectToCanonicalLocator(baseEVMFinding);
    expect(locator).toMatchObject({
      vm: 'evm',
      chain_id: 1,
      impl_resolution_strategy: 'static',
    });
  });

  it('includes vm, cluster, program_id, program_version for SVM', () => {
    const svmFinding: Finding = {
      ...baseEVMFinding,
      subject: {
        kind: 'svm',
        primary_locator: {
          vm: 'svm',
          cluster: 'mainnet-beta',
          program_id: 'CASHVDm2wsJXfhj6VWxb7GiMdoLc17Du7paH4bNr5woT',
          time_anchor: { kind: 'slot', value: 123456 },
          program_version: '1.0.0',
        },
      },
    };
    const locator = subjectToCanonicalLocator(svmFinding);
    expect(locator).toMatchObject({
      vm: 'svm',
      cluster: 'mainnet-beta',
      program_id: 'CASHVDm2wsJXfhj6VWxb7GiMdoLc17Du7paH4bNr5woT',
      program_version: '1.0.0',
    });
  });
});
