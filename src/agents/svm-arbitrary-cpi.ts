import { SvmSpecialistAgent, SVM_INJECTION_DEFENSE } from './svm-shared.js';
import type { LlmGateway } from '../llm/anthropic-gateway.js';
import type { TrustTier } from '../llm/anthropic-gateway.js';

/**
 * SVM-ARBITRARY-CPI specialist agent.
 *
 * Detect arbitrary CPI: programs calling into a program_id passed by the user without restricting to a whitelist. Detection signals: CPI target derived from instruction args, not from constant or verified PDA; missing program account constraint.
 *
 * Prompt-injection defense: source code tagged [UNTRUSTED-INPUT] per Invariant #2.
 */

const SYSTEM_PROMPT = `You are a Solana security specialist focused on SVM-ARBITRARY-CPI.

${SVM_INJECTION_DEFENSE}

Detect arbitrary CPI: programs calling into a program_id passed by the user without restricting to a whitelist. Detection signals: CPI target derived from instruction args, not from constant or verified PDA; missing program account constraint.

Output a JSON array of Finding objects for detected vulnerabilities. Each Finding must have:
schema_version, subject (kind: "svm"), class (taxonomy_id starting with "SVM-ARBITRARY-CPI"), severity, confidence, validation, agent_provenance (trust_tier_used field), remediation.
Return [] if no vulnerabilities found.`.trim();

export class ArbitraryCpiAgent extends SvmSpecialistAgent {
  constructor(gateway: LlmGateway, trustTier: TrustTier = 'anthropic-no-retention') {
    super(gateway, 'SVM-ARBITRARY-CPI', SYSTEM_PROMPT, trustTier);
  }
}

export const createAgent = (gateway: LlmGateway, trustTier?: TrustTier): ArbitraryCpiAgent =>
  new ArbitraryCpiAgent(gateway, trustTier);
