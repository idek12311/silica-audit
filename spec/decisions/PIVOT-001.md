# PIVOT-001 — Citation & substantive fix pass after reviewer block

**Date:** 2026-05-08T20:55:00Z
**Phase:** spec-author Step 4 (forked self-review)
**Status:** accepted

## Context

The forked reviewer (per author-agent-spec skill Step 4, bob:884-889 opposing-objective) returned `verdict: block` with 53 findings (10 high, 19 medium, 24 low) on the v1 spec.

High-severity findings concentrated in:
- **Layer 3 (API integrity) — 8 high:** citation drift in `00-identity.md`, `02-acceptance-criteria.md`, `03-phase-map.md`, `04-parallelization-plan.md`, `07-verification-gates.md`. Multiple `notes.md:N` citations point to wrong content; one `schema-stressors-v0.md:1-660` citation OOB; `legal-framing.md` Risk 7 cited for container isolation but Risk 7 is "Findings dispute"; bob layer per-line citations are imprecise (the framework is a single table at bob:873-883).
- **Layer 6 (Test quality) — 2 high:** structural tests pass via truthy hacks; no test validates non-bob external citations (`notes.md`, `design/`, `ops/`, `research/`, SKILL.md).

Validator (`validate_spec.py --strict`) and structural tests both pass — the citation-drift class of error is invisible to existing gates. That's a gap the test suite must close.

## Decision

Apply a single fix pass covering:

### A. Citation corrections (all spec files)
1. `00-identity.md` Required-artifacts table: replace incorrect `notes.md:138 / 170 / 178 / 217 / 330` citations with verified anchors. Where no notes.md anchor exists for the artifact (audit-job state machine, 3 agents, repo agent rules), cite the spec's own contract section or remove the citation entirely.
2. `00-identity.md`: fix `multi-vm-svm-sketch.md:79` → `:114-122` (Anchor + solana-test-validator); fix `schema-draft-v0.md:115` → toolchain_manifest at `:60-77`; fix `heuristic-schema.md:188` → Storage at `:205-207`.
3. `02-acceptance-criteria.md` §K: reduce "5 prompt-injection patterns" claim to 3 (only 3 are in `notes.md:364-373`); replace `notes.md:415` citation with `notes.md:364-373`.
4. `02-acceptance-criteria.md` §N: expand grep checks from 5 sections to all 9 sections required by `write-agent-rules/SKILL.md:26-37` (Project shape / Architecture posture / Dependency rules / Naming rules / TDD policy / Review checklist / Debt policy / Verification gates / Hard stops).
5. `03-phase-map.md` P0.review row: replace `notes.md:227-275` (which is §6/§7/§8 routers/spine/extensions) with `notes.md:493-580` (§17 locked decisions overall, where repo conventions are codified).
6. `03-phase-map.md` P1.review row: fix `schema-stressors-v0.md:1-660` → `:1-557` (file is 557 lines).
7. `03-phase-map.md` P5.review and P10 row: replace `legal-framing.md Risk 7` with `notes.md:619-625` (§17.10 multi-tenant isolation, where container limits are actually defined); replace `cost-model.md:121-140` with `:111-119` for budget enforcement.
8. `04-parallelization-plan.md` Worker B2 boundary: replace `legal-framing.md Risk 7` reference with `notes.md:619-625`.
9. `04-parallelization-plan.md` Worker A1 tool_guidance: remove `/root/nexus/src/contract/` reference (out-of-scope cross-repo browsing) — replace with "use Zod patterns conventional in TypeScript projects (Zod docs)".
10. `07-verification-gates.md` §A Six-Layer table: replace per-line bob:878/879/880/881/882 with whole-framework citation `bob:873-883` for every layer (the bob source presents all six layers as a table cluster, not individual lines).
11. `07-verification-gates.md` §H per-phase gate table: remove `F (Euler-finding lessons)` from the P11 row — §F is explicitly scoped to P20 in the same file.

