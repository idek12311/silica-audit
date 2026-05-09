/**
 * Heuristic mining agent.
 *
 * When a confirmed finding has no heuristic citations, the mining agent
 * proposes a new candidate heuristic (Proposed status, not yet Active).
 *
 * Mining policies (design/heuristic-schema.md §Mining policies):
 * - Never propose for one-off compiler bugs
 * - Never propose when confidence < 0.85
 * - Always include the founding finding as a regression case
 * - Never mint from 'disputed' findings
 */
import type { Finding } from '../finding/schema.js';
import type { Heuristic } from './schema.js';

export interface MiningProposal {
  heuristic: Heuristic;
  reason: string;
}

export interface MiningPolicy {
  /** Minimum confidence score to trigger mining */
  minConfidence: number;
  /** Status values from which mining is blocked */
  blockedStatuses: readonly Finding['status'][];
  /** Taxonomy prefixes that are never minted (one-off bug classes) */
  neverMintPrefixes: readonly string[];
}

const DEFAULT_POLICY: MiningPolicy = {
  minConfidence: 0.85,
  blockedStatuses: ['disputed'],
  neverMintPrefixes: ['DEFI-COMPILER-BUG-'],
};

export type MiningResult =
  | { minted: true; proposal: MiningProposal }
  | { minted: false; reason: string };

/**
 * Evaluates whether a finding should trigger heuristic mining,
 * and if so, produces a proposed heuristic.
 */
export function evaluateForMining(
  finding: Finding,
  policy: MiningPolicy = DEFAULT_POLICY,
): MiningResult {
  // Gate: finding must be confirmed
  if (finding.status !== 'confirmed') {
    return { minted: false, reason: `Finding status '${finding.status}' is not 'confirmed'` };
  }

  // Gate: blocked statuses
  if (policy.blockedStatuses.includes(finding.status)) {
    return { minted: false, reason: `Finding status '${finding.status}' is blocked from mining` };
  }

  // Gate: confidence threshold
  if (finding.confidence.score < policy.minConfidence) {
    return {
      minted: false,
      reason: `Confidence ${finding.confidence.score.toFixed(2)} < minimum ${policy.minConfidence}`,
    };
  }

  // Gate: never-mint prefixes
  for (const prefix of policy.neverMintPrefixes) {
    if (finding.class.taxonomy_id.startsWith(prefix)) {
      return {
        minted: false,
        reason: `Taxonomy '${finding.class.taxonomy_id}' matches never-mint prefix '${prefix}'`,
      };
    }
  }

  // Gate: finding already has heuristic citations
  if (finding.heuristics_cited.length > 0) {
    return {
      minted: false,
      reason: 'Finding already has heuristic citations — no new heuristic needed',
    };
  }

  // Propose a new heuristic
  const proposal = buildProposal(finding);
  return { minted: true, proposal };
}

function buildProposal(finding: Finding): MiningProposal {
  const now = new Date().toISOString();
  const heurId = `HEUR-MINED-${Date.now()}`;

  const heuristic: Heuristic = {
    schema_version: 'silica.heuristic.v0',
    id: heurId,
    version: 1,
    status: 'proposed',
    deprecated: false,
    name: `Auto-mined: ${finding.class.label}`,
    summary: `Proposed heuristic from confirmed finding ${finding.id}. Review and generalize before promoting to Active.`,
    category: finding.class.category ?? 'unknown',
    taxonomy_links: [finding.class.taxonomy_id],
    vm_scope: [finding.subject.kind === 'svm' ? 'svm' : finding.subject.kind === 'off-chain' ? 'off-chain' : 'evm'],
    confidence_prior: Math.min(finding.confidence.score, 0.75), // conservative prior
    severity_default: finding.severity.level,
    tenant_visibility: 'private-tenant', // starts private; human promotes to shared/public
    tenant_id: finding.tenant_id,
    minted_by: {
      founding_findings: [finding.id],
      evidence_class: 'real-exploit',
      minted_at: now,
      minted_by_agent: 'heuristic-mining-agent',
      minted_by_audit: finding.audit_id,
    },
    implementations: [],
    regression_cases: [finding.id],
    false_positive_shapes: [],
    lineage: [{ version: 1, summary: `Auto-minted from finding ${finding.id}`, changed_at: now }],
    n_observations: 1,
    last_observation_at: now,
  };

  return {
    heuristic,
    reason: `Minted from confirmed finding with confidence ${finding.confidence.score.toFixed(2)}`,
  };
}
