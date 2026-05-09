import { describe, it, expect } from 'vitest';
import { requireScope, ScopeEnforcementError } from '../../../src/scope/enforce.js';
import { InMemoryScopeStore } from '../../../src/scope/store.js';
import type { ScopeArtifact } from '../../../src/scope/artifact.js';

function makeScope(overrides: Partial<ScopeArtifact> = {}): ScopeArtifact {
  return {
    id: 'scp_001',
    audit_id: 'aud_001',
    tenant_id: 'tnt_001',
    issued_at: '2026-05-08T00:00:00Z',
    expires_at: '2027-05-08T00:00:00Z',
    authorized_signer: 'acme-cto@example.com',
    targets: [{ kind: 'domain', value: 'app.example.com', permit_active_probe: false }],
    permitted_surfaces: ['frontend', 'rpc-endpoint'],
    depth: 'read-only',
    ...overrides,
  };
}

describe('requireScope', () => {
  it('throws when scopeArtifactId is null', async () => {
    const store = new InMemoryScopeStore();
    await expect(requireScope(null, 'frontend', store)).rejects.toThrow(ScopeEnforcementError);
  });

  it('throws when scopeArtifactId is undefined', async () => {
    const store = new InMemoryScopeStore();
    await expect(requireScope(undefined, 'frontend', store)).rejects.toThrow(ScopeEnforcementError);
  });

  it('throws when scope artifact not found in store', async () => {
    const store = new InMemoryScopeStore();
    await expect(requireScope('scp_nonexistent', 'frontend', store)).rejects.toThrow(ScopeEnforcementError);
  });

  it('throws when scope is expired', async () => {
    const store = new InMemoryScopeStore();
    const scope = makeScope({ expires_at: '2020-01-01T00:00:00Z' });
    await store.create(scope);
    const futureNow = new Date('2026-01-01T00:00:00Z');
    await expect(requireScope('scp_001', 'frontend', store, futureNow)).rejects.toThrow(/expired/);
  });

  it('throws when surface not in permitted_surfaces', async () => {
    const store = new InMemoryScopeStore();
    await store.create(makeScope({ permitted_surfaces: ['frontend'] }));
    await expect(requireScope('scp_001', 'subdomain', store)).rejects.toThrow(/not permit/);
  });

  it('returns scope and surface when valid', async () => {
    const store = new InMemoryScopeStore();
    const scope = makeScope();
    await store.create(scope);
    const result = await requireScope('scp_001', 'frontend', store, new Date('2026-06-01T00:00:00Z'));
    expect(result.scope.id).toBe('scp_001');
    expect(result.surface).toBe('frontend');
  });

  it('returns scope for permitted rpc-endpoint', async () => {
    const store = new InMemoryScopeStore();
    await store.create(makeScope());
    const result = await requireScope('scp_001', 'rpc-endpoint', store, new Date('2026-06-01T00:00:00Z'));
    expect(result.surface).toBe('rpc-endpoint');
  });
});
