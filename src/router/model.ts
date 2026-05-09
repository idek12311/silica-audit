import type { TrustTier } from '../llm/anthropic-gateway.js';

/**
 * Model Router — selects the LLM model for a given agent role and trust tier.
 *
 * notes.md §6: "Haiku for triage, Sonnet for analysis, Opus for proving, Codex for PoC"
 * design/cost-model.md §Sensitivity: "Opus vs Sonnet = ~5x cost difference"
 */

export type AgentRole =
  | 'analyzer'     // Initial hypothesis generation
  | 'prover'       // PoC generation and validation
  | 'skeptic'      // Adversarial review
  | 'svm-specialist' // SVM bug class specialist
  | 'triage';      // First-pass cheap triage

export interface ModelRouterDecision {
  modelId: string;
  trustTier: TrustTier;
  reason: string;
  estimatedCostPerMTokInput: number;
  estimatedCostPerMTokOutput: number;
}

/** Default model IDs per role and tier */
const ANTHROPIC_MODELS: Record<AgentRole, string> = {
  analyzer: 'claude-sonnet-4-6',
  prover: 'claude-opus-4-7',
  skeptic: 'claude-sonnet-4-6',
  'svm-specialist': 'claude-sonnet-4-6',
  triage: 'claude-haiku-3-5',
};

const VLLM_DEFAULT_MODEL = process.env['VLLM_DEFAULT_MODEL'] ?? 'meta-llama/Llama-4-Scout-17B-16E-Instruct';

const ANTHROPIC_COSTS: Record<string, { input: number; output: number }> = {
  'claude-haiku-3-5':   { input: 0.25,  output: 1.25 },
  'claude-sonnet-4-6':  { input: 3.00,  output: 15.00 },
  'claude-opus-4-7':    { input: 15.00, output: 75.00 },
};

export interface ModelRouterOptions {
  trustTier: TrustTier;
  agentRole: AgentRole;
  /** If set, override the default model for cost-sensitive paths */
  forceModel?: string;
}

export function routeToModel(opts: ModelRouterOptions): ModelRouterDecision {
  if (opts.trustTier === 'self-hosted-vllm') {
    return {
      modelId: opts.forceModel ?? VLLM_DEFAULT_MODEL,
      trustTier: 'self-hosted-vllm',
      reason: `Self-hosted vLLM tier — using ${opts.forceModel ?? VLLM_DEFAULT_MODEL}`,
      estimatedCostPerMTokInput: 0,
      estimatedCostPerMTokOutput: 0,
    };
  }

  const modelId = opts.forceModel ?? ANTHROPIC_MODELS[opts.agentRole];
  const costs = ANTHROPIC_COSTS[modelId] ?? { input: 3.00, output: 15.00 };

  return {
    modelId,
    trustTier: 'anthropic-no-retention',
    reason: `Role '${opts.agentRole}' → ${modelId} (no-retention tier)`,
    estimatedCostPerMTokInput: costs.input,
    estimatedCostPerMTokOutput: costs.output,
  };
}
