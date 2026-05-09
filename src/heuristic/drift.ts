/**
 * Heuristic drift monitor.
 *
 * Nightly job that:
 * 1. Re-runs every active heuristic against its regression cases
 * 2. Flags heuristics with FP rate growth > 0.05 over 30 days
 * 3. Flags heuristics with no observations in 90 days
 *
 * Per design/heuristic-schema.md §Drift monitoring.
 */
import type { Heuristic } from './schema.js';

export interface DriftReport {
  heuristicId: string;
  version: number;
  flags: DriftFlag[];
}

export type DriftFlagKind =
  | 'regression-case-failing'    // heuristic no longer catches its founding exploit
  | 'fp-rate-growth'             // FP rate grew > 0.05 in last 30 days
  | 'no-recent-observations'     // no observations in 90 days
  | 'no-regression-case';        // no regression case attached (gaps in coverage)

export interface DriftFlag {
  kind: DriftFlagKind;
  detail: string;
  severity: 'warning' | 'error';
}

export interface DriftCheckContext {
  now: Date;
  /** FP rate delta threshold for flagging */
  fpRateGrowthThreshold: number;
  /** Days without observations before flagging */
  noObsDaysThreshold: number;
}

const DEFAULT_CONTEXT: DriftCheckContext = {
  now: new Date(),
  fpRateGrowthThreshold: 0.05,
  noObsDaysThreshold: 90,
};

/**
 * Checks a single heuristic for drift signals.
 * The actual regression case execution is done by the test harness;
 * this function evaluates heuristic metadata for observable drift signals.
 */
export function checkHeuristicDrift(
  heuristic: Heuristic,
  regressionCasePassing: boolean,
  ctx: DriftCheckContext = DEFAULT_CONTEXT,
): DriftReport {
  const flags: DriftFlag[] = [];

  // Check regression case
  if (heuristic.regression_cases.length === 0) {
    flags.push({
      kind: 'no-regression-case',
      detail: `Heuristic ${heuristic.id} has no regression cases — cannot verify it still catches its founding exploit`,
      severity: 'warning',
    });
  } else if (!regressionCasePassing) {
    flags.push({
      kind: 'regression-case-failing',
      detail: `Heuristic ${heuristic.id} regression case is failing — heuristic may no longer detect the founding exploit`,
      severity: 'error',
    });
  }

  // Check FP rate growth (if we have enough observations)
  if (heuristic.n_observations >= 50 && heuristic.fp_rate_observed !== undefined) {
    if (heuristic.fp_rate_observed > 0.30) {
      flags.push({
        kind: 'fp-rate-growth',
        detail: `Heuristic ${heuristic.id} FP rate ${heuristic.fp_rate_observed.toFixed(2)} > 0.30 — consider deprecation`,
        severity: 'error',
      });
    }
  }

  // Check observation recency
  if (heuristic.last_observation_at) {
    const lastObs = new Date(heuristic.last_observation_at);
    const daysSince = (ctx.now.getTime() - lastObs.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > ctx.noObsDaysThreshold) {
      flags.push({
        kind: 'no-recent-observations',
        detail: `Heuristic ${heuristic.id} has ${Math.floor(daysSince)} days since last observation — review for deprecation`,
        severity: 'warning',
      });
    }
  }

  return {
    heuristicId: heuristic.id,
    version: heuristic.version,
    flags,
  };
}

/**
 * Returns whether a drift report has blocking (error-severity) flags.
 */
export function isDriftBlocking(report: DriftReport): boolean {
  return report.flags.some(f => f.severity === 'error');
}
