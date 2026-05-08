# 4. Phase Map — DAG with Completion Checkboxes

This is the executor's worklist. Walk it row by row. Honor `depends_on`. Items sharing a `parallel_group` letter run concurrently per `04-parallelization-plan.md`.

## Phase table

| ID | Phase | Skill / Action | depends_on | parallel_group | tool_budget | token_budget |
|----|-------|----------------|------------|----------------|-------------|--------------|
| P0 | Pre-flight: repo init, language locks, CLAUDE.md, CI | `write-agent-rules` + `codex` for scaffolding | — | — | 60 calls | 80k |
| P1 | Finding schema (TS + Zod + canonical_id) | `plan-feature-architecture` → `code-with-tests-first` → `codex` | P0 | A | 80 calls | 120k |
| P2 | Validation tier ladder (TS interfaces + per-rung handler shells) | same triad | P0 | A | 60 calls | 90k |
| P3 | Heuristic schema (TS + Postgres migrations + three-pool storage) | same triad | P0 | A | 80 calls | 120k |
| P4 | Source fetcher (Etherscan + Sourcify + multi-Solc compile + bytecode-equivalence) | `plan-feature-architecture` → `code-with-tests-first` → `codex` | P1 | B | 100 calls | 150k |
| P5 | Slither runner (Docker-sandboxed; JSON output normalization) | same triad | P1 | B | 80 calls | 100k |
| P6 | Foundry runner (anvil fork, forge test, state-snapshot fixture) | same triad | P1, P2 | B | 100 calls | 130k |
| P7 | LLM gateway (Anthropic SDK + prompt caching + trust-tier model router) | `claude-api` + `code-with-tests-first` + `codex` | P0 | — | 80 calls | 130k |
| P8 | Five routers (tool / escalation / model / agent / validation) wired | `plan-feature-architecture` → `code-with-tests-first` → `codex` | P1, P2, P3, P5, P6, P7 | — | 120 calls | 180k |
| P9 | Three baseline agents (Analyzer, Prover, Skeptic) with prompts and role contracts | `code-with-tests-first` + `codex` | P7, P8 | — | 140 calls | 220k |
| P10 | Orchestrator (audit-job state machine + checkpoints + budget enforcement) | `plan-feature-architecture` → `code-with-tests-first` → `codex` | P3, P8, P9 | — | 100 calls | 160k |
| P11 | First end-to-end EVM audit on Euler bench case (RED then GREEN); also ships `bench/heuristic-id-convention.md` (the C1↔C2 coordination contract for Group C) | `code-with-tests-first` end-to-end | P4, P5, P6, P10 | — | 120 calls | 200k |
| P12 | 5 more EVM bench cases (Cream, Beanstalk, Wormhole-EVM, Nomad, Curve/Vyper) | `code-with-tests-first` per case | P11 | C | 200 calls | 320k |
| P13 | 30 EVM baseline heuristics seeded from bug-taxonomy with regression cases | `code-with-tests-first` per heuristic | P11 | C | 180 calls | 280k |
| P14 | SVM tool layer (Soteria + Anchor IDL analyzer + anchor-test runner + Trident) | `plan-feature-architecture` → `code-with-tests-first` → `codex` | P10 | — | 140 calls | 220k |
| P15 | SVM specialist agents — 7 bug classes (CPI-authority, missing-signer-check, account-cosplay, sysvar-spoofing, arbitrary-CPI, missing-owner-check, duplicate-account-mutable) | `code-with-tests-first` + `codex` | P14 | — | 120 calls | 220k |
| P16 | 5 SVM bench cases (Cashio, Wormhole-Solana, Mango, OptiFi, Crema) + 10 SVM heuristics | `code-with-tests-first` per case | P15 | — | 180 calls | 280k |
| P17 | Off-chain perimeter — frontend taint analyzer + scope artifact + RPC fingerprinter | `plan-feature-architecture` → `code-with-tests-first` → `codex` | P10 | D | 140 calls | 220k |
| P18 | Off-chain perimeter — subdomain enum + CI key scan + multisig OSINT | `code-with-tests-first` + `codex` | P10 | D | 140 calls | 220k |
| P19 | Heuristic library — three-pool storage + mining agent + drift monitor | `plan-feature-architecture` → `code-with-tests-first` → `codex` | P3, P13, P16 | — | 120 calls | 180k |
| P20 | Open-source publication (bench corpus + eval framework + baseline agent) + final acceptance gate | `codex` + `review-ai-code` whole-spec | P12, P13, P16, P17, P18, P19 | — | 100 calls | 160k |

