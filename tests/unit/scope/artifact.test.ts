/**
 * Coverage for src/scope/artifact.ts — the off-chain perimeter authorization
 * primitive. Every off-chain tool run requires a valid scope artifact (see
 * ops/perimeter-playbook.md §Authorization is gating). These tests pin the
 * shape of the schema, the required fields, and the enum constraints.
 */
import { describe, expect, it } from 'vitest';
import { ScopeArtifactSchema } from '../../../src/scope/artifact.js';

const validArtifact = {
  id: 'scp_001',
  audit_id: 'aud_001',
  tenant_id: 'tnt_001',
  issued_at: '2026-05-09T00:00:00Z',
  expires_at: '2026-05-10T00:00:00Z',
  authorized_signer: 'security@example.com',
  targets: [{ kind: 'domain', value: 'example.com', permit_active_probe: false }],
  permitted_surfaces: ['frontend', 'rpc-endpoint'],
  depth: 'read-only',
};

describe('ScopeArtifactSchema', () => {
  it('accepts a well-formed artifact', () => {
    const result = ScopeArtifactSchema.safeParse(validArtifact);
    expect(result.success).toBe(true);
  });

  it('requires at least one target', () => {
    const result = ScopeArtifactSchema.safeParse({ ...validArtifact, targets: [] });
    expect(result.success).toBe(false);
  });

  it('rejects unknown surfaces', () => {
    const result = ScopeArtifactSchema.safeParse({
      ...validArtifact,
      permitted_surfaces: ['kernel-rootkit'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown depth values', () => {
    const result = ScopeArtifactSchema.safeParse({ ...validArtifact, depth: 'destroy' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown target kinds', () => {
    const result = ScopeArtifactSchema.safeParse({
      ...validArtifact,
      targets: [{ kind: 'satellite', value: 'gps-l1', permit_active_probe: true }],
    });
    expect(result.success).toBe(false);
  });

  it('requires non-empty id, audit_id, tenant_id, authorized_signer', () => {
    for (const field of ['id', 'audit_id', 'tenant_id', 'authorized_signer'] as const) {
      const result = ScopeArtifactSchema.safeParse({ ...validArtifact, [field]: '' });
      expect(result.success).toBe(false);
    }
  });

  it('requires issued_at and expires_at to be ISO 8601 with offset', () => {
    const result = ScopeArtifactSchema.safeParse({
      ...validArtifact,
      issued_at: 'last Tuesday',
    });
    expect(result.success).toBe(false);
  });

  it('osint_endpoints, when present, must be valid URLs', () => {
    const result = ScopeArtifactSchema.safeParse({
      ...validArtifact,
      osint_endpoints: [{ name: 'crtsh', url: 'not-a-url', allow_list: true }],
    });
    expect(result.success).toBe(false);
  });

  it('defaults permit_active_probe to false when omitted on a target', () => {
    const parsed = ScopeArtifactSchema.parse({
      ...validArtifact,
      targets: [{ kind: 'github-org', value: 'example-org' }],
    });
    expect(parsed.targets[0]?.permit_active_probe).toBe(false);
  });
});
