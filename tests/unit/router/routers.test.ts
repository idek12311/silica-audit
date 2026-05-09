import { describe, it, expect } from 'vitest';
import { routeToTools } from '../../../src/router/tool.js';
import { decideEscalation, estimateRungCost } from '../../../src/router/escalation.js';
import { routeToModel } from '../../../src/router/model.js';
import { routeToAgent } from '../../../src/router/agent.js';
import { routeValidation } from '../../../src/router/validation.js';
import type { Finding } from '../../../src/finding/schema.js';

function makeEvmFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    schema_version: 'silica.finding.v0.1',
    id: '01HW',
    canonical_id: 'cf_001',
    audit_id: 'aud_001',
    tenant_id: 'tnt_001',
    created_at: '2026-05-08T00:00:00Z',
    updated_at: '2026-05-08T00:00:00Z',
    subject: {
      kind: 'evm',
      primary_locator: {
        vm: 'evm',
        chain_id: 1,
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        time_anchor: { kind: 'block_height', value: 16817993 },
        implementation_resolution: { strategy: 'static' },
      },
    },
    class: { taxonomy_id: 'DEFI-REENTRANCY-001', label: 'Reentrancy' },
    severity: { level: 'high' },
    confidence: { score: 0.75 },
    validation: {
      highest_passed: 'static-signal-only',
      highest_applicable: 'fork-execution-state-asserted',
    },
    evidence: [],
    heuristics_cited: [],
    agent_provenance: { discovering_agent: 'analyzer@v1' },
    remediation: { summary: 'Fix reentrancy.' },
    status: 'candidate',
    lifecycle: [],
    ...overrides,
  };
}

function makeSvmFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    ...makeEvmFinding(),
    subject: {
      kind: 'svm',
      primary_locator: {
        vm: 'svm',
        cluster: 'mainnet-beta',
        program_id: 'CASHVDm2wsJXfhj6VWxb7GiMdoLc17Du7paH4bNr5woT',
        time_anchor: { kind: 'slot', value: 123456 },
        program_version: '1.0.0',
      },
    },
    class: { taxonomy_id: 'SVM-SYSVAR-SPOOFING-001', label: 'Sysvar spoofing' },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Router
// ─────────────────────────────────────────────────────────────────────────────

