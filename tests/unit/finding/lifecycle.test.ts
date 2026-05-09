import { describe, it, expect } from 'vitest';
import { transitionFindingStatus, appendLifecycleEvent, isAllowedTransition } from '../../../src/finding/lifecycle.js';
import type { Finding } from '../../../src/finding/schema.js';

const baseFinding: Finding = {
  schema_version: 'silica.finding.v0.1',
  id: '01HW',
  canonical_id: 'cf_abc',
  audit_id: 'aud_1',
  tenant_id: 'tnt_1',
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
  class: { taxonomy_id: 'DEFI-001', label: 'DeFi' },
  severity: { level: 'high' },
  confidence: { score: 0.75 },
  validation: {
    highest_passed: 'fork-execution-no-revert',
    highest_applicable: 'fork-execution-state-asserted',
  },
  evidence: [],
  heuristics_cited: [],
  agent_provenance: { discovering_agent: 'analyzer@v1' },
  remediation: { summary: 'Fix.' },
  status: 'candidate',
  lifecycle: [],
};

describe('transitionFindingStatus', () => {
  it('transitions candidate → confirmed successfully', () => {
    const result = transitionFindingStatus(baseFinding, 'confirmed', 'skeptic@v1');
    expect(result.success).toBe(true);
    expect(result.finding?.status).toBe('confirmed');
  });

  it('appends a lifecycle event on transition', () => {
    const result = transitionFindingStatus(baseFinding, 'confirmed', 'skeptic@v1');
    expect(result.finding?.lifecycle).toHaveLength(1);
    expect(result.finding?.lifecycle[0]?.event).toBe('status_changed');
    expect(result.finding?.lifecycle[0]?.from).toBe('candidate');
    expect(result.finding?.lifecycle[0]?.to).toBe('confirmed');
  });

  it('rejects an invalid transition: confirmed → candidate', () => {
    const confirmed = { ...baseFinding, status: 'confirmed' as const };
    const result = transitionFindingStatus(confirmed, 'candidate', 'agent@v1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not allowed/i);
  });

  it('rejects transition from terminal state: rejected → confirmed', () => {
    const rejected = { ...baseFinding, status: 'rejected' as const };
    const result = transitionFindingStatus(rejected, 'confirmed', 'agent@v1');
    expect(result.success).toBe(false);
  });

  it('rejects transition from terminal state: fixed → any', () => {
    const fixed = { ...baseFinding, status: 'fixed' as const };
    const result = transitionFindingStatus(fixed, 'confirmed', 'agent@v1');
    expect(result.success).toBe(false);
  });

  it('preserves existing lifecycle events', () => {
    const withEvent: Finding = {
      ...baseFinding,
      lifecycle: [{
        at: '2026-05-08T00:00:00Z',
        event: 'discovered',
        by: 'analyzer@v1',
      }],
    };
    const result = transitionFindingStatus(withEvent, 'disputed', 'skeptic@v1');
    expect(result.finding?.lifecycle).toHaveLength(2);
  });
});

describe('appendLifecycleEvent', () => {
  it('appends the event and updates updated_at', () => {
    const event = {
      at: '2026-05-08T01:00:00Z',
      event: 'validated_to_rung',
      rung: 'fork-execution-state-asserted' as const,
    };
    const updated = appendLifecycleEvent(baseFinding, event);
    expect(updated.lifecycle).toHaveLength(1);
    expect(updated.updated_at).toBe('2026-05-08T01:00:00Z');
    expect(updated.status).toBe('candidate'); // status unchanged
  });
});

describe('isAllowedTransition', () => {
  it('candidate → confirmed is allowed', () => {
    expect(isAllowedTransition('candidate', 'confirmed')).toBe(true);
  });

  it('candidate → rejected is allowed', () => {
    expect(isAllowedTransition('candidate', 'rejected')).toBe(true);
  });

  it('rejected → confirmed is NOT allowed', () => {
    expect(isAllowedTransition('rejected', 'confirmed')).toBe(false);
  });

  it('fixed → any is NOT allowed', () => {
    expect(isAllowedTransition('fixed', 'confirmed')).toBe(false);
    expect(isAllowedTransition('fixed', 'disputed')).toBe(false);
  });
});
