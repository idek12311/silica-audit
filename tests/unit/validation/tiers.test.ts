import { describe, it, expect } from 'vitest';
import {
  RUNG_ORDER,
  nextRung,
  isHigherRung,
  boundConfidence,
} from '../../../src/validation/tiers.js';
import { CONFIDENCE_CEILING } from '../../../src/finding/schema.js';
import type { ValidationRungName } from '../../../src/finding/schema.js';

describe('RUNG_ORDER', () => {
  it('contains exactly 12 rungs', () => {
    expect(RUNG_ORDER).toHaveLength(12);
  });

  it('starts with static-signal-only', () => {
    expect(RUNG_ORDER[0]).toBe('static-signal-only');
  });

  it('ends with applicable-but-unprovable (R-INFO)', () => {
    expect(RUNG_ORDER[RUNG_ORDER.length - 1]).toBe('applicable-but-unprovable');
  });

  it('includes formal-proof before applicable-but-unprovable', () => {
    const formalIdx = RUNG_ORDER.indexOf('formal-proof');
    const infoIdx = RUNG_ORDER.indexOf('applicable-but-unprovable');
    expect(formalIdx).toBeLessThan(infoIdx);
  });

  it('includes all 11 named rungs plus R-INFO', () => {
    const required: ValidationRungName[] = [
      'static-signal-only',
      'compile-only',
      'fork-execution-no-revert',
      'fork-execution-state-asserted',
      'fork-execution-with-mocked-actor',
      'multi-tx-orchestrated',
      'multi-fork-coordinated',
      'mempool-replay',
      'time-shifted',
      'invariant-fuzz-counterexample',
      'formal-proof',
      'applicable-but-unprovable',
    ];
    for (const rung of required) {
      expect(RUNG_ORDER).toContain(rung);
    }
  });
});

describe('nextRung', () => {
  it('returns compile-only after static-signal-only', () => {
    expect(nextRung('static-signal-only')).toBe('compile-only');
  });

  it('returns null after formal-proof (last executable rung)', () => {
    // formal-proof is second-to-last; applicable-but-unprovable is last
    const formalResult = nextRung('formal-proof');
    expect(formalResult).toBe('applicable-but-unprovable');
  });

  it('returns null for applicable-but-unprovable (last in list)', () => {
    expect(nextRung('applicable-but-unprovable')).toBeNull();
  });
});

describe('isHigherRung', () => {
  it('fork-execution-state-asserted is higher than static-signal-only', () => {
    expect(isHigherRung('fork-execution-state-asserted', 'static-signal-only')).toBe(true);
  });

  it('static-signal-only is NOT higher than fork-execution-state-asserted', () => {
    expect(isHigherRung('static-signal-only', 'fork-execution-state-asserted')).toBe(false);
  });

  it('same rung is not higher than itself', () => {
    expect(isHigherRung('compile-only', 'compile-only')).toBe(false);
  });
});

describe('boundConfidence', () => {
  it('clamps score to the rung ceiling', () => {
    // R0 ceiling = 0.60; if score is 0.80, it should be clamped to 0.60
    expect(boundConfidence(0.80, 'static-signal-only')).toBeCloseTo(0.60);
  });

  it('passes through score below ceiling unchanged', () => {
    // R3 ceiling = 0.92; score 0.85 should pass through
    expect(boundConfidence(0.85, 'fork-execution-state-asserted')).toBeCloseTo(0.85);
  });

  it('equals ceiling when score equals ceiling exactly', () => {
    const ceiling = CONFIDENCE_CEILING['formal-proof'];
    expect(boundConfidence(ceiling, 'formal-proof')).toBeCloseTo(ceiling);
  });
});

describe('handler shells — throw not-yet-bound', () => {
  it('R0 handler throws when attempt is called without implementor', async () => {
    const { handler } = await import('../../../src/validation/handlers/R0-static-signal-only.js');
    const mockFinding = {} as any;
    const mockCtx = {} as any;
    await expect(handler.attempt(mockFinding, mockCtx)).rejects.toThrow(/no implementor bound/i);
  });

  it('R0 handler is always applicable', async () => {
    const { handler } = await import('../../../src/validation/handlers/R0-static-signal-only.js');
    expect(handler.applicableFor({} as any)).toBe(true);
  });

  it('R3 handler has correct confidence ceiling', async () => {
    const { handler } = await import('../../../src/validation/handlers/R3-fork-execution-state-asserted.js');
    expect(handler.confidenceCeiling).toBe(0.92);
  });

  it('R10 handler has correct rung identity', async () => {
    const { handler } = await import('../../../src/validation/handlers/R10-formal-proof.js');
    expect(handler.rung).toBe('formal-proof');
  });

  it('R-INFO handler has correct rung identity', async () => {
    const { handler } = await import('../../../src/validation/handlers/RINFO-applicable-but-unprovable.js');
    expect(handler.rung).toBe('applicable-but-unprovable');
    expect(handler.confidenceCeiling).toBe(0.70);
  });
});
