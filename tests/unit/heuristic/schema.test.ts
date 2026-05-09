import { describe, it, expect } from 'vitest';
import { HeuristicSchema, aggregateHeuristicConfidence } from '../../../src/heuristic/schema.js';

const baseHeuristic = {
  id: 'HEUR-OZ-PROXY-INIT-001',
  version: 1,
  status: 'active' as const,
  deprecated: false,
  name: 'Uninitialized OpenZeppelin proxy implementation',
  summary: 'Implementation contract can be initialized by anyone, allowing control seizure.',
  category: 'proxy-upgradeability',
  vm_scope: ['evm'] as const,
  taxonomy_links: ['DEFI-PROXY-IMPL-UNINITIALIZED-001'],
  confidence_prior: 0.85,
  severity_default: 'high' as const,
  tenant_visibility: 'public' as const,
  minted_by: {
    founding_findings: ['fnd_audius_2022_init'],
    evidence_class: 'real-exploit' as const,
    minted_at: '2024-08-12T00:00:00Z',
    minted_by_agent: 'manual',
  },
};

describe('HeuristicSchema validation', () => {
  it('accepts a valid active heuristic', () => {
    const result = HeuristicSchema.safeParse(baseHeuristic);
    expect(result.success).toBe(true);
  });

  it('rejects a heuristic with invalid vm_scope', () => {
    const invalid = { ...baseHeuristic, vm_scope: ['evm', 'move'] };
    expect(HeuristicSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a heuristic with empty vm_scope', () => {
    const invalid = { ...baseHeuristic, vm_scope: [] };
    expect(HeuristicSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects confidence_prior > 1.0', () => {
    const invalid = { ...baseHeuristic, confidence_prior: 1.5 };
    expect(HeuristicSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects invalid status', () => {
    const invalid = { ...baseHeuristic, status: 'unknown' };
    expect(HeuristicSchema.safeParse(invalid).success).toBe(false);
  });

  it('accepts a private-tenant heuristic with tenant_id', () => {
    const privatH = {
      ...baseHeuristic,
      tenant_visibility: 'private-tenant' as const,
      tenant_id: 'tnt_acme',
    };
    expect(HeuristicSchema.safeParse(privatH).success).toBe(true);
  });

  it('accepts a proposed SVM heuristic', () => {
    const svm = {
      ...baseHeuristic,
      id: 'HEUR-SVM-CPI-AUTH-001',
      status: 'proposed' as const,
      vm_scope: ['svm'],
      confidence_prior: 0.5,
    };
    expect(HeuristicSchema.safeParse(svm).success).toBe(true);
  });

  it('default schema_version is silica.heuristic.v0', () => {
    const result = HeuristicSchema.safeParse(baseHeuristic);
    expect(result.success && result.data.schema_version).toBe('silica.heuristic.v0');
  });
});

describe('aggregateHeuristicConfidence', () => {
  it('returns 0 for empty list', () => {
    expect(aggregateHeuristicConfidence([])).toBe(0);
  });

  it('single heuristic: confidence_prior * weight', () => {
    const result = aggregateHeuristicConfidence([{ confidence_prior: 0.8, weight: 1.0 }]);
    // P = 1 - (1 - 0.8*1.0) = 0.8
    expect(result).toBeCloseTo(0.8);
  });

  it('two independent heuristics compound correctly', () => {
    const result = aggregateHeuristicConfidence([
      { confidence_prior: 0.78, weight: 0.7 },
      { confidence_prior: 0.40, weight: 0.3 },
    ]);
    // P = 1 - (1 - 0.78*0.7) * (1 - 0.40*0.3)
    //   = 1 - (1 - 0.546) * (1 - 0.12)
    //   = 1 - 0.454 * 0.88
    //   = 1 - 0.39952 = 0.60048
    expect(result).toBeCloseTo(0.60048, 3);
  });

  it('result is bounded between 0 and 1', () => {
    const result = aggregateHeuristicConfidence([
      { confidence_prior: 1.0, weight: 1.0 },
      { confidence_prior: 1.0, weight: 1.0 },
    ]);
    expect(result).toBeLessThanOrEqual(1.0);
    expect(result).toBeGreaterThanOrEqual(0.0);
  });
});
