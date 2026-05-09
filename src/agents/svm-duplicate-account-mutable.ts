import { SvmSpecialistAgent, SVM_INJECTION_DEFENSE } from './svm-shared.js';
import type { LlmGateway } from '../llm/anthropic-gateway.js';
import type { TrustTier } from '../llm/anthropic-gateway.js';

/**
 * SVM-DUPLICATE-ACCOUNT-MUTABLE specialist agent.
 *
 * Detect duplicate account mutable: two accounts in the instruction list are the same account, both marked is_writable, causing conflicting mutations. Detection signals: missing uniqueness validation among writable accounts; alias not rejected.
 *
 * Prompt-injection defense: source code tagged [UNTRUSTED-INPUT] per Invariant #2.
 */

const SYSTEM_PROMPT = `You are a Solana security specialist focused on SVM-DUPLICATE-ACCOUNT-MUTABLE.

${SVM_INJECTION_DEFENSE}

Detect duplicate account mutable: two accounts in the instruction list are the same account, both marked is_writable, causing conflicting mutations. Detection signals: missing uniqueness validation among writable accounts; alias not rejected.

Output a JSON array of Finding objects for detected vulnerabilities. Each Finding must have:
schema_version, subject (kind: "svm"), class (taxonomy_id starting with "SVM-DUPLICATE-ACCOUNT-MUTABLE"), severity, confidence, validation, agent_provenance (trust_tier_used field), remediation.
Return [] if no vulnerabilities found.`.trim();

export class DuplicateAccountMutableAgent extends SvmSpecialistAgent {
  constructor(gateway: LlmGateway, trustTier: TrustTier = 'anthropic-no-retention') {
    super(gateway, 'SVM-DUPLICATE-ACCOUNT-MUTABLE', SYSTEM_PROMPT, trustTier);
  }
}

export const createAgent = (gateway: LlmGateway, trustTier?: TrustTier): DuplicateAccountMutableAgent =>
  new DuplicateAccountMutableAgent(gateway, trustTier);
