import { describe, it, expect } from 'vitest';
import { checkHeuristicDrift, isDriftBlocking } from '../../../src/heuristic/drift.js';
import type { Heuristic } from '../../../src/heuristic/schema.js';

function makeHeuristic(overrides: Partial<Heuristic> = {}): Heuristic {
  return {
    schema_version: 'silica.heuristic.v0',
    id: 'HEUR-DRIFT-TEST',
    version: 1,
    status: 'active',
    deprecated: false,
    name: 'Test heuristic',
    summary: 'Test',
    category: 'test',
    vm_scope: ['evm'],
    taxonomy_links: [],
    confidence_prior: 0.85,
    severity_default: 'high',
    tenant_visibility: 'public',
    minted_by: {
      founding_findings: ['fnd_001'],
      evidence_class: 'real-exploit',
      minted_at: '2026-05-08T00:00:00Z',
      minted_by_agent: 'test',
    },
    implementations: [],
    regression_cases: ['bench_heur_drift_test'],
    false_positive_shapes: [],
    lineage: [],
    n_observations: 100,
    last_observation_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('checkHeuristicDrift', () => {
  it('returns no flags when all checks pass', () => {
    const h = makeHeuristic();
    const report = checkHeuristicDrift(h, true, { now: new Date(), fpRateGrowthThreshold: 0.05, noObsDaysThreshold: 90 });
    expect(report.flags).toHaveLength(0);
  });

  it('flags regression-case-failing as error', () => {
    const h = makeHeuristic();
    const report = checkHeuristicDrift(h, false, { now: new Date(), fpRateGrowthThreshold: 0.05, noObsDaysThreshold: 90 });
    expect(report.flags.some(f => f.kind === 'regression-case-failing' && f.severity === 'error')).toBe(true);
  });

  it('flags no-regression-case as warning when no cases', () => {
    const h = makeHeuristic({ regression_cases: [] });
    const report = checkHeuristicDrift(h, true, { now: new Date(), fpRateGrowthThreshold: 0.05, noObsDaysThreshold: 90 });
    expect(report.flags.some(f => f.kind === 'no-regression-case')).toBe(true);
  });

  it('flags fp-rate-growth when FP rate > 0.30 and n_observations >= 50', () => {
    const h = makeHeuristic({ fp_rate_observed: 0.35, n_observations: 60 });
    const report = checkHeuristicDrift(h, true, { now: new Date(), fpRateGrowthThreshold: 0.05, noObsDaysThreshold: 90 });
    expect(report.flags.some(f => f.kind === 'fp-rate-growth')).toBe(true);
  });

  it('flags no-recent-observations when last_observation_at > 90 days ago', () => {
    const oldDate = new Date('2020-01-01T00:00:00Z').toISOString();
    const h = makeHeuristic({ last_observation_at: oldDate });
    const report = checkHeuristicDrift(h, true, { now: new Date('2026-05-08T00:00:00Z'), fpRateGrowthThreshold: 0.05, noObsDaysThreshold: 90 });
    expect(report.flags.some(f => f.kind === 'no-recent-observations')).toBe(true);
  });
});

describe('isDriftBlocking', () => {
  it('returns true when any error-severity flag present', () => {
    const report = {
      heuristicId: 'HEUR-TEST',
      version: 1,
      flags: [{ kind: 'regression-case-failing' as const, detail: '', severity: 'error' as const }],
    };
    expect(isDriftBlocking(report)).toBe(true);
  });

  it('returns false when only warning flags', () => {
    const report = {
      heuristicId: 'HEUR-TEST',
      version: 1,
      flags: [{ kind: 'no-regression-case' as const, detail: '', severity: 'warning' as const }],
    };
    expect(isDriftBlocking(report)).toBe(false);
  });
});