describe('ToolRouter', () => {
  it('selects only cheap tools for EVM finding by default', () => {
    const finding = makeEvmFinding();
    const decision = routeToTools(finding);
    expect(decision.selectedTools).toContain('slither');
    expect(decision.selectedTools).not.toContain('echidna'); // expensive
  });

  it('selects SVM tools for SVM finding', () => {
    const finding = makeSvmFinding();
    const decision = routeToTools(finding);
    expect(decision.selectedTools).toContain('soteria');
    expect(decision.selectedTools).not.toContain('slither'); // EVM tool
  });

  it('runAll mode selects all VM-matching tools', () => {
    const finding = makeEvmFinding();
    const decision = routeToTools(finding, { runAll: true });
    expect(decision.selectedTools).toContain('slither');
    expect(decision.selectedTools).toContain('echidna');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Escalation Router
// ─────────────────────────────────────────────────────────────────────────────

describe('EscalationRouter', () => {
  it('escalates from static-signal-only to compile-only', () => {
    const finding = makeEvmFinding();
    const decision = decideEscalation({
      finding,
      accumulatedCostUsd: 0,
      costCeilingUsd: 100,
    });
    expect(decision.shouldEscalate).toBe(true);
    expect(decision.nextRung).toBe('compile-only');
  });

  it('does not escalate when next rung cost would exceed budget ceiling', () => {
    // fork-execution-state-asserted → next is fork-execution-with-mocked-actor ($2.50)
    // accumulated 98.50 + 2.50 = 101 > 100 ceiling
    const finding = makeEvmFinding({
      validation: {
        highest_passed: 'fork-execution-state-asserted',
        highest_applicable: 'invariant-fuzz-counterexample',
      },
    });
    const decision = decideEscalation({
      finding,
      accumulatedCostUsd: 98.5,
      costCeilingUsd: 100,
    });
    expect(decision.shouldEscalate).toBe(false);
    expect(decision.reason).toMatch(/[Bb]udget/);
  });

  it('returns null nextRung when already at highest applicable', () => {
    const finding = makeEvmFinding({
      validation: {
        highest_passed: 'fork-execution-state-asserted',
        highest_applicable: 'fork-execution-state-asserted',
      },
    });
    const decision = decideEscalation({
      finding,
      accumulatedCostUsd: 0,
      costCeilingUsd: 100,
    });
    expect(decision.shouldEscalate).toBe(false);
    expect(decision.nextRung).toBeNull();
  });

  it('estimateRungCost returns positive cost for all rungs', () => {
    const rungs = [
      'static-signal-only', 'compile-only', 'fork-execution-state-asserted',
      'invariant-fuzz-counterexample',
    ] as const;
    for (const rung of rungs) {
      expect(estimateRungCost(rung)).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Model Router
// ─────────────────────────────────────────────────────────────────────────────

describe('ModelRouter', () => {
  it('routes analyzer role to claude-sonnet-4-6', () => {
    const decision = routeToModel({ trustTier: 'anthropic-no-retention', agentRole: 'analyzer' });
    expect(decision.modelId).toBe('claude-sonnet-4-6');
    expect(decision.trustTier).toBe('anthropic-no-retention');
  });

  it('routes prover role to claude-opus-4-7', () => {
    const decision = routeToModel({ trustTier: 'anthropic-no-retention', agentRole: 'prover' });
    expect(decision.modelId).toBe('claude-opus-4-7');
  });

  it('routes self-hosted-vllm to vLLM model regardless of role', () => {
    const decision = routeToModel({ trustTier: 'self-hosted-vllm', agentRole: 'analyzer' });
    expect(decision.trustTier).toBe('self-hosted-vllm');
    expect(decision.estimatedCostPerMTokInput).toBe(0);
  });

  it('respects forceModel override', () => {
    const decision = routeToModel({
      trustTier: 'anthropic-no-retention',
      agentRole: 'analyzer',
      forceModel: 'claude-haiku-3-5',
    });
    expect(decision.modelId).toBe('claude-haiku-3-5');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Agent Router
// ─────────────────────────────────────────────────────────────────────────────

describe('AgentRouter', () => {
  it('routes SVM sysvar finding to svm-sysvar-spoofing agent', () => {
    const finding = makeSvmFinding({ class: { taxonomy_id: 'SVM-SYSVAR-SPOOFING-001', label: 'Sysvar spoofing' } });
    const decision = routeToAgent(finding);
    expect(decision.primaryAgent).toBe('svm-sysvar-spoofing');
  });

  it('routes EVM finding to general analyzer', () => {
    const finding = makeEvmFinding();
    const decision = routeToAgent(finding);
    expect(decision.primaryAgent).toBe('analyzer');
  });

  it('always includes skeptic as additional agent', () => {
    const finding = makeEvmFinding();
    const decision = routeToAgent(finding);
    expect(decision.additionalAgents).toContain('skeptic');
  });

  it('routes SVM-CPI-AUTHORITY to svm-cpi-authority agent', () => {
    const finding = makeSvmFinding({ class: { taxonomy_id: 'SVM-CPI-AUTHORITY-CONFUSION-001', label: 'CPI authority confusion' } });
    const decision = routeToAgent(finding);
    expect(decision.primaryAgent).toBe('svm-cpi-authority');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation Router
// ─────────────────────────────────────────────────────────────────────────────

describe('ValidationRouter', () => {
  it('returns shouldAttempt=true when current < highest_applicable', () => {
    const finding = makeEvmFinding();
    const decision = routeValidation({ finding });
    expect(decision.shouldAttempt).toBe(true);
    expect(decision.targetRung).toBe('fork-execution-state-asserted');
  });

  it('returns shouldAttempt=false when already at highest applicable', () => {
    const finding = makeEvmFinding({
      validation: {
        highest_passed: 'fork-execution-state-asserted',
        highest_applicable: 'fork-execution-state-asserted',
      },
    });
    const decision = routeValidation({ finding });
    expect(decision.shouldAttempt).toBe(false);
  });

  it('returns shouldAttempt=false when confidence below threshold', () => {
    const finding = makeEvmFinding({ confidence: { score: 0.2 } });
    const decision = routeValidation({ finding, minConfidenceToEscalate: 0.5 });
    expect(decision.shouldAttempt).toBe(false);
    expect(decision.reason).toMatch(/[Cc]onfidence/);
  });

  it('respects maxRung cap', () => {
    const finding = makeEvmFinding({
      validation: {
        highest_passed: 'static-signal-only',
        highest_applicable: 'invariant-fuzz-counterexample',
      },
    });
    const decision = routeValidation({
      finding,
      maxRung: 'fork-execution-state-asserted',
    });
    expect(decision.targetRung).toBe('fork-execution-state-asserted');
  });
});
