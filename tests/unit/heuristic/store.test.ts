import { describe, it, expect } from 'vitest';
import { InMemoryHeuristicStore } from '../../../src/heuristic/store.js';
import type { Heuristic } from '../../../src/heuristic/schema.js';

function makeHeuristic(id: string, opts: Partial<Heuristic> = {}): Heuristic {
  return {
    schema_version: 'silica.heuristic.v0',
    id,
    version: 1,
    status: 'active',
    deprecated: false,
    name: `Heuristic ${id}`,
    summary: `Summary for ${id}`,
    category: 'access-control',
    vm_scope: ['evm'],
    taxonomy_links: [],
    confidence_prior: 0.8,
    severity_default: 'high',
    tenant_visibility: 'public',
    minted_by: {
      founding_findings: [],
      evidence_class: 'real-exploit',
      minted_at: '2026-05-08T00:00:00Z',
      minted_by_agent: 'test',
    },
    implementations: [],
    regression_cases: [],
    false_positive_shapes: [],
    lineage: [],
    n_observations: 0,
    ...opts,
  };
}

describe('InMemoryHeuristicStore', () => {
  it('creates and retrieves a heuristic', async () => {
    const store = new InMemoryHeuristicStore();
    const h = makeHeuristic('HEUR-001');
    await store.create(h);
    const found = await store.findByIdAndVersion('HEUR-001', 1);
    expect(found?.id).toBe('HEUR-001');
  });

  it('throws on duplicate create', async () => {
    const store = new InMemoryHeuristicStore();
    const h = makeHeuristic('HEUR-DUP');
    await store.create(h);
    await expect(store.create(h)).rejects.toThrow(/already exists/);
  });

  it('queries by vmScope', async () => {
    const store = new InMemoryHeuristicStore();
    await store.create(makeHeuristic('HEUR-EVM', { vm_scope: ['evm'] }));
    await store.create(makeHeuristic('HEUR-SVM', { vm_scope: ['svm'] }));
    const evmOnly = await store.query({ vmScope: 'evm' });
    expect(evmOnly.every(h => h.vm_scope.includes('evm'))).toBe(true);
    expect(evmOnly.some(h => h.id === 'HEUR-EVM')).toBe(true);
  });

  it('queryForTenant returns public + shared + own private heuristics', async () => {
    const store = new InMemoryHeuristicStore();
    await store.create(makeHeuristic('HEUR-PUB', { tenant_visibility: 'public' }));
    await store.create(makeHeuristic('HEUR-SHARED', { tenant_visibility: 'shared-pool' }));
    await store.create(makeHeuristic('HEUR-PRIV-ACME', {
      tenant_visibility: 'private-tenant',
      tenant_id: 'tnt_acme',
    }));
    await store.create(makeHeuristic('HEUR-PRIV-OTHER', {
      id: 'HEUR-PRIV-OTHER',
      tenant_visibility: 'private-tenant',
      tenant_id: 'tnt_other',
    }));

    const acmeView = await store.queryForTenant('tnt_acme');
    const ids = acmeView.map(h => h.id);
    expect(ids).toContain('HEUR-PUB');
    expect(ids).toContain('HEUR-SHARED');
    expect(ids).toContain('HEUR-PRIV-ACME');
    expect(ids).not.toContain('HEUR-PRIV-OTHER'); // other tenant's private
  });

  it('queryForTenant does NOT leak other tenant private heuristics', async () => {
    const store = new InMemoryHeuristicStore();
    await store.create(makeHeuristic('HEUR-PRIV-ACME', {
      tenant_visibility: 'private-tenant',
      tenant_id: 'tnt_acme',
    }));

    const otherView = await store.queryForTenant('tnt_other');
    expect(otherView.map(h => h.id)).not.toContain('HEUR-PRIV-ACME');
  });

  it('returns all versions of a heuristic', async () => {
    const store = new InMemoryHeuristicStore();
    await store.create(makeHeuristic('HEUR-MULTI', { version: 1 }));
    await store.create(makeHeuristic('HEUR-MULTI', { version: 2 }));
    const versions = await store.findAllVersions('HEUR-MULTI');
    expect(versions).toHaveLength(2);
  });
});
