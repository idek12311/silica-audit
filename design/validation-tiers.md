# Validation Tier Ladder — v0

> Every Finding in Silica passes (or fails to pass) through rungs of a validation ladder. Each rung is a stricter test than the prior. The rung a finding clears bounds its confidence and determines what reporting tier it qualifies for.

## Why a ladder

Different bug classes have different *maximum-applicable* rungs. An "informational missing event emission" can never be proven by execution; the highest applicable rung is `compile-only`. A "flash-loan-amplified oracle manipulation" can be fork-replayed; the highest applicable rung is `fork-execution-state-asserted` (or higher).

The ladder lets the harness:
- Distinguish "couldn't prove" from "false positive"
- Apply confidence ceilings per rung (a static-only hit is not a 0.99-confidence finding)
- Escalate cheap-first → expensive-on-fail (the escalation router operates on the ladder)
- Generate audit reports tiered by rigor

## The 11 rungs

### R0 — `static-signal-only`
The finding consists of a deterministic detector firing on the source / bytecode / IDL.
- **Implementors:** Slither detector, Mythril module, Soteria detector, Aderyn detector, Semgrep rule, custom AST pattern.
- **Confidence ceiling:** 0.60
- **Cost:** seconds, cents.
- **What it proves:** A pattern matches. Pattern fidelity to true positives depends on detector quality.
- **What it does not prove:** That the pattern, in this code, is exploitable.
- **Always applicable.**

### R1 — `compile-only`
A PoC test scaffold compiles in the target framework but is not executed.
- **Implementors:** Foundry compile pass, Anchor build, Move build.
- **Confidence ceiling:** 0.65
- **Cost:** seconds, cents.
- **What it proves:** The harness can construct a syntactically-correct attack scaffold (interfaces resolve, mocks compile).
- **What it does not prove:** That the scaffold reaches the bug.
- **Applicable when:** PoC generation is meaningful (skipped for purely informational findings).

### R2 — `fork-execution-no-revert`
The PoC executes on a forked node without reverting.
- **Implementors:** `forge test` against `anvil --fork-url`, `solana-test-validator` with state snapshot, `aptos move test`.
- **Confidence ceiling:** 0.75
- **Cost:** seconds to minutes; modest RPC cost.
- **What it proves:** The attack path is reachable and doesn't revert.
- **What it does not prove:** That the attack accomplished its goal — the test could pass without proving exploit.

### R3 — `fork-execution-state-asserted`
The PoC executes AND post-conditions are asserted.
- **Implementors:** Same as R2, but the test ends with `assert(attackerBalance > beforeBalance + threshold)` or equivalent.
- **Confidence ceiling:** 0.92
- **Cost:** minutes; modest RPC cost.
- **What it proves:** The attack accomplished a specific, measurable goal.
- **This is the default rung for most "real" findings.**
- **Applicable when:** the bug has measurable post-state.

### R4 — `fork-execution-with-mocked-actor`
PoC requires an external actor to behave adversarially. The harness mocks that actor.
- **Implementors:** `vm.prank()` (Foundry), Anchor's `provider.wallet`-style impersonation.
- **Confidence ceiling:** 0.88 (slightly lower than R3 because the mocked-actor assumption is a separate hypothesis).
- **Cost:** same as R3.
- **What it proves:** The attack works *if* the modeled actor is hostile.
- **Examples:** Compromised admin, governance proposer, oracle operator, signer set.
- **Required:** the finding must declare its `actor_assumptions` — what hostile behavior was assumed.

### R5 — `multi-tx-orchestrated`
PoC requires a sequence of transactions across multiple blocks/slots with state evolution between.
- **Implementors:** Foundry script with `vm.warp()` + sequential `vm.startPrank()` blocks; Anchor scripts with `await sleep(...)` against `solana-test-validator`.
- **Confidence ceiling:** 0.92
- **Cost:** minutes to tens of minutes.
- **What it proves:** Time-or-block-dependent attack chains succeed.
- **Examples:** Beanstalk governance attack, vesting cliff manipulation, two-step access changes.
- **Metadata required:** `tx_sequence` with block/slot offsets per step.

