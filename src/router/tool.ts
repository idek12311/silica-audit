import type { Finding } from '../finding/schema.js';

/**
 * Tool Router — decides which static-analysis tools to run for a finding hypothesis.
 *
 * notes.md §6: "Slither vs Mythril vs Echidna have different cost/depth tradeoffs"
 * design/cost-model.md §Budget enforcement: prefers cheap-tier tools first.
 */

export type ToolName =
  | 'slither'
  | 'mythril'
  | 'echidna'
  | 'soteria'
  | 'anchor-idl-analyzer'
  | 'trident';

export type ToolCostTier = 'cheap' | 'medium' | 'expensive' | 'very-expensive';

export interface ToolSpec {
  name: ToolName;
  vm: 'evm' | 'svm';
  costTier: ToolCostTier;
  /** Minimum validation rung this tool can confirm */
  minRung: 'static-signal-only' | 'fork-execution-no-revert' | 'fork-execution-state-asserted' | 'invariant-fuzz-counterexample';
}

const TOOL_REGISTRY: Record<ToolName, ToolSpec> = {
  slither:               { name: 'slither',               vm: 'evm', costTier: 'cheap',          minRung: 'static-signal-only' },
  mythril:               { name: 'mythril',               vm: 'evm', costTier: 'medium',         minRung: 'fork-execution-no-revert' },
  echidna:               { name: 'echidna',               vm: 'evm', costTier: 'very-expensive', minRung: 'invariant-fuzz-counterexample' },
  soteria:               { name: 'soteria',               vm: 'svm', costTier: 'cheap',          minRung: 'static-signal-only' },
  'anchor-idl-analyzer': { name: 'anchor-idl-analyzer',  vm: 'svm', costTier: 'cheap',          minRung: 'static-signal-only' },
  trident:               { name: 'trident',               vm: 'svm', costTier: 'very-expensive', minRung: 'invariant-fuzz-counterexample' },
};

export interface ToolRouterDecision {
  selectedTools: ToolName[];
  skippedTools: ToolName[];
  reason: string;
}

export interface ToolRouterOptions {
  /** Maximum cost tier to allow. Default: 'cheap' (first-pass triage). */
  maxCostTier?: ToolCostTier;
  /** If true, run all applicable tools regardless of cost tier. */
  runAll?: boolean;
}

const COST_TIER_ORDER: ToolCostTier[] = ['cheap', 'medium', 'expensive', 'very-expensive'];

function costTierIndex(tier: ToolCostTier): number {
  return COST_TIER_ORDER.indexOf(tier);
}

/**
 * Routes a finding hypothesis to the appropriate tools.
 * Prefers cheap tools first; respects the maxCostTier budget constraint.
 */
export function routeToTools(finding: Finding, opts: ToolRouterOptions = {}): ToolRouterDecision {
  const maxTier = opts.maxCostTier ?? 'cheap';
  const vm = finding.subject.kind === 'svm' ? 'svm' : 'evm';

  const candidates = Object.values(TOOL_REGISTRY).filter(t => t.vm === vm);
  const selected: ToolName[] = [];
  const skipped: ToolName[] = [];

  for (const tool of candidates) {
    if (opts.runAll || costTierIndex(tool.costTier) <= costTierIndex(maxTier)) {
      selected.push(tool.name);
    } else {
      skipped.push(tool.name);
    }
  }

  return {
    selectedTools: selected,
    skippedTools: skipped,
    reason: opts.runAll
      ? 'All tools selected (runAll mode)'
      : `Tools within ${maxTier} cost tier for VM ${vm}`,
  };
}
