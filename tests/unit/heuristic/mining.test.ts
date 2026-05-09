import { describe, it, expect } from 'vitest';
import { evaluateForMining } from '../../../src/heuristic/mining.js';
import type { Finding } from '../../../src/finding/schema.js';

function makeConfirmedFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    schema_version: 'silica.finding.v0.1',
    id: '01HWMINE',
    canonical_id: 'cf_mine_001',
    audit_id: 'aud_001',
    tenant_id: 'tnt_001',
    created_at: '2026-05-08T00:00:00Z',
    updated_at: '2026-05-08T00:00:00Z',
    subject: {
      kind: 'evm',
      primary_locator: {
        vm: 'evm', chain_id: 1,
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        time_anchor: { kind: 'block_height', value: 16817993 },
        implementation_resolution: { strategy: 'static' },
      },
    },
    class: { taxonomy_id: 'DEFI-REENTRANCY-001', label: 'Reentrancy' },
    severity: { level: 'high' },
    confidence: { score: 0.92 },
    validation: { highest_passed: 'fork-execution-state-asserted', highest_applicable: 'fork-execution-state-asserted' },
    evidence: [],
    heuristics_cited: [],
    agent_provenance: { discovering_agent: 'analyzer@v1' },
    remediation: { summary: 'Fix.' },
    status: 'confirmed',
    lifecycle: [],
    ...overrides,
  };
}

describe('evaluateForMining', () => {
  it('mints a heuristic for a confirmed high-confidence finding with no citations', () => {
    const finding = makeConfirmedFinding();
    const result = evaluateForMining(finding);
    expect(result.minted).toBe(true);
    if (result.minted) {
      expect(result.proposal.heuristic.status).toBe('proposed');
      expect(result.proposal.heuristic.tenant_visibility).toBe('private-tenant');
      expect(result.proposal.heuristic.minted_by.founding_findings).toContain(finding.id);
    }
  });

  it('does not mint for non-confirmed finding', () => {
    const finding = makeConfirmedFinding({ status: 'candidate' });
    const result = evaluateForMining(finding);
    expect(result.minted).toBe(false);
    expect((result as { minted: false; reason: string }).reason).toMatch(/not.*confirmed/i);
  });

  it('does not mint for disputed finding', () => {
    const finding = makeConfirmedFinding({ status: 'disputed' });
    const result = evaluateForMining(finding);
    expect(result.minted).toBe(false);
  });

  it('does not mint when confidence < 0.85', () => {
    const finding = makeConfirmedFinding({ confidence: { score: 0.80 } });
    const result = evaluateForMining(finding);
    expect(result.minted).toBe(false);
    expect((result as { minted: false; reason: string }).reason).toMatch(/confidence/i);
  });

  it('does not mint for compiler bug taxonomy', () => {
    const finding = makeConfirmedFinding({
      class: { taxonomy_id: 'DEFI-COMPILER-BUG-REENTRANCY-001', label: 'Compiler bug' },
    });
    const result = evaluateForMining(finding);
    expect(result.minted).toBe(false);
    expect((result as { minted: false; reason: string }).reason).toMatch(/never-mint/i);
  });

  it('does not mint when finding already has heuristic citations', () => {
    const finding = makeConfirmedFinding({
      heuristics_cited: [{ heuristic_id: 'HEUR-RE-01', version: 'v1', weight: 0.9 }],
    });
    const result = evaluateForMining(finding);
    expect(result.minted).toBe(false);
    expect((result as { minted: false; reason: string }).reason).toMatch(/already has/i);
  });
});
