import { z } from 'zod';
import { SubjectSchema } from './subject.js';
export type { Subject, EvmLocator, SvmLocator, OffChainLocator, AnyLocator, TimeAnchor, ToolchainManifest } from './subject.js';
export { SubjectSchema } from './subject.js';

// Classification, Severity, Confidence
export const ClassificationSchema = z.object({
  taxonomy_id: z.string().min(1),
  swc_id: z.string().optional(),
  label: z.string(),
  category: z.string().optional(),
});

export const SeverityLevelSchema = z.enum(['critical','high','medium','low','informational']);

export const SeveritySchema = z.object({
  level: SeverityLevelSchema,
  rationale: z.string().optional(),
  loss_estimate_usd: z.object({ min: z.number(), max: z.number(), currency: z.string().default('USD') }).optional(),
  loss_basis: z.enum(['TVL-at-risk','actual-loss-if-exploited','griefing-only','informational']).optional(),
  rubric_id: z.string().optional(),
});

export const ConfidenceSchema = z.object({
  score: z.number().min(0).max(1),
  breakdown: z.object({
    static_signal: z.number().min(0).max(1).optional(),
    dynamic_signal: z.number().min(0).max(1).optional(),
    agent_consensus: z.number().min(0).max(1).optional(),
    heuristic_priors: z.number().min(0).max(1).optional(),
  }).optional(),
  method: z.string().optional(),
});

// Validation
export const ValidationRungNameSchema = z.enum([
  'static-signal-only','compile-only','fork-execution-no-revert',
  'fork-execution-state-asserted','fork-execution-with-mocked-actor',
  'multi-tx-orchestrated','multi-fork-coordinated','mempool-replay',
  'time-shifted','invariant-fuzz-counterexample','formal-proof',
  'applicable-but-unprovable',
]);
export type ValidationRungName = z.infer<typeof ValidationRungNameSchema>;

export const ValidationSchema = z.object({
  highest_passed: ValidationRungNameSchema,
  highest_applicable: ValidationRungNameSchema,
  rungs_attempted: z.array(z.object({
    rung: ValidationRungNameSchema,
    result: z.enum(['pass','fail-hard','fail-flaky','skipped']),
    artifact_uri: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  })).default([]),
  block_reason: z.string().nullable().optional(),
  ladder_version: z.string().default('silica.validation.v0'),
});

// Evidence
export const EvidenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('static-analysis'), tool: z.string(), detector_id: z.string().optional(), artifact_uri: z.string().optional(), snippet: z.string().optional() }),
  z.object({ kind: z.literal('execution-proof'), framework: z.string(), test_path: z.string().optional(), fork_anchor: z.object({ chain_id: z.number().int().positive().optional(), block: z.number().int().nonnegative().optional(), slot: z.number().int().nonnegative().optional(), cluster: z.string().optional() }).optional(), exit_code: z.number().int().optional(), gas_used: z.number().int().nonnegative().optional(), artifact_uri: z.string().optional() }),
  z.object({ kind: z.literal('state-assertion'), before: z.record(z.unknown()), after: z.record(z.unknown()), delta: z.record(z.unknown()).optional() }),
  z.object({ kind: z.literal('agent-output'), agent_id: z.string(), model: z.string(), prompt_hash: z.string().optional(), completion_artifact_uri: z.string().optional(), trust_tier_used: z.enum(['anthropic-no-retention','self-hosted-vllm']).optional() }),
  z.object({ kind: z.literal('fuzz-counterexample'), fuzzer: z.string(), invariant: z.string(), shrunken_call_sequence: z.array(z.unknown()).optional(), artifact_uri: z.string().optional() }),
]);
export type Evidence = z.infer<typeof EvidenceSchema>;

// HeuristicCitation, AgentProvenance, Remediation, Lifecycle
export const HeuristicCitationSchema = z.object({ heuristic_id: z.string().min(1), version: z.string(), weight: z.number().min(0).max(1) });
export const AgentProvenanceSchema = z.object({
  discovering_agent: z.string(),
  validating_agents: z.array(z.string()).optional(),
  skeptic_verdict: z.enum(['passed','failed','uncertain']).optional(),
  skeptic_reasoning_uri: z.string().optional(),
  router_decisions: z.array(z.object({ router: z.string(), selected: z.string() })).optional(),
  trust_tier_used: z.enum(['anthropic-no-retention','self-hosted-vllm']).optional(),
});
export const RemediationSchema = z.object({ summary: z.string(), patch_suggestion_uri: z.string().optional(), references: z.array(z.string()).optional(), estimated_effort: z.enum(['trivial','small','moderate','large']).optional() });

const LifecycleEventSchema = z.object({ at: z.string().datetime({ offset: true }), event: z.string(), by: z.string().optional(), rung: ValidationRungNameSchema.optional(), from: z.string().optional(), to: z.string().optional() });
export type LifecycleEvent = z.infer<typeof LifecycleEventSchema>;

// Finding (root)
export const FindingSchema = z.object({
  schema_version: z.enum(['silica.finding.v0','silica.finding.v0.1']),
  id: z.string().min(1),
  canonical_id: z.string().min(1),
  audit_id: z.string().min(1),
  tenant_id: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  subject: SubjectSchema,
  class: ClassificationSchema,
  severity: SeveritySchema,
  confidence: ConfidenceSchema,
  validation: ValidationSchema,
  evidence: z.array(EvidenceSchema).default([]),
  heuristics_cited: z.array(HeuristicCitationSchema).default([]),
  agent_provenance: AgentProvenanceSchema,
  remediation: RemediationSchema,
  composite_of: z.array(z.string()).optional(),
  supersedes: z.string().optional(),
  related_to: z.array(z.string()).optional(),
  scope_artifact_id: z.string().optional(),
  status: z.enum(['candidate','confirmed','disputed','rejected','fixed']),
  lifecycle: z.array(LifecycleEventSchema).default([]),
});
export type Finding = z.infer<typeof FindingSchema>;

// Confidence ceilings (Invariant #3)
export const CONFIDENCE_CEILING: Record<ValidationRungName, number> = {
  'static-signal-only': 0.60, 'compile-only': 0.65, 'fork-execution-no-revert': 0.75,
  'fork-execution-state-asserted': 0.92, 'fork-execution-with-mocked-actor': 0.88,
  'multi-tx-orchestrated': 0.92, 'multi-fork-coordinated': 0.85, 'mempool-replay': 0.80,
  'time-shifted': 0.90, 'invariant-fuzz-counterexample': 0.95, 'formal-proof': 0.99,
  'applicable-but-unprovable': 0.70,
};

export function confidenceCeilingFor(rung: ValidationRungName): number { return CONFIDENCE_CEILING[rung]; }
