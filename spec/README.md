# Silica v1 — Executor Spec

> The source of truth for building Silica v1. Executor agents follow this spec literally; pivots are documented as ADRs in `decisions/PIVOT-NNN.md` and re-applied to the affected spec text in the same change. The user-facing design dossier lives one level up at `/root/Silica/{notes.md,design/,ops/,research/}` and is read-only during execution.

## What gets built

A VM-and-source-agnostic vulnerability platform that audits smart contracts on EVM and Solana SVM and the off-chain infrastructure surrounding them, with auto-PoC validation across an 11-rung tier ladder, a versioned heuristic library that compounds across audits, and an open-source baseline + bench corpus + eval framework as the credibility wedge.

v1 ships three differentiation axes: **EVM front + SVM front + off-chain perimeter**. v2 adds continuous monitoring + Move/Cairo VMs.

## Read order (executor onboarding)

1. **`README.md`** (this file) — orientation
2. **`00-identity.md`** — what's being built, where, what the executor may and may not touch
3. **`01-use-case-frame.md`** — capability, components, interactions, contracts A–E, invariants, non-goals
4. **`02-acceptance-criteria.md`** — executable predicates §A–§O the final acceptance gate walks
5. **`03-phase-map.md`** — DAG of 21 phases (P0–P20) with checkboxes and budgets
6. **`04-parallelization-plan.md`** — per-block worker contracts (Anthropic 4-field) for parallel groups A–D
7. **`05-skill-choreography.md`** — which existing skills the executor invokes per phase
8. **`06-context-handoff.md`** — phase-to-phase data contracts and compaction policy
9. **`07-verification-gates.md`** — Six-Layer Review + Six-Gate CI + TDD red-green + drift + final acceptance
10. **`08-failure-recovery.md`** — retry policies, terminal vs retried, idempotency
11. **`09-stop-conditions.md`** — hard / soft / advisor / user-only escalations
12. **`10-reporting-contract.md`** — per-phase checkpoint + per-phase review + final report formats

Plus three working directories:
- **`tests/`** — at minimum, `test_spec_structure.py` (validates spec internal coherence)
- **`checkpoints/`** — executor writes `<phase-id>.md`, `<phase-id>.review.md`, `COMPACT-<phase-id>.md`, etc.
- **`decisions/`** — ADRs: `PIVOT-NNN.md`, `ASK-<phase-id>.md`, `STOP-<phase-id>.md`, `ADVISOR-<phase-id>.md`

## Pre-flight

Before invoking, validate the spec is structurally sound:

```bash
python3 /root/.claude/skills/author-agent-spec/scripts/validate_spec.py --strict /root/Silica/spec
```

Exit 0 = ready to execute. Exit 1 = a hard-rejection anti-pattern (one of 8) was found; fix before continuing.

## Executor walkthrough (high-level)

For each phase row in `03-phase-map.md`:

1. Read the row + `depends_on` checkpoints.
2. Verify drift gate (`07-verification-gates.md` §D) — all cited file:line ranges still resolve.
3. Apply the canonical skill order (`05-skill-choreography.md`):
   - `plan-feature-architecture` (architecture plan)
   - `choose-better-names` (names before code)
   - `clean-code-before-change` (only if modifying tangled code)
   - `code-with-tests-first` (red-green-refactor per slice)
   - `codex` (apply file edits per slice)
   - `decide-duplicate-code` (only if extraction is being considered)
   - `simplify` (post-edit cleanup of the slice)
   - `check-test-quality` (behavioral audit — periodically, not per-slice)
   - `review-ai-code` (pre-PR / pre-checkpoint review)
4. Run the phase's `.test` gate per `07-verification-gates.md` §H.
5. Spawn the per-phase reviewer per `04-parallelization-plan.md` (Per-phase adversarial review template).
6. If reviewer verdict ∈ {approve, proceed-with-changes ≤3 findings}: write `checkpoints/<phase-id>.md`, flip both `.review` and `.test` boxes; advance.
7. If reviewer verdict = block: write `decisions/STOP-<phase-id>.md`, halt, escalate to user.

