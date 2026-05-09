import { describe, it, expect } from 'vitest';
import { FindingSchema, SubjectSchema, CONFIDENCE_CEILING, confidenceCeilingFor } from '../../../src/finding/schema.js';

describe('FindingSchema — EVM finding validation', () => {
  const validEvmFinding = {
    schema_version: 'silica.finding.v0.1' as const,
    id: '01HWXXXXXXXXXXXXXXXXXXXXX',
    canonical_id: 'cf_abc123',
    audit_id: 'aud_01HWXXX',
    tenant_id: 'tnt_acme',
    created_at: '2026-05-08T00:00:00Z',
    updated_at: '2026-05-08T00:00:00Z',
    subject: {
      kind: 'evm' as const,
      primary_locator: {
        vm: 'evm' as const,
        chain_id: 1,
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        time_anchor: { kind: 'block_height' as const, value: 16817993 },
        implementation_resolution: { strategy: 'static' as const },
      },
    },
    class: { taxonomy_id: 'DEFI-REENTRANCY-001', label: 'Reentrancy' },
    severity: { level: 'high' as const },
    confidence: { score: 0.75 },
    validation: {
      highest_passed: 'fork-execution-no-revert' as const,
      highest_applicable: 'fork-execution-state-asserted' as const,
    },
    heuristics_cited: [],
    evidence: [],
    agent_provenance: { discovering_agent: 'analyzer@v1' },
    remediation: { summary: 'Add reentrancy guard.' },
    status: 'candidate' as const,
    lifecycle: [],
  };

  it('accepts a valid EVM finding', () => {
    const result = FindingSchema.safeParse(validEvmFinding);
    expect(result.success).toBe(true);
  });

  it('rejects a finding with invalid address format', () => {
    const invalid = {
      ...validEvmFinding,
      subject: {
        ...validEvmFinding.subject,
        primary_locator: {
          ...validEvmFinding.subject.primary_locator,
          address: 'not-a-hex-address',
        },
      },
    };
    const result = FindingSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects a finding with confidence score > 1.0', () => {
    const invalid = { ...validEvmFinding, confidence: { score: 1.5 } };
    expect(FindingSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a finding with invalid status', () => {
    const invalid = { ...validEvmFinding, status: 'unknown_status' };
    expect(FindingSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('FindingSchema — SVM finding validation', () => {
  it('accepts a valid SVM finding', () => {
    const finding = {
      schema_version: 'silica.finding.v0' as const,
      id: '01HWYYY',
      canonical_id: 'cf_svm_001',
      audit_id: 'aud_001',
      tenant_id: 'tnt_001',
      created_at: '2026-05-08T00:00:00Z',
      updated_at: '2026-05-08T00:00:00Z',
      subject: {
        kind: 'svm' as const,
        primary_locator: {
          vm: 'svm' as const,
          cluster: 'mainnet-beta' as const,
          program_id: 'worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth',
          time_anchor: { kind: 'slot' as const, value: 119203745 },
          program_version: '1.0.0',
        },
      },
      class: { taxonomy_id: 'SVM-SYSVAR-SPOOFING-001', label: 'Sysvar spoofing' },
      severity: { level: 'critical' as const },
      confidence: { score: 0.9 },
      validation: {
        highest_passed: 'fork-execution-state-asserted' as const,
        highest_applicable: 'multi-fork-coordinated' as const,
      },
      heuristics_cited: [],
      evidence: [],
      agent_provenance: { discovering_agent: 'svm-sysvar-specialist@v1' },
      remediation: { summary: 'Verify sysvar account key before use.' },
      status: 'confirmed' as const,
      lifecycle: [],
    };
    expect(FindingSchema.safeParse(finding).success).toBe(true);
  });
});

describe('FindingSchema — off-chain finding validation (v0.1)', () => {
  it('accepts a valid off-chain finding with scope_artifact_id', () => {
    const finding = {
      schema_version: 'silica.finding.v0.1' as const,
      id: '01HWZZZ',
      canonical_id: 'cf_offchain_001',
      audit_id: 'aud_001',
      tenant_id: 'tnt_001',
      created_at: '2026-05-08T00:00:00Z',
      updated_at: '2026-05-08T00:00:00Z',
      subject: {
        kind: 'off-chain' as const,
        scope_artifact_id: 'scp_badger_2021',
        primary_locator: {
          vm: null as null,
          off_chain_kind: 'frontend' as const,
          url: 'https://app.badger.finance/',
          time_anchor: { kind: 'wall_clock' as const, value: '2021-12-02T00:00:00Z' },
        },
      },
      class: { taxonomy_id: 'OFFCHAIN-FRONTEND-WALLET-CALL-SWAP-001', label: 'Frontend wallet-call swap' },
      severity: { level: 'critical' as const },
      confidence: { score: 0.95 },
      validation: {
        highest_passed: 'fork-execution-state-asserted' as const,
        highest_applicable: 'fork-execution-state-asserted' as const,
      },
      heuristics_cited: [],
      evidence: [],
      agent_provenance: { discovering_agent: 'perimeter-frontend-specialist@v1' },
      remediation: { summary: 'Add CSP with strict-dynamic + nonces.' },
      status: 'confirmed' as const,
      lifecycle: [],
    };
    expect(FindingSchema.safeParse(finding).success).toBe(true);
  });

  it('rejects an off-chain finding missing scope_artifact_id', () => {
    const finding = {
      schema_version: 'silica.finding.v0.1' as const,
      id: '01HWZZZ',
      canonical_id: 'cf_offchain_002',
      audit_id: 'aud_001',
      tenant_id: 'tnt_001',
      created_at: '2026-05-08T00:00:00Z',
      updated_at: '2026-05-08T00:00:00Z',
      subject: {
        kind: 'off-chain' as const,
        // scope_artifact_id intentionally missing
        primary_locator: {
          vm: null,
          off_chain_kind: 'frontend' as const,
          url: 'https://app.badger.finance/',
          time_anchor: { kind: 'wall_clock' as const, value: '2021-12-02T00:00:00Z' },
        },
      },
      class: { taxonomy_id: 'OFFCHAIN-FRONTEND-001', label: 'Frontend bug' },
      severity: { level: 'high' as const },
      confidence: { score: 0.8 },
      validation: {
        highest_passed: 'static-signal-only' as const,
        highest_applicable: 'static-signal-only' as const,
      },
      heuristics_cited: [],
      evidence: [],
      agent_provenance: { discovering_agent: 'analyzer@v1' },
      remediation: { summary: 'Fix.' },
      status: 'candidate' as const,
      lifecycle: [],
    };
    // Off-chain subject requires scope_artifact_id (Zod discriminated union will require it)
    expect(FindingSchema.safeParse(finding).success).toBe(false);
  });
});

describe('Confidence ceiling constants (Invariant #3)', () => {
  it('static-signal-only has ceiling 0.60', () => {
    expect(CONFIDENCE_CEILING['static-signal-only']).toBe(0.60);
  });

  it('fork-execution-state-asserted has ceiling 0.92', () => {
    expect(CONFIDENCE_CEILING['fork-execution-state-asserted']).toBe(0.92);
  });

  it('formal-proof has ceiling 0.99', () => {
    expect(CONFIDENCE_CEILING['formal-proof']).toBe(0.99);
  });

  it('confidenceCeilingFor returns the correct ceiling', () => {
    expect(confidenceCeilingFor('static-signal-only')).toBe(0.60);
    expect(confidenceCeilingFor('applicable-but-unprovable')).toBe(0.70);
  });

  it('all 12 rungs have defined ceilings', () => {
    const rungs = [
      'static-signal-only', 'compile-only', 'fork-execution-no-revert',
      'fork-execution-state-asserted', 'fork-execution-with-mocked-actor',
      'multi-tx-orchestrated', 'multi-fork-coordinated', 'mempool-replay',
      'time-shifted', 'invariant-fuzz-counterexample', 'formal-proof',
      'applicable-but-unprovable',
    ] as const;
    for (const rung of rungs) {
      expect(CONFIDENCE_CEILING[rung]).toBeGreaterThan(0);
      expect(CONFIDENCE_CEILING[rung]).toBeLessThanOrEqual(1);
    }
  });
});

describe('SubjectSchema — discriminated union', () => {
  it('evm subject parses with diamond resolution', () => {
    const sub = {
      kind: 'evm' as const,
      primary_locator: {
        vm: 'evm' as const,
        chain_id: 1,
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        time_anchor: { kind: 'block_height' as const, value: 18800000 },
        implementation_resolution: {
          strategy: 'follow-diamond-loupe' as const,
          facets: [{ selector: '0xabcd1234', implementation: '0xF2abcdef1234567890abcdef1234567890abcdef' }],
        },
      },
    };
    expect(SubjectSchema.safeParse(sub).success).toBe(true);
  });
});
