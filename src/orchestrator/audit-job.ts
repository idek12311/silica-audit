/**
 * Audit-job state machine (Contract E, spec/01-use-case-frame.md:174-191)
 *
 * Manages the lifecycle of a Silica audit from pending → completed (or failed).
 * Each state transition writes an event to the audit ledger for observability.
 */

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export type AuditJobState =
  | 'pending'             // job created, waiting for source-fetch
  | 'fetching'            // source-fetcher running
  | 'compiling'           // toolchain compile + bytecode-equivalence
  | 'static-analyzing'    // tool layer running in parallel by VM
  | 'analyzer-pass'       // Analyzer agent active
  | 'prover-pass'         // Prover agent generating + validating PoCs
  | 'skeptic-pass'        // Skeptic agent reviewing
  | 'consolidating'       // composite-finding rollup; heuristic citation
  | 'persisting'          // write to Postgres + emit report
  | 'completed'
  | 'failed'
  | 'budget-truncated'
  | 'cancelled';

export interface AuditJob {
  id: string;
  tenantId: string;
  state: AuditJobState;
  subjectKind: 'evm' | 'svm' | 'off-chain';
  targetAddress?: string;
  chainId?: number;
  budgetUsd: number;
  accumulatedCostUsd: number;
  tokensIn: number;
  tokensOut: number;
  toolchainManifest?: Record<string, unknown>;
  scopeArtifactId?: string;
  events: AuditJobEvent[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface AuditJobEvent {
  id: string;
  auditId: string;
  ts: string;
  state: AuditJobState;
  agentId?: string;
  router?: string;
  findingId?: string;
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Allowed state transitions (Contract E graph)
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Partial<Record<AuditJobState, readonly AuditJobState[]>> = {
  pending:           ['fetching', 'cancelled'],
  fetching:          ['compiling', 'failed', 'cancelled'],
  compiling:         ['static-analyzing', 'failed', 'cancelled'],
  'static-analyzing': ['analyzer-pass', 'failed', 'budget-truncated', 'cancelled'],
  'analyzer-pass':   ['prover-pass', 'consolidating', 'failed', 'budget-truncated', 'cancelled'],
  'prover-pass':     ['skeptic-pass', 'failed', 'budget-truncated', 'cancelled'],
  'skeptic-pass':    ['consolidating', 'failed', 'budget-truncated', 'cancelled'],
  consolidating:     ['persisting', 'failed'],
  persisting:        ['completed', 'failed'],
  completed:         [],
  failed:            [],
  'budget-truncated': ['persisting', 'cancelled'],
  cancelled:         [],
} as const;

export interface TransitionResult {
  success: boolean;
  job?: AuditJob;
  error?: string;
}

// ---------------------------------------------------------------------------
// Budget enforcement (design/cost-model.md §Budget enforcement)
// ---------------------------------------------------------------------------

export interface CostIncrement {
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  agentId?: string;
  router?: string;
  findingId?: string;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Orchestrator class
// ---------------------------------------------------------------------------

export class AuditJobOrchestrator {
  /**
   * Creates a new AuditJob in 'pending' state.
   */
  createJob(params: {
    id: string;
    tenantId: string;
    subjectKind: AuditJob['subjectKind'];
    budgetUsd: number;
    targetAddress?: string;
    chainId?: number;
    scopeArtifactId?: string;
  }): AuditJob {
    const now = new Date().toISOString();
    const job: AuditJob = {
      id: params.id,
      tenantId: params.tenantId,
      state: 'pending',
      subjectKind: params.subjectKind,
      targetAddress: params.targetAddress,
      chainId: params.chainId,
      budgetUsd: params.budgetUsd,
      accumulatedCostUsd: 0,
      tokensIn: 0,
      tokensOut: 0,
      scopeArtifactId: params.scopeArtifactId,
      events: [],
      createdAt: now,
      updatedAt: now,
    };
    return this.appendEvent(job, {
      id: `evt_${Date.now()}`,
      auditId: job.id,
      ts: now,
      state: 'pending',
      details: { action: 'job_created' },
    });
  }

  /**
   * Transitions the job to a new state.
   * Validates the transition and records the event.
   */
  transition(job: AuditJob, toState: AuditJobState, eventDetails?: Record<string, unknown>): TransitionResult {
    const allowed = ALLOWED_TRANSITIONS[job.state];
    if (!allowed?.includes(toState)) {
      return {
        success: false,
        error: `Invalid state transition: '${job.state}' → '${toState}'`,
      };
    }

    const now = new Date().toISOString();
    const event: AuditJobEvent = {
      id: `evt_${Date.now()}`,
      auditId: job.id,
      ts: now,
      state: toState,
      details: { ...eventDetails, from: job.state, to: toState },
    };

    const updated: AuditJob = {
      ...job,
      state: toState,
      updatedAt: now,
      completedAt: (toState === 'completed' || toState === 'failed') ? now : job.completedAt,
    };

    return {
      success: true,
      job: this.appendEvent(updated, event),
    };
  }

  /**
   * Records a cost increment and checks if the budget is exceeded.
   * Returns the updated job and a flag indicating budget-truncation.
   */
  recordCost(job: AuditJob, increment: CostIncrement): { job: AuditJob; budgetExceeded: boolean } {
    const now = new Date().toISOString();
    const newAccumulated = job.accumulatedCostUsd + increment.costUsd;
    const budgetExceeded = newAccumulated > job.budgetUsd;

    const event: AuditJobEvent = {
      id: `evt_${Date.now()}`,
      auditId: job.id,
      ts: now,
      state: job.state,
      agentId: increment.agentId,
      router: increment.router,
      findingId: increment.findingId,
      costUsd: increment.costUsd,
      tokensIn: increment.tokensIn,
      tokensOut: increment.tokensOut,
      details: {
        ...increment.details,
        accumulated_cost_usd: newAccumulated,
        budget_usd: job.budgetUsd,
      },
    };

    const updated: AuditJob = {
      ...job,
      accumulatedCostUsd: newAccumulated,
      tokensIn: job.tokensIn + increment.tokensIn,
      tokensOut: job.tokensOut + increment.tokensOut,
      updatedAt: now,
    };

    return {
      job: this.appendEvent(updated, event),
      budgetExceeded,
    };
  }

  private appendEvent(job: AuditJob, event: AuditJobEvent): AuditJob {
    return { ...job, events: [...job.events, event] };
  }
}

// ---------------------------------------------------------------------------
// Transition validity predicate (for tests and routers)
// ---------------------------------------------------------------------------

export function isAllowedAuditTransition(from: AuditJobState, to: AuditJobState): boolean {
  return Boolean(ALLOWED_TRANSITIONS[from]?.includes(to));
}
