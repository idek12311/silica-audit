import type { Finding } from '../finding/schema.js';

/**
 * Agent Router — selects which specialist agent(s) see a contract surface.
 *
 * notes.md §6: "Vault → economic agent. Bridge → cross-chain agent.
 *               Proxy → upgrade-pattern agent."
 */

export type SpecialistAgentType =
  | 'analyzer'          // General baseline analyzer
  | 'prover'            // PoC generation
  | 'skeptic'           // Adversarial review
  | 'svm-cpi-authority'
  | 'svm-missing-signer'
  | 'svm-account-cosplay'
  | 'svm-sysvar-spoofing'
  | 'svm-arbitrary-cpi'
  | 'svm-missing-owner'
  | 'svm-duplicate-account-mutable';

export interface AgentRouterDecision {
  primaryAgent: SpecialistAgentType;
  additionalAgents: SpecialistAgentType[];
  reason: string;
}

/** Maps taxonomy prefix → specialist agent */
const TAXONOMY_TO_AGENT: Array<{ prefix: string; agent: SpecialistAgentType }> = [
  { prefix: 'SVM-CPI-AUTHORITY',                 agent: 'svm-cpi-authority' },
  { prefix: 'SVM-MISSING-SIGNER',               agent: 'svm-missing-signer' },
  { prefix: 'SVM-ACCOUNT-TYPE-COSPLAY',         agent: 'svm-account-cosplay' },
  { prefix: 'SVM-SYSVAR-SPOOFING',              agent: 'svm-sysvar-spoofing' },
  { prefix: 'SVM-ARBITRARY-CPI',                agent: 'svm-arbitrary-cpi' },
  { prefix: 'SVM-MISSING-OWNER-CHECK',          agent: 'svm-missing-owner' },
  { prefix: 'SVM-DUPLICATE-ACCOUNT-MUTABLE',    agent: 'svm-duplicate-account-mutable' },
];

/**
 * Routes a finding to the appropriate specialist agent.
 * SVM findings are routed to the matching SVM specialist.
 * EVM findings go to the general analyzer by default.
 */
export function routeToAgent(finding: Finding): AgentRouterDecision {
  const taxonomyId = finding.class.taxonomy_id;

  // Check SVM specialists first
  for (const { prefix, agent } of TAXONOMY_TO_AGENT) {
    if (taxonomyId.startsWith(prefix)) {
      return {
        primaryAgent: agent,
        additionalAgents: ['skeptic'],
        reason: `Taxonomy prefix '${prefix}' → specialist agent '${agent}'`,
      };
    }
  }

  // Default to general analyzer for EVM and unknown taxonomies
  return {
    primaryAgent: 'analyzer',
    additionalAgents: ['skeptic'],
    reason: `No specific specialist for taxonomy '${taxonomyId}' — using general analyzer`,
  };
}