### R6 — `multi-fork-coordinated`
PoC requires synchronized state across multiple chains/forks.
- **Implementors:** Multi-anvil orchestration; cross-chain message replay simulators.
- **Confidence ceiling:** 0.85 (cross-chain ordering assumptions add uncertainty).
- **Cost:** tens of minutes; significant RPC cost.
- **What it proves:** Cross-chain bug exploitable under specific multi-chain ordering.
- **Examples:** Bridge replay attacks, Wormhole-class signature reuse, LayerZero cross-chain fee bugs.

### R7 — `mempool-replay`
PoC requires specific mempool ordering or pending-tx state.
- **Implementors:** mev-boost-style local builder; transaction-bundling tools.
- **Confidence ceiling:** 0.80
- **Cost:** modest; mempool simulation is tractable.
- **What it proves:** Front-runnable / back-runnable / sandwich-able under realistic mempool ordering.
- **Examples:** AMM sandwich attacks, oracle update front-running, governance vote-buying via tx ordering.

### R8 — `time-shifted`
PoC requires `evm_setNextBlockTimestamp` or block-warps to trigger time-dependent behavior.
- **Implementors:** Foundry `vm.warp()`; Anchor + clock-sysvar mocking.
- **Confidence ceiling:** 0.90
- **Cost:** same as R3.
- **What it proves:** Time-dependent invariant violation.
- **Examples:** Vesting cliffs, expiring approvals, oracle staleness, withdrawal cooldown bypasses.
- **Often combined with R5 (multi-tx + time-shifted).**

### R9 — `invariant-fuzz-counterexample`
A fuzzer (Echidna, Medusa, Foundry invariant tests) generates a sequence that breaks an invariant.
- **Implementors:** Echidna, Medusa, Foundry `invariant_*` tests, Trident (Solana).
- **Confidence ceiling:** 0.95 (high — the counterexample is concrete).
- **Cost:** hours of fuzz; high CPU cost.
- **What it proves:** A specific invariant is violable.
- **Differs from R3:** the validator IS the fuzzer; the PoC is the shrunken counterexample, not a hand-written test.
- **Required:** invariant must be specified ahead of time. The harness has invariant-synthesis agents that propose invariants for fuzzers.

### R10 — `formal-proof`
A symbolic execution / SMT solver / formal-method tool produces a proof of the bug.
- **Implementors:** Halmos, hevm, Move Prover.
- **Confidence ceiling:** 0.99
- **Cost:** very high; many bugs are out of scope (loops, dynamic dispatch, external calls).
- **What it proves:** Mathematically rigorous violation of a property.
- **Rare in practice** for full DeFi protocols but valuable for self-contained primitives.

