import { z } from 'zod';

// ---------------------------------------------------------------------------
// Tenant visibility (three-pool model, notes.md §17.4)
// ---------------------------------------------------------------------------

export const TenantVisibilitySchema = z.enum([
  'public',          // Public pool: all tenants, open-source baseline
  'shared-pool',     // Shared pool: opt-in tenants (sanitized from Private)
  'private-tenant',  // Private pool: single tenant, never leaves
]);

export type TenantVisibility = z.infer<typeof TenantVisibilitySchema>;

// ---------------------------------------------------------------------------
// Heuristic lifecycle states
// ---------------------------------------------------------------------------

export const HeuristicStatusSchema = z.enum([
  'proposed',    // Candidate; does not fire on production audits
  'active',      // In production; fires and is cited
  'deprecated',  // FP rate exceeded / TP regression failed / superseded
]);

export type HeuristicStatus = z.infer<typeof HeuristicStatusSchema>;

// ---------------------------------------------------------------------------
// Implementation reference (detector, Semgrep rule, LLM rubric, etc.)
// ---------------------------------------------------------------------------

const ImplementationKindSchema = z.enum([
  'slither-detector',
  'semgrep-rule',
  'llm-rubric',
  'anchor-idl-pattern',
  'custom-ast-pattern',
]);

const ImplementationRefSchema = z.object({
  kind: ImplementationKindSchema,
  ref: z.string().min(1),       // URI to the artifact
  version: z.string(),
  model_compatibility: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Applicability constraints
// ---------------------------------------------------------------------------

const ApplicabilitySchema = z.object({
  compiler_versions: z.array(z.string()).optional(),
  frameworks: z.array(z.string()).optional(),
  logical_subjects: z.array(z.string()).optional(),
  applicable_when: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// False-positive shapes
// ---------------------------------------------------------------------------

const FalsePositiveShapeSchema = z.object({
  id: z.string(),
  summary: z.string(),
  discriminator: z.string(),
});

// ---------------------------------------------------------------------------
// Lineage entry
// ---------------------------------------------------------------------------

const LineageEntrySchema = z.object({
  version: z.number().int().positive(),
  summary: z.string(),
  changed_at: z.string().datetime({ offset: true }).optional(),
});

// ---------------------------------------------------------------------------
// Severity modifier
// ---------------------------------------------------------------------------

const SeverityModifierSchema = z.object({
  if: z.string(),
  level: z.enum(['critical', 'high', 'medium', 'low', 'informational']),
});

// ---------------------------------------------------------------------------
// Remediation template (heuristic-level, not per-finding)
// ---------------------------------------------------------------------------

const RemediationTemplateSchema = z.object({
  summary: z.string(),
  patch_template_uri: z.string().optional(),
  references: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Minted-by provenance
// ---------------------------------------------------------------------------

const MintedBySchema = z.object({
  founding_findings: z.array(z.string()).default([]),
  evidence_class: z.enum(['real-exploit', 'audit-finding', 'synthetic', 'manual']),
  minted_at: z.string().datetime({ offset: true }),
  minted_by_agent: z.string(),
  minted_by_audit: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Heuristic (root schema, design/heuristic-schema.md:21-100)
// ---------------------------------------------------------------------------

export const HeuristicSchema = z.object({
  schema_version: z.literal('silica.heuristic.v0').default('silica.heuristic.v0'),
  id: z.string().min(1),          // Stable ID e.g. HEUR-OZ-PROXY-INIT-001
  version: z.number().int().positive(),
  lineage: z.array(LineageEntrySchema).default([]),
  supersedes: z.string().nullable().optional(),
  status: HeuristicStatusSchema,
  deprecated: z.boolean().default(false),
  deprecation_reason: z.string().nullable().optional(),

  name: z.string().min(1),
  summary: z.string().min(1),

  category: z.string().min(1),    // matches bug-taxonomy.md top-level category
  taxonomy_links: z.array(z.string()).default([]),
  swc_mapping: z.string().optional(),

  vm_scope: z.array(z.enum(['evm', 'svm', 'off-chain'])).min(1),

  applicability: ApplicabilitySchema.optional(),
  false_positive_shapes: z.array(FalsePositiveShapeSchema).default([]),
  implementations: z.array(ImplementationRefSchema).default([]),

  minted_by: MintedBySchema,
  regression_cases: z.array(z.string()).default([]),

  confidence_prior: z.number().min(0).max(1),
  fp_rate_observed: z.number().min(0).max(1).optional(),
  tp_rate_observed: z.number().min(0).max(1).optional(),
  n_observations: z.number().int().nonnegative().default(0),
  last_observation_at: z.string().datetime({ offset: true }).nullable().optional(),

  severity_default: z.enum(['critical', 'high', 'medium', 'low', 'informational']),
  severity_modifiers: z.array(SeverityModifierSchema).optional(),

  remediation_template: RemediationTemplateSchema.optional(),

  tenant_visibility: TenantVisibilitySchema,
  tenant_id: z.string().nullable().optional(),  // null = public / shared
});

export type Heuristic = z.infer<typeof HeuristicSchema>;

// ---------------------------------------------------------------------------
// Confidence aggregation formula (Contract D, notes.md §17)
//   P(true | h1, h2, …) = 1 − ∏(1 − h_i.confidence_prior * h_i.weight)
// ---------------------------------------------------------------------------

export interface WeightedHeuristic {
  confidence_prior: number;
  weight: number;
}

/**
 * Aggregates confidence from multiple heuristic citations.
 * Treats heuristics as independent evidence (no correlation discount at this level).
 */
export function aggregateHeuristicConfidence(heuristics: WeightedHeuristic[]): number {
  if (heuristics.length === 0) return 0;
  const product = heuristics.reduce(
    (acc, h) => acc * (1 - h.confidence_prior * h.weight),
    1,
  );
  return 1 - product;
}
