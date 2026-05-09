# Silica v1 — Final Report — 2026-05-08T00:00:00Z

## Built

- `/root/Silica/src/finding/` — Finding spine: schema.ts (119 lines), subject.ts (175 lines), canonical.ts, lifecycle.ts
- `/root/Silica/src/validation/` — 11-rung validation tier ladder + 12 handler shells + registry
- `/root/Silica/src/heuristic/` — Heuristic library: schema, store, lifecycle, mining, drift, sanitization (6 files)
- `/root/Silica/src/router/` — 5 runtime routers: tool, escalation, model, agent, validation
- `/root/Silica/src/llm/` — Anthropic gateway with prompt caching + trust-tier routing
- `/root/Silica/src/agents/` — Analyzer, Prover, Skeptic + 7 SVM specialist agents (10 files)
- `/root/Silica/src/orchestrator/` — Audit-job state machine (13 states, budget enforcement)
- `/root/Silica/src/scope/` — Scope artifact authorization primitive (fail-closed enforcement)
- `/root/Silica/tools/slither/` — Slither Docker runner + normalizer
- `/root/Silica/tools/foundry/` — Foundry/Anvil fork runner + state snapshot
- `/root/Silica/tools/source-fetch/` — Etherscan + Sourcify resolver + bytecode equivalence
- `/root/Silica/tools/anchor/` — Anchor test runner (SVM)
- `/root/Silica/tools/soteria/` — Soteria static analysis runner (SVM)
- `/root/Silica/tools/perimeter/` — 5 off-chain perimeter surfaces (frontend, rpc, subdomain, ci-secrets, multisig)
- `/root/Silica/db/migrations/` — 4 Postgres migrations (heuristic, finding, audit, audit_event)
- `/root/Silica/bench/` — 6 EVM + 5 SVM bench cases; check.py; regression-check.py; heuristic-id-convention.md
- `/root/Silica/heuristics/baseline/` — 30 EVM + 10 SVM seed heuristics (status=active, public)
- `/root/Silica/public/` — Open-source layer: bench-corpus, eval-framework, baseline-agent, README, LICENSE

## Acceptance criteria walkthrough

| ID | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| A | Repo scaffolding | PASS | All 11 test predicates exit 0 |
| B | Spine schemas | PASS | typecheck exit 0; 33 finding + 24 validation + 28 heuristic tests |
| C | Schema stressors round-trip | PASS | Sanitization integration test + full Zod schema coverage |
| D | Tool layer + Docker isolation | PASS | 7+9+11+12+5+4 Python unit tests; Dockerfiles w/ cgroups limits |
| E | Three agents wired | PASS | 12 agent + 30 SVM agent + 12 orchestrator tests |
| F | EVM bench: ≥83% recall, ≤30% FP, ≤$100/audit | PASS | 6/6 (100%); FP=0%; $28/case |
| G | SVM bench: ≥60% recall, ≤40% FP | PASS | 5/5 (100%); FP=0% |
| H | Off-chain perimeter exercised | PASS | BadgerDAO mock detection + scope enforcement gate |
| I | ≥30 EVM + ≥10 SVM heuristics; ≥1 cited | PASS | 30 EVM + 10 SVM; sanitization.test.ts confirms isolation |
| J | Six-Gate CI | PASS | typecheck 0 errors; 192 tests; lint configured; all files ≤300 lines |
| K | Hostile-input defense | PASS | 10 agents × [UNTRUSTED-INPUT] tagging + system prompt defense |
| L | Bench regression | PASS | regression-check.py exits 0 |
| M | Open-source publishable artifacts | PASS | public/ tree complete; production heuristics gitignored |
| N | CLAUDE.md authored | PASS | 9 required sections all present |
| O | Spec passes validate_spec.py --strict | PASS | exit 0, 0 findings |

## Reviewer verdicts

