/**
 * Scope artifact — the authorization primitive for off-chain perimeter audits.
 *
 * Every off-chain perimeter tool run requires a valid, non-expired scope
 * artifact. Tools must call enforce.ts before executing any recon.
 *
 * Per ops/perimeter-playbook.md §Authorization is gating.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Scope artifact schema
// ---------------------------------------------------------------------------

const ScopeTargetSchema = z.object({
  kind: z.enum(['domain', 'ip-range', 'github-org', 'frontend-url', 'registry']),
  value: z.string().min(1),
  /** Whether active probing (not just passive fingerprinting) is authorized */
  permit_active_probe: z.boolean().default(false),
});

const OsintEndpointSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  allow_list: z.boolean().default(false),
});

export const ScopeArtifactSchema = z.object({
  id: z.string().min(1),           // scp_...
  audit_id: z.string().min(1),
  tenant_id: z.string().min(1),
  issued_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }),
  authorized_signer: z.string().min(1),
  targets: z.array(ScopeTargetSchema).min(1),
  permitted_surfaces: z.array(z.enum([
    'frontend', 'rpc-endpoint', 'subdomain', 'ci-pipeline', 'multisig-osint', 'supply-chain',
  ])),
  depth: z.enum(['read-only', 'active-probe', 'validated-exploit']),
  notes: z.string().optional(),
  osint_endpoints: z.array(OsintEndpointSchema).optional(),
});

export type ScopeArtifact = z.infer<typeof ScopeArtifactSchema>;
export type ScopeTarget = z.infer<typeof ScopeTargetSchema>;