For phases in a parallel group (A, B, C, D): spawn workers per the contract; aggregate by reading their output paths after all complete.

## Hard "do not touch" boundaries

- `~/.claude/CLAUDE.md`, `/root/CLAUDE.md` — never modify
- Any other repo's `CLAUDE.md` — never modify
- `~/.claude/skills/<other>/SKILL.md` — never modify any existing skill
- `/root/.claude/bob` — read-only
- `/root/Silica/notes.md`, `/root/Silica/design/*`, `/root/Silica/ops/*`, `/root/Silica/research/*` — read-only references; updates go through ADRs
- `/root/nexus/`, any sister repo — never touched
- Production secrets (.env, *.key, *.pem, RPC API keys, deployer keys) — never committed

See `00-identity.md` for the full do-not-touch list.

## Locked decisions in scope

This spec implements the locked decisions from `/root/Silica/notes.md` §17:
- v1 axes: EVM + SVM + off-chain perimeter (3 axes)
- Non-EVM v1 priority: SVM
- LLM tier: Anthropic no-retention default, vLLM self-hosted for IP-sensitive
- Heuristic library: open-source baseline + closed production + per-tenant private (3 pools)
- Off-chain perimeter: built-in (not HexStrike adapter)
- Continuous monitoring: triple-gate trigger (foundation only in v1; v2 ships scheduler)
- Canonicalization: `sha256(rfc8785(subject) || 0x1f || taxonomy_id || 0x1f || rfc8785(invariant))`
- Plugin trust: core / verified / community tiers
- Multi-tenant isolation: container-level for tools, process-level for orchestration
- Schema v0 → v0.1: off-chain Subject support added (BadgerDAO stressor)

## Out of scope (explicitly)

Per `01-use-case-frame.md` §Non-goals:
- Continuous monitoring scheduler (v2)
- Move and Cairo VMs (v2)
- R10 formal-proof rung depth handlers (v2)
- Marketplace integrations (Sherlock / Code4rena / Cantina)
- Self-serve subscription product (web dashboard + GitHub app)
- Audit-report PDF generator
- Hosted multi-tenant SaaS deployment

## Acceptance criteria summary

Final P20 gate walks all of `02-acceptance-criteria.md` §A–§O. Brief:

| ID | Bar |
|---|---|
| A | Repo scaffolding present |
| B | Spine schemas typecheck + tests pass |
| C | All 8 schema stressors round-trip |
| D | Tool layer + Docker isolation working |
| E | Three agents + orchestrator integration end-to-end |
| F | ≥83% recall on 6 EVM bench cases, ≤30% FP, ≤$100/audit |
| G | ≥60% recall on 5 SVM bench cases, ≤40% FP |
| H | 8 perimeter surfaces stubbed; scope enforcement working |
| I | ≥30 EVM + ≥10 SVM heuristics; ≥1 cited |
| J | Six-Gate CI passes |
| K | Hostile-input defense corpus passes |
| L | No bench regression vs baseline |
| M | Open-source publishable layer ready |
| N | CLAUDE.md authored with required sections |
| O | Spec passes `validate_spec.py --strict` |

## Provenance

This spec was authored 2026-05-08 by following the `author-agent-spec` skill against the Silica project's design dossier (28 markdown docs, 8,121 lines committed at `/root/Silica/` repo head). The skill's discovery phase fanned out three parallel research agents to extract 180+ Silica anchors, verify bob framework citations (no drift), and map executor skill choreography. The full citation infrastructure is at `/tmp/silica-citations.md`, `/tmp/bob-citations.md`, `/tmp/skill-citations.md`.

The spec passes `validate_spec.py --strict` at write time. Re-validate before any execution session.