### B. Substantive fixes
12. `01-use-case-frame.md` §L2 Components: P15 named 5 SVM specialist agents; `multi-vm-svm-sketch.md:55-100` enumerates 7 (adds SVM-MISSING-OWNER-CHECK and SVM-DUPLICATE-ACCOUNT-MUTABLE). Expand P15 worker scope to 7 (in `03-phase-map.md`) so the spec covers the full SVM bug class set.
13. `04-parallelization-plan.md` Group D worker contracts (D1, D2): add explicit container limits (cgroups CPU/memory/timeout, network egress restrictions) per `notes.md:619-625` §17.10. Workers must inherit the container-isolation policy at contract level.
14. `04-parallelization-plan.md` Group C: add a heuristic-ID convention table in C2's worker contract that C1 references — `bench/heuristic-id-convention.md` is read by both before they run, removing the C1↔C2 namespace coordination gap.
15. `01-use-case-frame.md` Component table: P3 writes `src/heuristic/store.ts` (flat); P19 extends with `src/heuristic/mining.ts` and `src/heuristic/drift.ts` (sibling files, NOT subdirectories). Reconcile P3 vs P19 layout — locked as flat-files-in-same-dir.
16. `04-parallelization-plan.md` workers in P9/P15: add explicit instruction that agent prompts declare trust tier (`anthropic-no-retention | self-hosted-vllm`) at invocation; surface notes.md §17.3 trust tiers in agent prompt contracts.
17. `02-acceptance-criteria.md` §I: add a sanitization test that verifies a Private-pool finding cannot leak to Shared/Public pools without the sanitization step (notes.md §17.4 + invariant 5).

### C. Test strengthening
18. `tests/test_spec_structure.py`: tighten `test_worker_contracts_have_four_fields` to require non-trivial bodies for each field (non-empty, not literal "TODO", not a lone placeholder).
19. `tests/test_spec_structure.py`: tighten `test_acceptance_criteria_have_executable_predicates` to require an actual command invocation pattern (not the prose "exits 0" alone).
20. `tests/test_spec_structure.py`: add `test_external_doc_citations_in_range` — for every cite of the form `<path>:<N>` or `<path>:<N>-<M>` to files under `/root/Silica/{notes.md,README.md,design/,ops/,research/}` and to skill `SKILL.md` files, verify N and M ≤ wc -l of the target file.
21. `tests/test_spec_structure.py`: add a forbidden-phrase set covering "by hand", "operator confirms", "human verifies".

### D. Drift gate widening
22. `07-verification-gates.md` §D drift gate: extend the script to validate `notes.md`, `design/`, `ops/`, `research/`, and skill `SKILL.md` line citations against actual file lengths — not just bob.

## Consequences

- **Spec correctness:** all high-severity reviewer findings addressed; medium-severity findings addressed where impactful (SVM coverage, D-group container policy, C1↔C2 coordination, layout conflict).
- **Test surface:** structural test suite now catches the same class of citation drift the human reviewer found (closes the gap that allowed 8 wrong notes.md citations to land in v1).
- **No phase budget changes:** edits are spec-text only; phase tool/token budgets in `03-phase-map.md` are unchanged. SVM bug class expansion (5→7) within P15 is absorbed by existing tool_budget=120 calls / token_budget=200k.
- **Re-review:** spawn round 2 of forked reviewer after edits land. Per skill cap of 4 rounds, this is round 2.

## Spec edits applied

- `00-identity.md` lines 23, 24, 25, 26, 29, 30, 31, 34: Required-artifacts citations corrected
- `02-acceptance-criteria.md` §K + §N: prompt-injection corpus, CLAUDE.md required-section list
- `03-phase-map.md` P0.review, P1.review, P5.review, P10 row, P11 row: citation corrections
- `04-parallelization-plan.md` Worker A1, B2, C2, D1, D2 (and reviewer for P9/P15): bug class expansion, container limits, coordination convention, /root/nexus removal
- `01-use-case-frame.md` Component table P15 and §Non-goals: 7 SVM agents
- `07-verification-gates.md` §A Six-Layer table, §H P11 row, §D drift gate: bob layer citations, F-gate scope, drift coverage
- `tests/test_spec_structure.py`: 4 test additions/strengthenings
- `README.md` executor walkthrough: skill order expanded
