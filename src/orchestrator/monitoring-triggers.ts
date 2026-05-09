/**
 * v2 continuous-monitoring trigger primitives — port + no-op default impl.
 *
 * notes.md §17.6 locks the triple-gate trigger policy: re-audit fires when
 * any of (bytecode-equivalence-fails | storage-layout-changed |
 * external-call-graph-changed) holds against a prior audit baseline.
 *
 * v1 ships with the policy defaulted OFF and the registry returning
 * `{ should_rerun: false }` for every input — this file establishes the
 * abstraction so v2 implementers wire real bytecode-diff / storage-layout /
 * call-graph adapters behind the same interface.
 *
 * Per CLAUDE.md "Abstractions owned by policy": this port is owned by the
 * orchestrator. Adapters that perform the actual diffing live in v2 under
 * `src/orchestrator/triggers/<name>.ts` and register themselves via
 * `registerTrigger(...)`.
 */

export type TriggerKind =
  | 'bytecode-equivalence-fails'
  | 'storage-layout-changed'
  | 'external-call-graph-changed';

/**
 * Subject snapshot — the resolved on-chain artifacts the trigger compares
 * across audits. Subject locators come from notes.md §17.7
 * (`canonical_subject_locator`).
 */
export interface SubjectSnapshot {
  vm: 'evm' | 'svm';
  /** EVM contract address or SVM program_id. */
  address: string;
  chainOrCluster: number | string;
  /** Compiled bytecode (or BPF binary) hash, hex-encoded. */
  bytecodeHash: string;
  /** Storage-layout fingerprint — slot-to-name mapping hash for EVM, account-discriminator hash for SVM. */
  storageLayoutHash?: string;
  /** External-call-graph fingerprint — sorted set of (selector, callee) tuples hashed. */
  externalCallGraphHash?: string;
  /** ISO-8601 timestamp of the resolution. */
  resolvedAt: string;
}

export interface TriggerEvaluationInput {
  prior: SubjectSnapshot;
  current: SubjectSnapshot;
}

export interface TriggerEvaluationResult {
  shouldRerun: boolean;
  /** Which gate(s) fired. Empty when shouldRerun is false. */
  triggers: TriggerKind[];
  /** Human-readable rationale (for audit-job event log). */
  reason: string;
}

export interface MonitoringTrigger {
  kind: TriggerKind;
  evaluate(input: TriggerEvaluationInput): TriggerEvaluationResult;
}

/** Stable order for the three locked v2 triggers per notes.md §17.6. */
const TRIGGER_ORDER: readonly TriggerKind[] = [
  'bytecode-equivalence-fails',
  'storage-layout-changed',
  'external-call-graph-changed',
];

class TriggerRegistry {
  private readonly triggers = new Map<TriggerKind, MonitoringTrigger>();

  register(trigger: MonitoringTrigger): void {
    this.triggers.set(trigger.kind, trigger);
  }

  get(kind: TriggerKind): MonitoringTrigger | undefined {
    return this.triggers.get(kind);
  }

  /** Remove all registered triggers. Test-only by convention. */
  clear(): void {
    this.triggers.clear();
  }

  /**
   * Evaluate every registered trigger against the input. Returns a single
   * combined result — `shouldRerun` is the OR across triggers, `triggers`
   * the union of those that fired in the canonical order from
   * notes.md §17.6 (bytecode → storage → call-graph).
   */
  evaluateAll(input: TriggerEvaluationInput): TriggerEvaluationResult {
    const fired = new Set<TriggerKind>();
    const reasons: string[] = [];
    for (const trigger of this.triggers.values()) {
      const result = trigger.evaluate(input);
      if (result.shouldRerun) {
        for (const t of result.triggers) fired.add(t);
        reasons.push(result.reason);
      }
    }
    if (fired.size === 0) {
      return { shouldRerun: false, triggers: [], reason: 'no triggers fired' };
    }
    const ordered = TRIGGER_ORDER.filter(k => fired.has(k));
    return { shouldRerun: true, triggers: ordered, reason: reasons.join('; ') };
  }
}

const defaultRegistry = new TriggerRegistry();

export function registerTrigger(trigger: MonitoringTrigger): void {
  defaultRegistry.register(trigger);
}

export function evaluateTriggers(input: TriggerEvaluationInput): TriggerEvaluationResult {
  return defaultRegistry.evaluateAll(input);
}

/**
 * Reset the registry — for tests and for tenants that want to reconfigure
 * which triggers are active. v1 callers do not need this.
 */
export function resetTriggerRegistry(): void {
  defaultRegistry.clear();
}

// ---------------------------------------------------------------------------
// Built-in primitives — pure-data comparators that v1 ships with default OFF.
// v2 wires them up; v1 leaves the registry empty so evaluateTriggers always
// returns shouldRerun=false unless a tenant explicitly registers them.
// ---------------------------------------------------------------------------

export const bytecodeEquivalenceTrigger: MonitoringTrigger = {
  kind: 'bytecode-equivalence-fails',
  evaluate({ prior, current }) {
    if (prior.bytecodeHash && prior.bytecodeHash !== current.bytecodeHash) {
      return {
        shouldRerun: true,
        triggers: ['bytecode-equivalence-fails'],
        reason: `bytecode hash diverged (${prior.bytecodeHash.slice(0, 10)} → ${current.bytecodeHash.slice(0, 10)})`,
      };
    }
    return { shouldRerun: false, triggers: [], reason: 'bytecode equivalent' };
  },
};

export const storageLayoutTrigger: MonitoringTrigger = {
  kind: 'storage-layout-changed',
  evaluate({ prior, current }) {
    if (prior.storageLayoutHash && current.storageLayoutHash && prior.storageLayoutHash !== current.storageLayoutHash) {
      return {
        shouldRerun: true,
        triggers: ['storage-layout-changed'],
        reason: 'storage layout hash changed',
      };
    }
    return { shouldRerun: false, triggers: [], reason: 'storage layout stable' };
  },
};

export const externalCallGraphTrigger: MonitoringTrigger = {
  kind: 'external-call-graph-changed',
  evaluate({ prior, current }) {
    if (
      prior.externalCallGraphHash &&
      current.externalCallGraphHash &&
      prior.externalCallGraphHash !== current.externalCallGraphHash
    ) {
      return {
        shouldRerun: true,
        triggers: ['external-call-graph-changed'],
        reason: 'external call graph changed',
      };
    }
    return { shouldRerun: false, triggers: [], reason: 'call graph stable' };
  },
};
