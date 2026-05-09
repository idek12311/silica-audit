import { describe, it, expect } from 'vitest';
import {
  AuditJobOrchestrator,
  isAllowedAuditTransition,
} from '../../../src/orchestrator/audit-job.js';

describe('AuditJobOrchestrator.createJob', () => {
  it('creates a job in pending state', () => {
    const orch = new AuditJobOrchestrator();
    const job = orch.createJob({
      id: 'aud_001',
      tenantId: 'tnt_001',
      subjectKind: 'evm',
      budgetUsd: 100,
      targetAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
      chainId: 1,
    });

    expect(job.id).toBe('aud_001');
    expect(job.state).toBe('pending');
    expect(job.budgetUsd).toBe(100);
    expect(job.accumulatedCostUsd).toBe(0);
    expect(job.events).toHaveLength(1);
    expect(job.events[0]?.state).toBe('pending');
  });
});

describe('AuditJobOrchestrator.transition', () => {
  const orch = new AuditJobOrchestrator();

  function makeJob(state: 'pending' | 'fetching' | 'compiling') {
    const base = orch.createJob({ id: 'aud_001', tenantId: 'tnt_001', subjectKind: 'evm', budgetUsd: 100 });
    if (state === 'pending') return base;
    const r1 = orch.transition(base, 'fetching');
    if (state === 'fetching') return r1.job!;
    return orch.transition(r1.job!, 'compiling').job!;
  }

  it('transitions pending → fetching', () => {
    const job = makeJob('pending');
    const result = orch.transition(job, 'fetching');
    expect(result.success).toBe(true);
    expect(result.job?.state).toBe('fetching');
  });

  it('rejects invalid transition: pending → completed', () => {
    const job = makeJob('pending');
    const result = orch.transition(job, 'completed');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid state transition/);
  });

  it('appends event on each transition', () => {
    const job = makeJob('pending');
    const result = orch.transition(job, 'fetching');
    expect(result.job?.events).toHaveLength(2); // created + fetching
  });

  it('sets completedAt when transitioning to completed', () => {
    const job = makeJob('pending');
    // Walk through the full happy path
    const steps: Array<'fetching' | 'compiling' | 'static-analyzing' | 'analyzer-pass' | 'prover-pass' | 'skeptic-pass' | 'consolidating' | 'persisting' | 'completed'> = [
      'fetching', 'compiling', 'static-analyzing', 'analyzer-pass',
      'prover-pass', 'skeptic-pass', 'consolidating', 'persisting', 'completed',
    ];
    let current = job;
    for (const step of steps) {
      const r = orch.transition(current, step);
      expect(r.success).toBe(true);
      current = r.job!;
    }
    expect(current.state).toBe('completed');
    expect(current.completedAt).toBeDefined();
  });

  it('allows cancel from fetching state', () => {
    const job = makeJob('pending');
    const fetching = orch.transition(job, 'fetching').job!;
    const cancelled = orch.transition(fetching, 'cancelled');
    expect(cancelled.success).toBe(true);
    expect(cancelled.job?.state).toBe('cancelled');
  });
});

describe('AuditJobOrchestrator.recordCost', () => {
  it('accumulates cost and token counts', () => {
    const orch = new AuditJobOrchestrator();
    const job = orch.createJob({ id: 'aud_001', tenantId: 'tnt_001', subjectKind: 'evm', budgetUsd: 100 });

    const { job: updated, budgetExceeded } = orch.recordCost(job, {
      costUsd: 5.00,
      tokensIn: 10000,
      tokensOut: 500,
      agentId: 'analyzer@v1',
    });

    expect(updated.accumulatedCostUsd).toBe(5.00);
    expect(updated.tokensIn).toBe(10000);
    expect(budgetExceeded).toBe(false);
  });

  it('flags budget exceeded when accumulated > budget', () => {
    const orch = new AuditJobOrchestrator();
    const job = orch.createJob({ id: 'aud_001', tenantId: 'tnt_001', subjectKind: 'evm', budgetUsd: 10 });

    const { budgetExceeded } = orch.recordCost(job, { costUsd: 15, tokensIn: 1000, tokensOut: 100 });
    expect(budgetExceeded).toBe(true);
  });

  it('appends cost event to job ledger', () => {
    const orch = new AuditJobOrchestrator();
    const job = orch.createJob({ id: 'aud_001', tenantId: 'tnt_001', subjectKind: 'evm', budgetUsd: 100 });
    const initialEventCount = job.events.length;

    const { job: updated } = orch.recordCost(job, { costUsd: 1, tokensIn: 100, tokensOut: 50 });
    expect(updated.events.length).toBe(initialEventCount + 1);
  });
});

describe('isAllowedAuditTransition', () => {
  it('pending → fetching is allowed', () => {
    expect(isAllowedAuditTransition('pending', 'fetching')).toBe(true);
  });

  it('completed → any is NOT allowed', () => {
    expect(isAllowedAuditTransition('completed', 'failed')).toBe(false);
    expect(isAllowedAuditTransition('completed', 'cancelled')).toBe(false);
  });

  it('budget-truncated → persisting is allowed (emit partial report)', () => {
    expect(isAllowedAuditTransition('budget-truncated', 'persisting')).toBe(true);
  });
});
