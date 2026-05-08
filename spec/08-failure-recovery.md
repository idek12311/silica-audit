# 9. Failure Recovery Policy

## Retry policy by failure mode

| Failure mode | Retry count | Backoff | Circuit breaker | Escalate to |
|--------------|-------------|---------|-----------------|-------------|
| Tool error (Slither / Foundry / Anchor / Soteria binary failure) | 1 retry | 0s | After 1 → terminal | §10.1 |
| Bash non-zero exit | 0 (signal, not noise) | n/a | n/a | Investigate root cause; do not loop |
| Subagent timeout (Group A/B/C/D worker exceeded `termination`) | 1 retry | 5s | After 1 → terminal | Group `failure_policy` decides |
| Subagent malformed output (worker writes file but format violates contract) | 2 retries | 2s, 4s | After 2 → escalate | §10.2 |
| LLM API rate limit / 429 | 5 retries | exponential 1s, 2s, 4s, 8s, 16s | After 5 → terminal | §10.1 |
| LLM API auth / 401 / 403 | 0 retries | n/a | Halt immediately | User (env / key issue) |
| Reviewer `block` | 0 (intended) | n/a | Halt Phase Map | User (§10.1) |
| Reviewer `proceed-with-changes` | Apply if ≤3 findings | n/a | n/a | Continue |
| Two-Correction Rule (bob:867-870) — same phase fails twice | 0 further | n/a | `/clear` and resume | User if still unclear |
| Drift gate fail (citation OOB) | 0 retry; ADR-only | n/a | n/a | `decisions/PIVOT-NNN.md`; fix citations; re-run |
| Test flakiness (intermittent fail) | 1 retry then investigate | 0s | After 1 → investigate; do NOT mark green | Engineering — fix the test |
| Container build failure (Slither/Foundry/Anchor Dockerfile) | 2 retries | 5s, 30s | After 2 → terminal | §10.1 |
| RPC rate limit (Etherscan / Alchemy / Helius) | 3 retries | exponential 5s, 30s, 120s | After 3 → terminal | Switch RPC provider via env |
| Postgres connection error | 5 retries | exponential 1s, 2s, 4s, 8s, 16s | After 5 → terminal | User (DB infra) |
| Bench-case bytecode-equivalence mismatch | 0 retry; finding | n/a | n/a | Mark case as `[verify]`; ADR documents drift |

## Per parallel-group `failure_policy` semantics

- **`abort-on-any`**: any worker fails → kill remaining, mark phase failed, escalate. Used for phases where partial completion would corrupt the artifact (e.g., schema migrations).
- **`continue-with-N-1`**: one worker fails → finish rest in parallel, then retry the failed one solo, then proceed. Used for Groups A, B, C, D where workers are independent.
- **`abort-on-any-block`**: any reviewer returns `verdict: block` → halt all downstream phases. Used for the per-phase review pattern.

The Silica spec uses `continue-with-N-1` for Groups A, B, C, D (independent workers) and `abort-on-any-block` for the reviewer pattern.

## Idempotency requirements (structural, not byte-equal)

LLM output is nondeterministic. Idempotency means: re-running a phase produces an artifact that **passes the same gates** as the prior run. Compare gate-pass sets, not byte hashes.

Specifically for Silica:
- Re-running a worker writes to the same paths but with different formatting / variable names allowed.
- Re-running a worker MUST result in `npm run test:unit` exit 0 (the test was passing; re-run keeps it passing).
- Re-running a worker MUST result in `npm run typecheck` exit 0.
- Re-running a worker MAY produce different `console.log` text or comment phrasing — that's fine.

## What is terminal vs. retried

**Terminal (no retry; halt):**
- Reviewer `verdict: block`
- Drift gate fail (after fix attempt)
- Validator self-check fail
- Environment error not in retry table
- Two-Correction Rule fires
- Hard-stop conditions in `09-stop-conditions.md` §1

**Retried (capped):**
- Tool error (1)
- Subagent timeout (1)
- Malformed output (2)
- LLM rate limit (5)
- Container build (2)
- RPC rate limit (3)
- Postgres connection (5)

## Pivot logging

Every deviation from the spec text requires a `decisions/PIVOT-NNN.md` ADR. The same change set must update the affected spec file in the same commit.

ADR format:
```markdown
# PIVOT-NNN — <one-line title>

**Date:** <ISO 8601 UTC>
**Phase:** <P-ID>
**Status:** proposed | accepted | reverted

## Context
<what triggered this; what spec text said before>

## Decision
<what we're changing>

## Consequences
<downstream phases affected; gate impacts; updated `02-acceptance-criteria.md` predicates if any>

## Spec edits applied
- <file>:<line> — <one-line summary of the edit>
```

Pivots that change `02-acceptance-criteria.md` predicates require user confirmation per `09-stop-conditions.md` §4.

## Phase-level retry budget

Each phase has at most **one full re-attempt** before escalation. If a phase's `.test` fails, the executor:

1. Reads the failure output.
2. Identifies the smallest fix.
3. Writes a slice (red-green-refactor).
4. Re-runs `.test`.
5. If still failing → second attempt is the final attempt — must succeed or escalate via §10.1.

This is the Two-Correction Rule (bob:867-870) applied at phase granularity. Two failed corrections → `/clear` and ask the user.

## Worker-failure cascade

If Worker A1 fails terminally and Group A has `failure_policy: continue-with-N-1`:

1. Workers A2, A3 finish their assignments normally.
2. The orchestrator marks A1 as failed in `checkpoints/P1-status.md`.
3. The orchestrator retries A1 solo with the same contract.
4. If A1 fails again terminally → escalate per §10.1 in `09-stop-conditions.md`.
5. If A1 succeeds on retry → P1 phase completes; downstream phases dependent on P1 (e.g., P4, P6) proceed.

If A1 succeeds on retry, the executor verifies that A2 and A3 outputs still pass their tests against the new A1 output (a worker's contract may include a build-time dependency on a sibling).

## Hostile-input failure isolation

If a tool subprocess (Slither / Mythril / Foundry / Anchor) crashes due to malformed audit input:

1. Container exit code captured.
2. Crash report written to `checkpoints/<phase-id>.tool-crash-<tool>.txt`.
3. The audit-job state machine transitions to a `tool-crash-recovery` substate.
4. The Skeptic agent reviews whether the crash is a tool bug, an input-attack (compiler bomb, gas bomb, etc.), or a misconfigured fixture.
5. If input-attack: ADR documents the new attack class; add to `K. Hostile-input defense` corpus.

A tool crash never propagates outside its container (cgroups + container isolation per `notes.md` §17.10).