### R-INFO — `applicable-but-unprovable`
The finding is informational by nature. No execution can prove the absence of an event emission, the inappropriate naming of a function, or a centralization risk.
- **Confidence ceiling:** 0.70 (relies entirely on agent + heuristic).
- **Examples:** Missing event, centralization risk, gas inefficiency, missing `onlyInitializing` modifier (when it's not actually exploited yet).

## Confidence ceiling summary

| Rung | Ceiling | Typical use |
|---|---|---|
| R0 | 0.60 | Pattern hits, low-stakes triage |
| R1 | 0.65 | PoC scaffolds compile |
| R2 | 0.75 | Reachability proven |
| R3 | 0.92 | Standard "real" findings |
| R4 | 0.88 | Admin-compromise class |
| R5 | 0.92 | Multi-tx attack chains |
| R6 | 0.85 | Cross-chain bugs |
| R7 | 0.80 | Mempool / MEV |
| R8 | 0.90 | Time-dependent |
| R9 | 0.95 | Invariant fuzz counterexample |
| R10 | 0.99 | Formal proof |
| R-INFO | 0.70 | Informational only |

## Per-finding ladder progression

Every finding declares two values: `highest_passed` and `highest_applicable`. The harness's escalation router monotonically attempts higher rungs until it either passes the highest applicable or hits a hard failure.

```
highest_applicable = max-applicable-for(class.taxonomy_id, subject.kind)
ladder_attempts:
  rung := next_rung(current)
  result := attempt(finding, rung)
  if result == pass: continue
  if result == fail-hard: terminate
  if result == fail-flaky: retry-once
  if rung == highest_applicable: terminate-success
```

The harness records every attempt, including failures, in `validation.rungs_attempted`.

## Audit-report tiers

Audit deliverables are tiered by the rungs cleared:

- **Tier S — Production audit:** all findings cleared R3 minimum, critical findings cleared R4+; informational findings tagged R-INFO.
- **Tier A — Pre-launch audit:** all findings cleared R2 minimum; critical findings cleared R3+.
- **Tier B — Continuous monitoring:** R0/R1 alerts surfaced as candidates; R3+ confirmations escalated.
- **Tier C — Triage / first-pass:** R0 only.

Clients buy a tier; the harness budgets accordingly.

## Validation tier vs cost

| Rung | Wall time | LLM cost | RPC/CPU cost |
|---|---|---|---|
| R0 | seconds | none | none |
| R1 | seconds | low (PoC scaffold) | none |
| R2 | seconds-minutes | low | low |
| R3 | minutes | low-medium | low-medium |
| R4 | minutes | medium | low-medium |
| R5 | minutes-tens | medium | medium |
| R6 | tens-minutes | medium | high (multi-RPC) |
| R7 | minutes | low | low |
| R8 | minutes | low | low |
| R9 | hours | low | very high (fuzz CPU) |
| R10 | hours-days | none (mostly) | very high (solver CPU) |

The escalation router uses this table when budgeting.

## Per-VM rung availability

| Rung | EVM | SVM | Move |
|---|---|---|---|
| R0 | Slither, Mythril, Aderyn | Soteria, custom Anchor-IDL | move-prover-lite |
| R1 | `forge build` | `anchor build` | `aptos move build` |
| R2 | `forge test --fork-url` | `solana-test-validator` + clone | `aptos move test` |
| R3 | `forge test` + assertions | `anchor test` + assertions | `aptos move test` + assertions |
| R4 | `vm.prank` | provider impersonation | signer mocking |
| R5 | `vm.warp` + tx sequence | sleep + sequence | block-version warp |
| R6 | multi-anvil | rare; multi-validator | rare |
| R7 | mev-boost simulation | banking-stage simulation (immature) | not yet |
| R8 | `vm.warp` | clock-sysvar mock | block-version |
| R9 | Echidna, Medusa | Trident (immature) | move-fuzz (early) |
| R10 | Halmos, hevm | (research-stage) | Move Prover |

When a rung's per-VM implementor is immature or absent, `highest_applicable` is capped accordingly. The schema reports this honestly.

## Per-class typical highest_applicable

Selected examples (full mapping in `bug-taxonomy.md`):

| Bug class | EVM highest_applicable | SVM highest_applicable |
|---|---|---|
| Reentrancy | R3 | N/A (no reentrancy on SVM) |
| Spot-price oracle manipulation | R5 (often R7 if MEV-relevant) | R5 |
| Access control bypass | R3 | R3 |
| Governance flash-loan attack | R5 | R5 |
| First-depositor inflation (ERC-4626) | R3 | not applicable |
| Diamond facet selector clash | R3 | not applicable |
| Bridge signature replay | R6 | R6 |
| Centralization risk (informational) | R-INFO | R-INFO |
| CPI authority confusion | not applicable | R3 |
| Missing PDA verification | not applicable | R3 |
| Type cosplay | not applicable | R3 |
| Move resource leak | not applicable | R3 (or R10 with Prover) |

## Open questions for v1

1. **Per-rung confidence ceiling values.** v0 picks reasonable defaults; v1 should empirically tune from the first 100 audits.
2. **Failure modes.** When a rung fails, how does the harness distinguish "false positive" from "harness bug" from "PoC scaffold limitation"? Currently relies on Skeptic agent judgment; needs more structure.
3. **Hybrid rungs.** Some findings need R5 + R8 + R7 combined (e.g., a time-dependent multi-tx mempool exploit). Is that one rung-tag or three?
4. **R10 cost ceilings.** Formal proof can run for days. Need a hard wall-clock cap and fallback to "couldn't prove."
5. **Continuous-monitoring rung policy.** Per-commit audits at R0–R3 by default; escalation only on confirmed-finding-class changes. Triggers TBD.
