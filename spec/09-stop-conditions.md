# 10. Stop Conditions & Escalation

## §1 — Hard stops (halt immediately)

The executor halts work and writes `decisions/STOP-<phase-id>.md` immediately on any of:

- Reviewer returns `verdict: block`
- Validator (`validate_spec.py --strict`) exits non-zero on the spec
- Drift gate fails (citation OOB) and cannot be fixed by re-citation alone
- File-system error not covered by `08-failure-recovery.md` retry table
- Two-Correction Rule fires (same phase fails twice; bob:867-870)
- `~/.claude/CLAUDE.md` modified by any tool (must never happen)
- `/root/CLAUDE.md` modified by any tool (must never happen)
- Any `~/.claude/skills/<other>/` modified (skill registry mutation forbidden)
- `/root/Silica/notes.md` or `/root/Silica/design/*` or `/root/Silica/research/*` or `/root/Silica/ops/*` modified by anything other than ADR-backed updates
- File outside `/root/Silica/` written or modified (sister projects untouchable)
- Any `.env`, `*.key`, `*.pem`, RPC API key, deployer key, or credential committed
- Production heuristics published to `/root/Silica/public/` (production library is closed; only baseline goes public)
- Off-chain agent runs without a valid `scope_artifact_id` (security boundary)

## §2 — Soft stops (escalate without halting)

The executor writes `decisions/ASK-<phase-id>.md` and continues with the rest of the phase map where possible:

- `verdict: proceed-with-changes` with >3 findings (limit per template)
- Phase budget exceeded by >50% of `tool_budget` or `token_budget` from `03-phase-map.md`
- Subagent malformed-output retries exhausted (the contract may need revision)
- Bench-case `[verify]` markers proliferate beyond 5 in a single phase (research-quality issue)
- Heuristic FP rate >0.30 over 50+ observations (per `design/heuristic-schema.md` deprecation criteria)
- A bench case fails for an unexpected reason (might indicate spec drift)

Format: ask user via `AskUserQuestion` if available, else write `decisions/ASK-<phase-id>.md` with structured options.

## §3 — Advisor escalation triggers

Per `/root/CLAUDE.md` advisor checklist, the executor calls the advisor (`claude-opus-4-6` via `advisor_20260301`) when about to:

- Choose between two valid architectural approaches with different long-term tradeoffs (e.g., orchestrator state machine vs Temporal workflow engine for v1 — locked as state machine in `01-use-case-frame.md`, but if pivoting, advise)
- Place a new boundary or abstraction not previously named
- Make a change touching 4+ files across 2+ layers without an existing pattern
- Commit to a public API shape, schema change, or irreversible decision (e.g., the v0 → v0.1 schema migration; locked but if extending further, advise)
- Remove an existing abstraction
- Assess whether a refactor is safe across a blast radius the executor has mapped

Do NOT call the advisor for:
- Mechanical implementation of a clear spec
- Writing tests for already-designed behavior
- Building an adapter following an established pattern
- Naming, formatting, or cleanup work
- Running tools and interpreting results

When calling: provide curated context (the relevant boundary summary, the two approaches under consideration, and the specific decision needed). Do not dump raw file contents.

## §4 — User-only decisions

The executor must not autonomously decide:

- Whether to ship if any §A-§O acceptance criterion is `partial-pass` (e.g., 4-of-6 EVM bench cases catch the bug but the F. recall threshold demands ≥5)
- Whether to relax a §1 hard stop
- Whether to expand scope beyond `00-identity.md` "Required artifacts" or "Allowed tools"
- Whether to modify any of the existing skills under `~/.claude/skills/`
- Whether to skip a phase entirely (vs. scope-deferring within an ADR)
- Whether to reduce a confidence ceiling in `validation-tiers.md` below the locked v0 values
- Whether to publish a heuristic to the Public pool from a Tenant-private finding without sanitization
- Whether to override the locked decisions in `notes.md` §17 — locked decisions only change via spec amendment and ADR

Each user-only decision is surfaced via `decisions/ASK-<phase-id>.md` with structured options and an owner cite.

## §5 — Resumption protocol

After user resolves a stop:

1. Re-read `/root/Silica/spec/README.md` + `03-phase-map.md` + the relevant `STOP-*.md` / `ASK-*.md` / `PIVOT-*.md` ADRs.
2. Re-run drift gate on the last completed phase.
3. Re-attempt the failed phase from scratch (no partial mid-row resume; idempotency requires structural-not-byte-equal re-run).
4. If user changed the spec, re-run `validate_spec.py --strict` first.
5. Re-run all gates the failed phase requires per `07-verification-gates.md` §H.
6. If gates pass → flip the phase's `[ ]` to `[x]` and continue.

## §6 — Stop-level audit trail

Every hard stop produces:
- `decisions/STOP-<phase-id>.md` — what stopped, why, what the user decided
- A line in the audit-job event ledger (`db.audit_event` table)
- An entry in the final report (`checkpoints/FINAL.md` "Open risks" section)

Every soft stop produces:
- `decisions/ASK-<phase-id>.md` — open question with structured options
- A line in the audit-job event ledger
- An entry in `checkpoints/FINAL.md` "Open risks" or "Pivots taken" depending on resolution

Every advisor call produces:
- `decisions/ADVISOR-<phase-id>.md` — context provided, advisor's recommendation, executor's resulting decision

## §7 — Cancellation

If the user explicitly cancels (e.g., "stop", "abort"), the executor:

1. Writes `decisions/STOP-USER-CANCEL-<timestamp>.md` capturing in-flight phase + last completed phase.
2. Does NOT attempt cleanup of in-flight worker files (preserves forensics).
3. Reports current state to user: which phases are complete, which are in-flight, which haven't started.
4. Does NOT auto-resume on next session — the user must explicitly re-invoke.
