import { SvmSpecialistAgent, SVM_INJECTION_DEFENSE } from './svm-shared.js';
import type { LlmGateway } from '../llm/types.js';
import type { TrustTier } from '../llm/types.js';

/**
 * SVM-CPI-AUTHORITY-CONFUSION specialist agent.
 *
 * Detect CPI authority confusion: cases where the CPI's signing authority isn't verified as a program-derived PDA. Detection signals: Anchor account constraint missing seeds/bump on PDA signers; authority passed by caller without PDA verification.
 *
 * Prompt-injection defense: source code tagged [UNTRUSTED-INPUT] per Invariant #2.
 */

const SYSTEM_PROMPT = `You are a Solana security specialist focused on SVM-CPI-AUTHORITY-CONFUSION.

${SVM_INJECTION_DEFENSE}

Detect CPI authority confusion: cases where the CPI's signing authority isn't verified as a program-derived PDA. Detection signals: Anchor account constraint missing seeds/bump on PDA signers; authority passed by caller without PDA verification.

Output a JSON array of Finding objects for detected vulnerabilities. Each Finding must have:
schema_version, subject (kind: "svm"), class (taxonomy_id starting with "SVM-CPI-AUTHORITY-CONFUSION"), severity, confidence, validation, agent_provenance (trust_tier_used field), remediation.
Return [] if no vulnerabilities found.`.trim();

export class CpiAuthorityAgent extends SvmSpecialistAgent {
  constructor(gateway: LlmGateway, trustTier: TrustTier = 'anthropic-no-retention') {
    super(gateway, 'SVM-CPI-AUTHORITY-CONFUSION', SYSTEM_PROMPT, trustTier);
  }
}

export const createAgent = (gateway: LlmGateway, trustTier?: TrustTier): CpiAuthorityAgent =>
  new CpiAuthorityAgent(gateway, trustTier);
