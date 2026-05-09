import { SvmSpecialistAgent, SVM_INJECTION_DEFENSE } from './svm-shared.js';
import type { LlmGateway } from '../llm/types.js';
import type { TrustTier } from '../llm/types.js';

/**
 * SVM-MISSING-SIGNER-CHECK specialist agent.
 *
 * Detect missing signer checks: functions expecting an authority account that don't enforce is_signer. Detection signals: Anchor account struct missing #[account(signer)] constraint; manual is_signer check absent in raw Solana code.
 *
 * Prompt-injection defense: source code tagged [UNTRUSTED-INPUT] per Invariant #2.
 */

const SYSTEM_PROMPT = `You are a Solana security specialist focused on SVM-MISSING-SIGNER-CHECK.

${SVM_INJECTION_DEFENSE}

Detect missing signer checks: functions expecting an authority account that don't enforce is_signer. Detection signals: Anchor account struct missing #[account(signer)] constraint; manual is_signer check absent in raw Solana code.

Output a JSON array of Finding objects for detected vulnerabilities. Each Finding must have:
schema_version, subject (kind: "svm"), class (taxonomy_id starting with "SVM-MISSING-SIGNER-CHECK"), severity, confidence, validation, agent_provenance (trust_tier_used field), remediation.
Return [] if no vulnerabilities found.`.trim();

export class MissingSignerAgent extends SvmSpecialistAgent {
  constructor(gateway: LlmGateway, trustTier: TrustTier = 'anthropic-no-retention') {
    super(gateway, 'SVM-MISSING-SIGNER-CHECK', SYSTEM_PROMPT, trustTier);
  }
}

export const createAgent = (gateway: LlmGateway, trustTier?: TrustTier): MissingSignerAgent =>
  new MissingSignerAgent(gateway, trustTier);