## Completion checkboxes

- [ ] **P0** — Pre-flight: repo init, language locks, CLAUDE.md, CI
  - [ ] P0.review — Fresh Agent reviews CLAUDE.md against `write-agent-rules/SKILL.md:26-37` required-sections list and `notes.md:493-580` (§17 locked decisions, where repo conventions are codified)
  - [ ] P0.test — All §A acceptance commands exit 0

- [ ] **P1** — Finding schema (TS + Zod + canonical_id)
  - [ ] P1.review — Fresh Agent reviews against `design/schema-draft-v0.md:1-440` and `schema-stressors-v0.md:1-557`
  - [ ] P1.test — `npm run typecheck` and `npm run test:unit -- src/finding/` exit 0

- [ ] **P2** — Validation tier ladder
  - [ ] P2.review — Fresh Agent reviews against `design/validation-tiers.md:13-198`
  - [ ] P2.test — `npm run test:unit -- src/validation/` exits 0; all 11 rungs + R-INFO have handler shells

- [ ] **P3** — Heuristic schema + Postgres migrations
  - [ ] P3.review — Fresh Agent reviews against `design/heuristic-schema.md:21-243` and `notes.md` §17.4 (three-pool model)
  - [ ] P3.test — `npm run test:unit -- src/heuristic/` exits 0; `psql` reads heuristic table successfully

- [ ] **P4** — Source fetcher
  - [ ] P4.review — Fresh Agent reviews against `notes.md` §11 Tier 2 #1 and `design/schema-draft-v0.md:115-130` toolchain manifest
  - [ ] P4.test — `npm run test:integration -- tools/source-fetch/` resolves Euler block 16817993 and exits 0

- [ ] **P5** — Slither runner (Docker-sandboxed)
  - [ ] P5.review — Fresh Agent reviews container isolation and output schema against `notes.md:619-625` (§17.10 multi-tenant isolation, container-level for tools)
  - [ ] P5.test — `npm run test:integration -- tools/slither/` runs Slither in Docker, emits JSON, and exits 0; container has correct cgroups limits

- [ ] **P6** — Foundry runner
  - [ ] P6.review — Fresh Agent reviews against `validation-tiers.md:36-69` (R2/R3 implementor) and `notes.md` §11 Tier 2 #12 (fork realism)
  - [ ] P6.test — `npm run test:integration -- tools/foundry/` forks mainnet at a fixed block, runs forge test, exits 0

- [ ] **P7** — LLM gateway
  - [ ] P7.review — Fresh Agent reviews against `notes.md` §17.3 (trust tiers) and `claude-api` skill body for prompt caching
  - [ ] P7.test — `npm run test:unit -- src/llm/` exits 0; integration test confirms prompt cache hit on second call

- [ ] **P8** — Five routers wired
  - [ ] P8.review — Fresh Agent reviews each router against `notes.md` §6 (5 routers) and `design/cost-model.md:144-152`
  - [ ] P8.test — `npm run test:unit -- src/router/` exits 0; integration test confirms routing decisions for sample finding

- [ ] **P9** — Three baseline agents
  - [ ] P9.review — Fresh Agent reviews each agent's prompt and role contract; checks for prompt-injection defense (hostile-input invariant)
  - [ ] P9.test — `npm run test:integration -- src/agents/{analyzer,prover,skeptic}/` exits 0; agents emit Finding-shape JSON

- [ ] **P10** — Orchestrator state machine
  - [ ] P10.review — Fresh Agent reviews state transitions against L4 Contract E (`01-use-case-frame.md`) and budget enforcement against `design/cost-model.md:111-119` (Budget enforcement section)
  - [ ] P10.test — `npm run test:integration -- src/orchestrator/` runs a synthetic audit through all states and exits 0

- [ ] **P11** — First end-to-end EVM audit on Euler
  - [ ] P11.review — Fresh Agent reviews the Euler reproduction against `research/case-studies/euler-march-2023.md` lessons-for-Silica section
  - [ ] P11.test — RED gate: `npm run bench:evm -- --case euler` shows ≥1 FAIL initially. GREEN gate: post-implementation, the Euler case PASSES with state-asserted PoC

- [ ] **P12** — 5 more EVM bench cases
  - [ ] P12.review — Fresh Agent reviews each new case against the corresponding `research/case-studies/*.md` file
  - [ ] P12.test — `npm run bench:evm` passes ≥5 of 6 cases (≥83% recall on EVM corpus); `python3 bench/check.py --evm --max-fp-rate 0.30` exits 0

