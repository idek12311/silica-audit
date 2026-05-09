/**
 * Coverage for the 11 validation-tier handler shells (R0–R10 + R-INFO).
 *
 * Each shell is intentionally a no-op until a per-VM implementor is bound at
 * `src/validation/registry.ts`. These tests pin that contract: `attempt()`
 * throws "not yet bound", `applicableFor()` returns the documented default,
 * and `confidenceCeiling` matches the locked value in `finding/schema.ts`.
 */
import { describe, expect, it } from 'vitest';

import { handler as r0 } from '../../../src/validation/handlers/R0-static-signal-only.js';
import { handler as r1 } from '../../../src/validation/handlers/R1-compile-only.js';
import { handler as r2 } from '../../../src/validation/handlers/R2-fork-execution-no-revert.js';
import { handler as r3 } from '../../../src/validation/handlers/R3-fork-execution-state-asserted.js';
import { handler as r4 } from '../../../src/validation/handlers/R4-fork-execution-with-mocked-actor.js';
import { handler as r5 } from '../../../src/validation/handlers/R5-multi-tx-orchestrated.js';
import { handler as r6 } from '../../../src/validation/handlers/R6-multi-fork-coordinated.js';
import { handler as r7 } from '../../../src/validation/handlers/R7-mempool-replay.js';
import { handler as r8 } from '../../../src/validation/handlers/R8-time-shifted.js';
import { handler as r9 } from '../../../src/validation/handlers/R9-invariant-fuzz-counterexample.js';
import { handler as r10 } from '../../../src/validation/handlers/R10-formal-proof.js';
import { handler as rInfo } from '../../../src/validation/handlers/RINFO-applicable-but-unprovable.js';
import { CONFIDENCE_CEILING } from '../../../src/finding/schema.js';
import type { Finding } from '../../../src/finding/schema.js';
import type { ValidationContext } from '../../../src/validation/tiers.js';

const fakeFinding = {} as Finding;
const fakeContext = {} as ValidationContext;

const allShells = [
  ['R0', r0, 'static-signal-only'],
  ['R1', r1, 'compile-only'],
  ['R2', r2, 'fork-execution-no-revert'],
  ['R3', r3, 'fork-execution-state-asserted'],
  ['R4', r4, 'fork-execution-with-mocked-actor'],
  ['R5', r5, 'multi-tx-orchestrated'],
  ['R6', r6, 'multi-fork-coordinated'],
  ['R7', r7, 'mempool-replay'],
  ['R8', r8, 'time-shifted'],
  ['R9', r9, 'invariant-fuzz-counterexample'],
  ['R10', r10, 'formal-proof'],
  ['R-INFO', rInfo, 'applicable-but-unprovable'],
] as const;

describe('validation handler shells', () => {
  it.each(allShells)('%s — attempt() throws "not yet bound" until VM implementor is registered', async (_label, handler) => {
    await expect(handler.attempt(fakeFinding, fakeContext)).rejects.toThrow(/not yet bound|not implemented|implementor/i);
  });

  it.each(allShells)('%s — confidenceCeiling matches the locked value', (_label, handler, rung) => {
    expect(handler.confidenceCeiling).toBe(CONFIDENCE_CEILING[rung]);
  });

  it.each(allShells)('%s — exposes the right rung identifier', (_label, handler, rung) => {
    expect(handler.rung).toBe(rung);
  });
});
