import { describe, it, expect } from 'vitest';
import {
  transitionHeuristicStatus,
  promoteToActive,
  isAllowedHeuristicTransition,
} from '../../../src/heuristic/lifecycle.js';
import type { Heuristic } from '../../../src/heuristic/schema.js';

const baseProposed: Heuristic = {
  schema_version: 'silica.heuristic.v0',
  id: 'HEUR-TEST-001',
  version: 1,
  status: 'proposed',
  deprecated: false,
  name: 'Test heuristic',
  summary: 'Test',
  category: 'test',
  vm_scope: ['evm'],
  taxonomy_links: [],
  confidence_prior: 0.5,
  severity_default: 'medium',
  tenant_visibility: 'public',
  minted_by: {
    founding_findings: [],
    evidence_class: 'synthetic',
    minted_at: '2026-05-08T00:00:00Z',
    minted_by_agent: 'test',
  },
  implementations: [],
  regression_cases: [],
  false_positive_shapes: [],
  lineage: [],
  n_observations: 0,
};

describe('transitionHeuristicStatus', () => {
  it('transitions proposed → active', () => {
    const result = transitionHeuristicStatus(baseProposed, 'active');
    expect(result.success).toBe(true);
    expect(result.heuristic?.status).toBe('active');
  });

  it('transitions proposed → deprecated with reason', () => {
    const result = transitionHeuristicStatus(baseProposed, 'deprecated', 'FP rate too high');
    expect(result.success).toBe(true);
    expect(result.heuristic?.deprecated).toBe(true);
    expect(result.heuristic?.deprecation_reason).toBe('FP rate too high');
  });

  it('rejects deprecated → active transition', () => {
    const deprecated: Heuristic = { ...baseProposed, status: 'deprecated', deprecated: true };
    const result = transitionHeuristicStatus(deprecated, 'active');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not allowed/);
  });

  it('rejects active → proposed transition', () => {
    const active: Heuristic = { ...baseProposed, status: 'active' };
    const result = transitionHeuristicStatus(active, 'proposed');
    expect(result.success).toBe(false);
  });
});

describe('promoteToActive', () => {
  it('fails if no implementations attached', () => {
    const result = promoteToActive({ ...baseProposed, implementations: [] });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/implementations/i);
  });

  it('fails if no regression cases attached', () => {
    const withImpl: Heuristic = {
      ...baseProposed,
      implementations: [{
        kind: 'slither-detector',
        ref: 'uri:test',
        version: '1.0',
      }],
      regression_cases: [],
    };
    const result = promoteToActive(withImpl);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/regression cases/i);
  });

  it('succeeds with both implementation and regression case', () => {
    const ready: Heuristic = {
      ...baseProposed,
      implementations: [{ kind: 'slither-detector', ref: 'uri:test', version: '1.0' }],
      regression_cases: ['bench_test_001'],
    };
    const result = promoteToActive(ready);
    expect(result.success).toBe(true);
    expect(result.heuristic?.status).toBe('active');
  });

  it('fails for non-proposed heuristic', () => {
    const active: Heuristic = {
      ...baseProposed,
      status: 'active',
      implementations: [{ kind: 'slither-detector', ref: 'uri:test', version: '1.0' }],
      regression_cases: ['bench_test_001'],
    };
    const result = promoteToActive(active);
    expect(result.success).toBe(false);
  });
});

describe('isAllowedHeuristicTransition', () => {
  it('proposed → active is allowed', () => {
    expect(isAllowedHeuristicTransition('proposed', 'active')).toBe(true);
  });

  it('deprecated → active is NOT allowed', () => {
    expect(isAllowedHeuristicTransition('deprecated', 'active')).toBe(false);
  });
});
