import { afterEach, describe, expect, it } from 'vitest';
import {
  bytecodeEquivalenceTrigger,
  evaluateTriggers,
  externalCallGraphTrigger,
  registerTrigger,
  resetTriggerRegistry,
  storageLayoutTrigger,
  type SubjectSnapshot,
} from '../../../src/orchestrator/monitoring-triggers.js';

const baseSnapshot: SubjectSnapshot = {
  vm: 'evm',
  address: '0xabcdef1234567890abcdef1234567890abcdef12',
  chainOrCluster: 1,
  bytecodeHash: '0xdeadbeef',
  storageLayoutHash: '0xc0ffee01',
  externalCallGraphHash: '0xfeedface',
  resolvedAt: '2026-05-09T00:00:00Z',
};

describe('monitoring triggers — registry default state', () => {
  afterEach(() => resetTriggerRegistry());

  it('returns shouldRerun=false when no triggers registered (v1 default)', () => {
    resetTriggerRegistry();
    const result = evaluateTriggers({ prior: baseSnapshot, current: baseSnapshot });
    expect(result.shouldRerun).toBe(false);
    expect(result.triggers).toEqual([]);
    expect(result.reason).toBe('no triggers fired');
  });

  it('OR-combines triggered gates', () => {
    registerTrigger(bytecodeEquivalenceTrigger);
    registerTrigger(storageLayoutTrigger);

    const result = evaluateTriggers({
      prior: baseSnapshot,
      current: { ...baseSnapshot, bytecodeHash: '0xnewhash', storageLayoutHash: '0xnewslots' },
    });

    expect(result.shouldRerun).toBe(true);
    expect(result.triggers).toEqual(
      expect.arrayContaining(['bytecode-equivalence-fails', 'storage-layout-changed']),
    );
  });
});

describe('bytecodeEquivalenceTrigger', () => {
  it('fires when hashes differ', () => {
    const result = bytecodeEquivalenceTrigger.evaluate({
      prior: baseSnapshot,
      current: { ...baseSnapshot, bytecodeHash: '0xother' },
    });
    expect(result.shouldRerun).toBe(true);
    expect(result.triggers).toEqual(['bytecode-equivalence-fails']);
  });

  it('does not fire when hashes match', () => {
    const result = bytecodeEquivalenceTrigger.evaluate({ prior: baseSnapshot, current: baseSnapshot });
    expect(result.shouldRerun).toBe(false);
  });
});

describe('storageLayoutTrigger', () => {
  it('fires when storage hashes differ', () => {
    const result = storageLayoutTrigger.evaluate({
      prior: baseSnapshot,
      current: { ...baseSnapshot, storageLayoutHash: '0xnew' },
    });
    expect(result.shouldRerun).toBe(true);
  });

  it('does not fire when storage hash absent on either side (cannot diff)', () => {
    const without: SubjectSnapshot = { ...baseSnapshot, storageLayoutHash: undefined };
    const result = storageLayoutTrigger.evaluate({ prior: without, current: without });
    expect(result.shouldRerun).toBe(false);
  });
});

describe('externalCallGraphTrigger', () => {
  it('fires when call-graph hash diverges', () => {
    const result = externalCallGraphTrigger.evaluate({
      prior: baseSnapshot,
      current: { ...baseSnapshot, externalCallGraphHash: '0xnew' },
    });
    expect(result.shouldRerun).toBe(true);
  });
});
