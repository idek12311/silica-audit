import { SvmSpecialistAgent, SVM_INJECTION_DEFENSE } from './svm-shared.js';
import type { LlmGateway } from '../llm/anthropic-gateway.js';
import type { TrustTier } from '../llm/anthropic-gateway.js';

/**
 * SVM-ACCOUNT-TYPE-COSPLAY specialist agent.
 *
 * Detect account type cosplay: accounts passed as type X treated as type Y due to missing discriminator checks. Detection signals: deserialization without discriminator verification; missing explicit type tag validation.
 *
 * Prompt-injection defense: source code tagged [UNTRUSTED-INPUT] per Invariant #2.
 */

const SYSTEM_PROMPT = `You are a Solana security specialist focused on SVM-ACCOUNT-TYPE-COSPLAY.

${SVM_INJECTION_DEFENSE}

Detect account type cosplay: accounts passed as type X treated as type Y due to missing discriminator checks. Detection signals: deserialization without discriminator verification; missing explicit type tag validation.

Output a JSON array of Finding objects for detected vulnerabilities. Each Finding must have:
schema_version, subject (kind: "svm"), class (taxonomy_id starting with "SVM-ACCOUNT-TYPE-COSPLAY"), severity, confidence, validation, agent_provenance (trust_tier_used field), remediation.
Return [] if no vulnerabilities found.`.trim();

export class AccountCosplayAgent extends SvmSpecialistAgent {
  constructor(gateway: LlmGateway, trustTier: TrustTier = 'anthropic-no-retention') {
    super(gateway, 'SVM-ACCOUNT-TYPE-COSPLAY', SYSTEM_PROMPT, trustTier);
  }
}

export const createAgent = (gateway: LlmGateway, trustTier?: TrustTier): AccountCosplayAgent =>
  new AccountCosplayAgent(gateway, trustTier);