- [ ] **P13** — 30 EVM baseline heuristics
  - [ ] P13.review — Fresh Agent reviews 30 heuristics against `research/bug-taxonomy.md` entries; each has a regression case attached
  - [ ] P13.test — `psql` count of active EVM heuristics ≥30; bench cases cite at least one heuristic each

- [ ] **P14** — SVM tool layer
  - [ ] P14.review — Fresh Agent reviews against `design/multi-vm-svm-sketch.md:79-155` and confirms zero EVM imports leak into SVM-specific code
  - [ ] P14.test — `npm run test:integration -- tools/anchor/` runs anchor-test against a synthetic Solana program and exits 0

- [ ] **P15** — SVM specialist agents (7 bug classes)
  - [ ] P15.review — Fresh Agent reviews SVM agents' prompts against `multi-vm-svm-sketch.md:55-100` all 7 bug classes (SVM-CPI-AUTHORITY-CONFUSION, SVM-MISSING-SIGNER-CHECK, SVM-ACCOUNT-TYPE-COSPLAY, SVM-SYSVAR-SPOOFING, SVM-ARBITRARY-CPI, SVM-MISSING-OWNER-CHECK, SVM-DUPLICATE-ACCOUNT-MUTABLE)
  - [ ] P15.test — `npm run test:integration -- src/agents/svm-*/` exits 0; ≥7 SVM specialist agent modules exist

- [ ] **P16** — 5 SVM bench cases + 10 SVM heuristics
  - [ ] P16.review — Fresh Agent reviews each case against `research/bench-corpus.md` Solana-specific entries and the relevant case studies
  - [ ] P16.test — `npm run bench:svm` passes ≥3 of 5 (≥60% recall); ≥10 active SVM heuristics in `psql`

- [ ] **P17** — Off-chain perimeter (frontend + RPC + scope artifact)
  - [ ] P17.review — Fresh Agent reviews against `ops/perimeter-playbook.md` Surfaces 1, 3 + authorization workflow
  - [ ] P17.test — `npm run test:integration -- tools/perimeter/{frontend,rpc}/` exits 0; synthetic BadgerDAO injection sandbox detects swap

- [ ] **P18** — Off-chain perimeter (subdomain + CI keys + multisig OSINT)
  - [ ] P18.review — Fresh Agent reviews against `ops/perimeter-playbook.md` Surfaces 2, 4, 5 + scope enforcement
  - [ ] P18.test — `npm run test:integration -- tools/perimeter/{subdomain,ci-secrets,multisig}/` exits 0; scope enforcement test confirms refusal without scope artifact

- [ ] **P19** — Heuristic library: three-pool storage + mining + drift monitor (flat files in `src/heuristic/`)
  - [ ] P19.review — Fresh Agent reviews against `design/heuristic-schema.md:120-200` (mining policies, drift monitoring) and `notes.md` §17.4
  - [ ] P19.test — `npm run test:integration -- src/heuristic/` exits 0 (covers `store.ts`, `mining.ts`, `drift.ts`, `sanitization.ts` siblings); mining agent proposes a heuristic from a synthetic finding; drift monitor flags a regression-case-failing heuristic

- [ ] **P20** — Open-source publication + final acceptance gate
  - [ ] P20.review — Whole-skill `review-ai-code` six-layer adversarial review of the entire repo against the spec; verdict must be `approve` (or `proceed-with-changes` with ≤3 findings, none security or API integrity)
  - [ ] P20.test — Walk every criterion §A through §O in `02-acceptance-criteria.md` and confirm each exits 0; `validate_spec.py --strict` exits 0

## Status query

```bash
python3 - <<'PY'
import re, pathlib
text = pathlib.Path('/root/Silica/spec/03-phase-map.md').read_text()
parent = re.compile(r'^- \[(?P<box>[ x])\] \*\*(?P<id>P\d+[a-z]?)\*\*', re.M)
review = re.compile(r'^  - \[(?P<box>[ x])\] (?P<id>P\d+[a-z]?)\.review', re.M)
test   = re.compile(r'^  - \[(?P<box>[ x])\] (?P<id>P\d+[a-z]?)\.test',   re.M)
parents = {m.group('id'): m.group('box') == 'x' for m in parent.finditer(text)}
reviews = {m.group('id'): m.group('box') == 'x' for m in review.finditer(text)}
tests   = {m.group('id'): m.group('box') == 'x' for m in test.finditer(text)}
done = [p for p, ok in parents.items() if ok and reviews.get(p) and tests.get(p)]
print('DONE:', sorted(done))
print('OPEN:', sorted(set(parents) - set(done)))
PY
```