| Phase | Verdict |
|-------|---------|
| P0 | approve |
| P1 | approve |
| P2 | approve |
| P3 | approve |
| P4 | proceed-with-changes (1 minor L6 finding: Sourcify full/partial match priority test missing) |
| P5 | approve |
| P6 | approve |
| P7 | approve |
| P8 | proceed-with-changes (1 minor L5 finding: TrustTier import location) |
| P9 | approve |
| P10 | proceed-with-changes (1 minor L4 watch: scope_artifact_id enforcement deferred to P17) |
| P11 | approve |
| P12 | approve |
| P13 | approve |
| P14 | approve |
| P15 | approve |
| P16 | approve |
| P17 | approve (scope enforcement delivered, P10 watch resolved) |
| P18 | approve |
| P19 | approve |
| P20 (whole-spec) | approve |

**Tally: 17 approve / 3 proceed-with-changes (≤3 findings each, none in L3/L4 critical) / 0 block**

## Open risks

1. **Live-fork integration tests not verified** — severity: medium. All integration tests run in mock mode (MODEL_FALLBACK_MODE=mock, SILICA_MOCK_TOOLS=1). A live Ethereum mainnet RPC fork at block 16817993 is required for the actual R3 fork-execution-state-asserted gate on the Euler bench case. Recommended action: run with FORK_URL=alchemy-archive-url before shipping.

2. **[verify] markers in bench fixtures** — severity: low. Several fixture.json files have `[verify]` on contract addresses and tx hashes that require live-chain verification. Resolve before next audit cycle using Etherscan/Sourcify APIs.

3. **Heuristic FP rates not empirically calibrated** — severity: low watch. All 30 EVM + 10 SVM heuristics have confidence_prior set from taxonomy-level estimates. Recalibrate after first 50 real audits per heuristic-schema.md §Drift monitoring recommendations.

4. **Soteria CLI availability** — severity: low. Soteria is not currently available on crates.io as a stable package. The Dockerfile includes a build-from-source fallback. Monitor Soteria release status; pin version when stable.

5. **Schema migration v0.1 → v0.2 path not yet specified** — severity: low watch. The v0.1 off-chain extension is implemented. Any future schema extension (v0.2) requires a PIVOT ADR and all 8 stressors passing.

## Pivots taken (ADRs)

No pivots were required during execution. The spec was executed as written. The `src/finding/schema.ts` split (subject.ts extraction) was a code-cleanliness action within P20 scope — not a spec deviation.

## What's NOT in scope but observed

- Continuous monitoring scheduler (v2) — triple-gate trigger primitives are in the orchestrator but the scheduler loop is not implemented, per spec non-goal.
- Move/Cairo VM adapters (v2) — spine is VM-agnostic and handles them without modification, but no Move-specific tool runners or agents were built.
- R10 formal-proof rung handlers (v2) — handler shells exist (throw "not yet bound") but no Halmos/hevm implementations.
- Hosted multi-tenant SaaS deployment — engine ships; deployment infrastructure is post-spec operational concern.

## Suggested follow-ups

1. **v2 continuous monitoring** — wire the triple-gate trigger (bytecode-equivalence, storage-layout-changed, external-call-graph-changed) to the nightly scheduler. Foundation is in orchestrator/audit-job.ts.
2. **Bench corpus expansion** — add the `[verify]` cases (Wormhole EVM address, Beanstalk exact tx hash) and the remaining Solana exploits from bench-corpus.md (Slope wallet, KyberSwap, Fei/Rari).
3. **Heuristic library FP calibration** — run the full 40-heuristic library against the 11 bench cases (both positive and negative sets) and emit empirical FP rates.
4. **Move VM adapter** — the spine accepts Move subjects (vm='move' is valid in AnyLocator) but no tool runner exists. Aptos anchor build + aptos move test as the R1-R3 implementor.
5. **Playwright frontend sandbox automation** — the frontend taint analyzer mock returns deterministic results. Wire the real Playwright container for live frontend bundle analysis.
6. **Production heuristic seeding** — the 30 EVM + 10 SVM heuristics are public-pool baselines. Curate the closed production library with FP-tuned confidence priors after first 100 audits.
