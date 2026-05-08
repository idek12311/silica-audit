# PIVOT-002 — Round-2 reviewer follow-ups

**Date:** 2026-05-08T21:10:00Z
**Phase:** spec-author Step 4 (round 2)
**Status:** accepted

## Context

Round-2 reviewer (per author-agent-spec skill Step 4) returned `verdict: proceed-with-changes` with 5 new findings (1 high, 4 medium). Per the skill rule "proceed-with-changes → apply inline if ≤3 findings; otherwise treat as block," 5 findings warrant a documented pivot.

Round-1 high-severity findings: **9 of 10 RESOLVED**. The remaining propagation gap (round-1 finding #14: bob per-line citations) was fixed in `07-verification-gates.md` §A but not in the parallel block at `10-reporting-contract.md:39-45`.

## Findings to address

### High (L3)
1. `10-reporting-contract.md:39-45` — per-phase reviewer template still uses bob:878/879/880/881/882/882 per-line citations. Needs the same fix applied to 07 §A (cite bob:873-883 for every layer).

### Medium
2. (L2) **C1↔C2 coordination has no synchronization primitive.** Workers in Group C run in parallel; the convention file `bench/heuristic-id-convention.md` is documented as authored by C2 first but parallel workers cannot guarantee write-then-read ordering. **Fix:** move authoring of `bench/heuristic-id-convention.md` into P11 (the Euler case ships it as a deliverable). Then P12 (C1) and P13 (C2) both read a stable file written in a prior sequential phase.
3. (L2) **F-gate scoping contradiction at P12/P13 row.** §F section in `07-verification-gates.md` declares F as a P20 sub-gate, but `§H` lists `F` at the `P12, P13` row. Round-1 fix only updated the P11 row. **Fix:** remove F from P12/P13 row.
4. (L5) **P3/P19 layout reconciliation partial.** `01-use-case-frame.md` Components table now reads flat (`src/heuristic/store.ts` etc.) but `03-phase-map.md` P19.test references `src/heuristic/{store,mining,drift}/` subdirs and `02-acceptance-criteria.md` §I references `src/heuristic/sanitization/` subdir. **Fix:** update both to reference the flat layout (`src/heuristic/`).
5. (L3, low) `01-use-case-frame.md:73-99` — Contract A cites `schema-draft-v0.md:9-39`; the actual interface is at `:17-49`. Off-by-8-10 lines, region correct. Round-1 left as low-severity. **Fix in this round** for citation precision.

## Decision

Apply the 5 targeted fixes inline. No structural changes to the phase DAG or worker contracts beyond the named edits.

## Spec edits applied

- `10-reporting-contract.md:39-45` — replace bob:878/879/880/881/882/882 with bob:873-883 for each layer; mirror `07-verification-gates.md:A` table format
- `03-phase-map.md` P11 row — add `bench/heuristic-id-convention.md` to deliverables; phrase P12/P13 worker contracts to read from this stable file
- `04-parallelization-plan.md` Worker C2 — adjust to note "the convention file is authored in P11; C2 reads it as a stable input rather than authoring it concurrently with C1"; Worker C1 likewise
- `07-verification-gates.md` §H — remove `F` from `P12, P13` row
- `03-phase-map.md` P19.test — change `src/heuristic/{store,mining,drift}/` to `src/heuristic/` flat path
- `02-acceptance-criteria.md` §I — change `src/heuristic/sanitization/` to `src/heuristic/` flat path; runner targets `sanitization.test.ts` directly
- `01-use-case-frame.md` Contract A — change `schema-draft-v0.md:9-39` to `schema-draft-v0.md:17-49`

## Consequences

- All round-2 findings addressed (1 high + 4 medium).
- Round-3 reviewer will be lightweight (verify the 5 targeted fixes).
- No phase budget changes.
- The C1↔C2 coordination concern is fully resolved by moving the convention file into P11; Group C workers can stay parallel without worrying about write-order.
