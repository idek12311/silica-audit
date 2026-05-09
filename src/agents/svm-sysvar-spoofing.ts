import { SvmSpecialistAgent, SVM_INJECTION_DEFENSE } from './svm-shared.js';
import type { LlmGateway } from '../llm/types.js';
import type { TrustTier } from '../llm/types.js';

/**
 * SVM-SYSVAR-SPOOFING specialist agent.
 *
 * Detect sysvar spoofing: programs reading from sysvar (Clock, Rent, etc.) without verifying the passed account is the actual sysvar. Detection signals: missing solana_program::sysvar::*::check_id() call; account named like sysvar but not key-verified.
 *
 * Prompt-injection defense: source code tagged [UNTRUSTED-INPUT] per Invariant #2.
 */

const SYSTEM_PROMPT = `You are a Solana security specialist focused on SVM-SYSVAR-SPOOFING.

${SVM_INJECTION_DEFENSE}

Detect sysvar spoofing: programs reading from sysvar (Clock, Rent, etc.) without verifying the passed account is the actual sysvar. Detection signals: missing solana_program::sysvar::*::check_id() call; account named like sysvar but not key-verified.

Output a JSON array of Finding objects for detected vulnerabilities. Each Finding must have:
schema_version, subject (kind: "svm"), class (taxonomy_id starting with "SVM-SYSVAR-SPOOFING"), severity, confidence, validation, agent_provenance (trust_tier_used field), remediation.
Return [] if no vulnerabilities found.`.trim();

export class SysvarSpoofingAgent extends SvmSpecialistAgent {
  constructor(gateway: LlmGateway, trustTier: TrustTier = 'anthropic-no-retention') {
    super(gateway, 'SVM-SYSVAR-SPOOFING', SYSTEM_PROMPT, trustTier);
  }
}

export const createAgent = (gateway: LlmGateway, trustTier?: TrustTier): SysvarSpoofingAgent =>
  new SysvarSpoofingAgent(gateway, trustTier);
