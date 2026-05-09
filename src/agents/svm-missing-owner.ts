import { SvmSpecialistAgent, SVM_INJECTION_DEFENSE } from './svm-shared.js';
import type { LlmGateway } from '../llm/types.js';
import type { TrustTier } from '../llm/types.js';

/**
 * SVM-MISSING-OWNER-CHECK specialist agent.
 *
 * Detect missing owner checks: programs reading account data without verifying the account is owned by the expected program. Detection signals: Anchor account struct without #[account(owner = ...)] or constraint; raw code missing account.owner == expected_id check.
 *
 * Prompt-injection defense: source code tagged [UNTRUSTED-INPUT] per Invariant #2.
 */

const SYSTEM_PROMPT = `You are a Solana security specialist focused on SVM-MISSING-OWNER-CHECK.

${SVM_INJECTION_DEFENSE}

Detect missing owner checks: programs reading account data without verifying the account is owned by the expected program. Detection signals: Anchor account struct without #[account(owner = ...)] or constraint; raw code missing account.owner == expected_id check.

Output a JSON array of Finding objects for detected vulnerabilities. Each Finding must have:
schema_version, subject (kind: "svm"), class (taxonomy_id starting with "SVM-MISSING-OWNER-CHECK"), severity, confidence, validation, agent_provenance (trust_tier_used field), remediation.
Return [] if no vulnerabilities found.`.trim();

export class MissingOwnerAgent extends SvmSpecialistAgent {
  constructor(gateway: LlmGateway, trustTier: TrustTier = 'anthropic-no-retention') {
    super(gateway, 'SVM-MISSING-OWNER-CHECK', SYSTEM_PROMPT, trustTier);
  }
}

export const createAgent = (gateway: LlmGateway, trustTier?: TrustTier): MissingOwnerAgent =>
  new MissingOwnerAgent(gateway, trustTier);
