# 11. Reporting Contract

## A. Per-phase checkpoint format

Path: `/root/Silica/spec/checkpoints/<phase-id>.md`

```markdown
# Checkpoint <phase-id> — <ISO 8601 UTC timestamp>
## Phase row
<verbatim copy of the row from 03-phase-map.md>
## Inputs read
- <path:line-range> — <one-line summary>
## Artifacts produced
- <path> — <bytes>, <line count>, <sha256>
## Commands run
```bash
# (paste verbatim commands here; truncate captured output to the last 20 lines)
```
## Gates passed
- <gate-id from 07-verification-gates.md §H>: PASS (evidence: <command output / file>)
## Findings (if any)
<list, severity-ordered>
## Notes / surprises
<any non-obvious calls or unexpected behaviors>
## Verdict
<complete | partial | failed>
```

The checkpoint is written immediately after `.test` passes. The `.review` checkbox is satisfied separately by the per-phase reviewer (see §B below).

## B. Per-phase review format

Path: `/root/Silica/spec/checkpoints/<phase-id>.review.md`

Six-Layer report structure ending with literal final verdict line. All six layers are defined within the bob:873-883 framework table; the framework is the citation, not per-layer line numbers.

```markdown
# Review of (phase-id) — (ISO 8601 UTC)
## Layer 1 — Requirement fidelity (bob:873-883)
(findings; each with file:line and severity)
## Layer 2 — Logic & edge cases (bob:873-883)
## Layer 3 — API integrity (bob:873-883)
## Layer 4 — Security (bob:873-883)
## Layer 5 — Context awareness (bob:873-883)
## Layer 6 — Test quality (bob:873-883)
## Summary
(count by layer + count by severity)
## Verdict
verdict: (approve | proceed-with-changes | block)
```

The verdict line is parsed automatically. Anything else triggers a reviewer-malformed-output retry (`08-failure-recovery.md`).

## C. Final report (after P20)

Path: `/root/Silica/spec/checkpoints/FINAL.md`

```markdown
# Silica v1 — Final Report — <ISO 8601 UTC>

## Built
- /root/Silica/src/finding/             — Finding spine (TS + Zod + canonical_id)
- /root/Silica/src/validation/          — 11-rung validation tier ladder
- /root/Silica/src/heuristic/           — Heuristic library (3-pool storage + mining + drift)
- /root/Silica/src/router/              — 5 runtime routers (tool/escalation/model/agent/validation)
- /root/Silica/src/llm/                 — Anthropic gateway with caching + trust tiers
- /root/Silica/src/agents/              — Analyzer, Prover, Skeptic + SVM specialists
- /root/Silica/src/orchestrator/        — Audit-job state machine
- /root/Silica/tools/                   — Slither, Mythril, Foundry, Soteria, Anchor, Trident, source-fetch, perimeter/*
- /root/Silica/db/migrations/           — Postgres schema
- /root/Silica/bench/cases/             — 6 EVM + 5 SVM bench cases as regression fixtures
- /root/Silica/heuristics/baseline/     — 30 EVM + 10 SVM seed heuristics
- /root/Silica/public/                  — Open-source publication layer (bench corpus + eval framework + baseline agent)

## Acceptance criteria walkthrough
| ID | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| A | Repo scaffolding | <PASS|FAIL> | <path or command output> |
| B | Spine schemas | <PASS|FAIL> | npm run typecheck + test:unit |
| C | Schema stressors round-trip | <PASS|FAIL> | bench/stressors/ test |
| D | Tool layer + Docker isolation | <PASS|FAIL> | tools/ integration tests + docker ps |
| E | Three agents wired | <PASS|FAIL> | src/agents + orchestrator integration |
| F | EVM bench: ≥83% recall | <PASS|FAIL> | bench:evm + check.py |
| G | SVM bench: ≥60% recall | <PASS|FAIL> | bench:svm + check.py |
| H | Off-chain perimeter exercised | <PASS|FAIL> | tools/perimeter/ integration |
| I | Heuristic counts | <PASS|FAIL> | psql counts |
| J | Six-Gate CI | <PASS|FAIL> | lint/types/coverage/boundaries/size/complexity |
| K | Hostile-input defense | <PASS|FAIL> | test:security |
| L | Bench regression | <PASS|FAIL> | regression-check.py |
| M | Open-source publishable artifacts | <PASS|FAIL> | path checks |
| N | CLAUDE.md authored | <PASS|FAIL> | required-section greps |
| O | Spec self-validator | <PASS|FAIL> | validate_spec.py --strict |

## Reviewer verdicts
- Per-phase: <count> approve / <count> proceed-with-changes / <count> block (block must be 0)
- Whole-spec final review: <verdict>

## Open risks
1. <risk> — <severity> — <recommended action>

## Pivots taken (ADRs)
- decisions/PIVOT-NNN.md — <one-line summary>

## What's NOT in scope but observed
<things the executor noticed but did not fix>

## Suggested follow-ups
<bench-corpus expansion / heuristic library curation / v2 axes (continuous monitoring, Move) / etc>
```

