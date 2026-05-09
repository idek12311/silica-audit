import { describe, it, expect } from 'vitest';
import { InProcessValidationRegistry } from '../../../src/validation/registry.js';
import type { ValidationRungHandler, ValidationContext, ValidationResult } from '../../../src/validation/tiers.js';
import type { Finding } from '../../../src/finding/schema.js';

function makeStubHandler(rung: ValidationRungHandler['rung'], ceiling: number): ValidationRungHandler {
  return {
    rung,
    confidenceCeiling: ceiling,
    applicableFor: (_f: Finding) => true,
    attempt: async (_f: Finding, _c: ValidationContext): Promise<ValidationResult> => ({
      outcome: 'pass',
      confidence: ceiling,
      durationMs: 10,
    }),
  };
}

describe('InProcessValidationRegistry', () => {
  it('returns null for unregistered handler', () => {
    const reg = new InProcessValidationRegistry();
    expect(reg.handlerFor('static-signal-only', 'evm')).toBeNull();
  });

  it('returns the registered handler', () => {
    const reg = new InProcessValidationRegistry();
    const stub = makeStubHandler('static-signal-only', 0.60);
    reg.register('static-signal-only', 'evm', stub);
    expect(reg.handlerFor('static-signal-only', 'evm')).toBe(stub);
  });

  it('does not return an EVM handler for SVM query', () => {
    const reg = new InProcessValidationRegistry();
    const stub = makeStubHandler('static-signal-only', 0.60);
    reg.register('static-signal-only', 'evm', stub);
    expect(reg.handlerFor('static-signal-only', 'svm')).toBeNull();
  });

  it('handlersForVm returns only handlers for that VM in rung order', () => {
    const reg = new InProcessValidationRegistry();
    const r0 = makeStubHandler('static-signal-only', 0.60);
    const r3 = makeStubHandler('fork-execution-state-asserted', 0.92);
    reg.register('static-signal-only', 'evm', r0);
    reg.register('fork-execution-state-asserted', 'evm', r3);
    reg.register('static-signal-only', 'svm', makeStubHandler('static-signal-only', 0.60));
    const evmHandlers = reg.handlersForVm('evm');
    expect(evmHandlers).toHaveLength(2);
    expect(evmHandlers[0]?.rung).toBe('static-signal-only');
    expect(evmHandlers[1]?.rung).toBe('fork-execution-state-asserted');
  });

  it('overrides an existing registration', () => {
    const reg = new InProcessValidationRegistry();
    const v1 = makeStubHandler('static-signal-only', 0.60);
    const v2 = makeStubHandler('static-signal-only', 0.55); // downgraded ceiling stub
    reg.register('static-signal-only', 'evm', v1);
    reg.register('static-signal-only', 'evm', v2);
    expect(reg.handlerFor('static-signal-only', 'evm')).toBe(v2);
  });
});