## D. Open-risks section (always required)

On clean PASS, write:
```markdown
## Open risks
None observed. Watch items: (a) bench-corpus `[verify]` markers still present; resolve before next audit cycle; (b) heuristic library FP rates need empirical recalibration after first 50 audits; (c) schema migration v0.1 → v0.2 path not yet specified.
```

## E. Status board update (continuous)

The executor uses `Edit` on `/root/Silica/spec/03-phase-map.md` to flip:
- `- [ ] **PN**` → `- [x] **PN**` after the phase's `.review` AND `.test` both check
- `- [ ] PN.review` → `- [x] PN.review` after reviewer writes verdict approve or proceed-with-changes (≤3 findings)
- `- [ ] PN.test` → `- [x] PN.test` after gate set in `07-verification-gates.md` §H all pass

Both child boxes must be checked before the parent flips.

## F. Out-of-band reporting

| Event | Path |
|---|---|
| Compaction | `checkpoints/COMPACT-<phase-id>.md` |
| Advisor call | `decisions/ADVISOR-<phase-id>.md` |
| User pause / question | `decisions/ASK-<phase-id>.md` |
| Hard stop | `decisions/STOP-<phase-id>.md` |
| Pivot | `decisions/PIVOT-NNN.md` (NNN is monotonic) |
| Tool crash within phase | `checkpoints/<phase-id>.tool-crash-<tool>.txt` |

## G. Hand-off to next agent

If the executor session ends mid-spec, the next agent reads in this order:

1. `/root/Silica/spec/README.md` — orientation
2. `/root/Silica/spec/03-phase-map.md` — status (first unchecked box)
3. Latest `checkpoints/COMPACT-*.md` if present
4. All `decisions/*.md` ADRs (chronological)
5. The next-to-do phase row + its `depends_on` checkpoints
6. Procedure files (skill SKILL.md citations) for that phase only

This is bob:564-566 Humble Object: the spec briefs any agent fresh; no conversation continuity required.

## H. Telemetry / audit-job event ledger

Every audit job (a real execution of the platform on a target protocol; not the spec phases) writes events to `db.audit_event`:

```sql
CREATE TABLE audit_event (
  id            ULID         PRIMARY KEY,
  audit_id      ULID         NOT NULL REFERENCES audit(id),
  ts            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  state         TEXT         NOT NULL,                    -- AuditJobState
  agent_id      TEXT,                                     -- which agent emitted
  router        TEXT,                                     -- which router fired
  finding_id    ULID         REFERENCES finding(id),
  cost_usd      NUMERIC(12,4),
  tokens_in     INTEGER,
  tokens_out    INTEGER,
  details       JSONB        NOT NULL DEFAULT '{}'
);
CREATE INDEX ON audit_event (audit_id, ts);
```

Every phase transition, every router decision, every agent invocation, every cost increment lands here. This is the observability spine.

## I. Per-criterion reporting in §C final report

The acceptance walkthrough table (§C) is filled by the executor of P20.test. The script in `07-verification-gates.md` §E auto-populates the Status column. The Evidence column is the command output (truncated to one-line) or the file path checked.

Failures get expanded with reason + recommended remediation in a section below the table.

## J. Telemetry export for open-source eval

The public bench-corpus + eval framework (delivered in P20) emits a standardized score sheet:

```json
{
  "tool": "silica@v1.0.0",
  "bench_corpus_version": "<commit>",
  "results": [
    {"case_id": "euler-march-2023", "vm": "evm", "passed": true, "rung_reached": "fork-execution-state-asserted", "cost_usd": 22.40},
    /* ... per-case ... */
  ],
  "aggregate": {
    "total_cases": 11,
    "evm_recall": 0.83,
    "svm_recall": 0.60,
    "fp_rate": 0.18,
    "avg_cost_usd": 28.12
  }
}
```

This format is the credibility weapon vs Cecuro's recall-only / non-reproducible numbers (per `notes.md` §20.1). Anyone can run our bench; anyone can compare numbers.
