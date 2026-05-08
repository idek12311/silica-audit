# 5. Parallelization Plan — Per-Block Worker Contracts

Anthropic's 4-field worker contract (`objective` / `output_format` / `tool_guidance` / `boundaries`) is **required per spawned worker** — vague subagent objectives are a documented failure mode. Per-phase reviewers also use the 4-field contract.

The default for the executor's main loop is **sequential**. Fan-out groups (A, B, C, D) below clear at least one of the three justification bars: ≥2× wall-time gain, main-context preservation, or security boundary.

## Group A — Spine schemas (P1, P2, P3)

**Justification (REQUIRED):** Three independent schema modules that share no code and write to disjoint paths. Sequential execution would take ~3× the wall time. Each worker has a narrow context (one schema doc to fill) so spawning them in parallel preserves main-context tokens. ≥2× wall-time gain confirmed.

**Mechanism:** parallel `Agent` calls (one message, multiple Agent blocks), `subagent_type: general-purpose`. Mode: independent fan-out (NOT debate; `debate-phase-too-large` cap does not apply).

**Fan-out budget:**
- `max_workers`: 3
- `per_worker_token_budget`: 120000
- `per_worker_tool_budget`: 80
- `aggregation_strategy`: none (each worker writes to its own subtree; orchestrator reads after all complete)
- `failure_policy`: continue-with-N-1
- `termination`: 1800s wall-clock per worker

**Worker A1 — `/root/Silica/src/finding/`**
```yaml
objective: Implement the Finding TypeScript types, Zod validators, and canonical_id (RFC 8785 + sha256) function per design/schema-draft-v0.md and the v0.1 off-chain extension in schema-stressors-v0.md.
output_format: |
  Files written: src/finding/schema.ts (TS interfaces + Zod), src/finding/canonical.ts (RFC 8785 + sha256),
  src/finding/lifecycle.ts (state transition handlers), tests/finding/{schema,canonical,lifecycle}.test.ts.
  Each file ≤300 lines. Final report at checkpoints/P1.md per template.
tool_guidance: |
  Read /root/Silica/design/schema-draft-v0.md and /root/Silica/design/schema-stressors-v0.md before any Edit.
  Use `code-with-tests-first` for the red-green-refactor loop. Use `codex` for the actual file writes.
  Use Zod patterns conventional in TypeScript projects (zod.dev). Do NOT browse other repos.
boundaries: |
  Do NOT touch src/validation/, src/heuristic/, tools/, db/, or any other phase's territory.
  Do NOT import from any tool layer or VM-specific code.
  Do NOT edit notes.md or design/* — those are read-only references.
  Do NOT read or browse any path outside /root/Silica/ — sister repos are off-limits per /root/Silica/spec/00-identity.md.
```

**Worker A2 — `/root/Silica/src/validation/`**
```yaml
objective: Implement the 11-rung Validation tier ladder TS interfaces, per-rung handler shells, and the per-VM implementor binding registry per design/validation-tiers.md.
output_format: |
  Files written: src/validation/tiers.ts (rung enum + ValidationRungHandler interface),
  src/validation/handlers/{R0..R10,R-INFO}.ts (per-rung shell that throws "not yet bound"),
  src/validation/registry.ts (per-VM implementor binding), tests/validation/*.test.ts.
  Each rung file ≤80 lines.
tool_guidance: |
  Read /root/Silica/design/validation-tiers.md before any Edit. Confidence ceilings per the table at validation-tiers.md:128.
  Use `code-with-tests-first`.
boundaries: |
  Do NOT bind actual handlers (Foundry / Anchor / etc.); those bind in P6 / P14.
  Do NOT touch src/finding/ or src/heuristic/ — they're owned by sibling workers in this group.
```

**Worker A3 — `/root/Silica/src/heuristic/` + `/root/Silica/db/migrations/`**
```yaml
objective: Implement the Heuristic schema TypeScript types, Postgres migrations, and three-pool storage interface per design/heuristic-schema.md and notes.md §17.4.
output_format: |
  Files written: src/heuristic/schema.ts (TS + Zod for Heuristic), src/heuristic/store.ts (CRUD + three-pool query),
  src/heuristic/lifecycle.ts (Proposed→Active→Deprecated transitions), db/migrations/0001_heuristic.sql,
  db/migrations/0002_finding.sql (so finding can reference heuristic by id+version),
  db/migrations/0003_audit.sql, db/migrations/0004_audit_event.sql, tests/heuristic/*.test.ts.
tool_guidance: |
  Read /root/Silica/design/heuristic-schema.md and the §17.4 three-pool model in notes.md.
  Postgres jsonb body + indexed columns (id, version, vm_scope[], category, deprecated, tenant_visibility).
  Use `code-with-tests-first`.
boundaries: |
  Do NOT seed any actual heuristics yet — that's P13 (EVM) and P16 (SVM).
  Do NOT touch src/finding/ or src/validation/.
```

## Group B — Tool layer (P4, P5, P6)

**Justification (REQUIRED):** Three independent tool wrappers writing to disjoint paths under tools/. Each has a different external dependency (Etherscan API, Slither Docker image, Foundry binary), so a failure in one doesn't block the others. Sequential ≈ 3× wall time. Container-build dependencies make ≥2× wall-time gain robust.

**Mechanism:** parallel `Agent` calls, `subagent_type: general-purpose`. Mode: independent fan-out.

**Fan-out budget:**
- `max_workers`: 3
- `per_worker_token_budget`: 150000
- `per_worker_tool_budget`: 100
- `aggregation_strategy`: none
- `failure_policy`: continue-with-N-1
- `termination`: 2400s wall-clock per worker

**Worker B1 — `/root/Silica/tools/source-fetch/`**
```yaml
objective: Implement the Etherscan + Sourcify source resolver, multi-Solc compile pipeline, and bytecode-equivalence check per notes.md §11 Tier 2 #1.
output_format: |
  Files: tools/source-fetch/fetch.py (resolves verified source from Etherscan/Sourcify),
  tools/source-fetch/compile.py (matches Solc version + optimizer settings; via foundry-forge or solcx),
  tools/source-fetch/equivalence.py (compares local-compile bytecode to on-chain),
  tools/source-fetch/Dockerfile, tools/source-fetch/tests/.
tool_guidance: |
  Use `code-with-tests-first`. Bench fixture: Euler at block 16817993 — must round-trip.
  Etherscan API key in env; Sourcify is open. Multi-Solc via solcx or forge svm.
boundaries: |
  Do NOT touch tools/slither/ or tools/foundry/ — sibling workers.
  Do NOT cache Etherscan results in committed fixtures (rate limits respected).
```

**Worker B2 — `/root/Silica/tools/slither/`**
```yaml
objective: Implement the Slither runner that executes Slither inside a Docker container with cgroups limits and emits Finding-context JSON per notes.md:619-625 §17.10 (container-level multi-tenant isolation policy).
output_format: |
  Files: tools/slither/run.py (driver: launches container, mounts source read-only, captures JSON),
  tools/slither/Dockerfile (slither + dependencies), tools/slither/normalize.py (Slither JSON → context bundle),
  tools/slither/tests/. Container limits: 4GB RAM, 2 CPU, 300s timeout, no network egress (allow-list empty for static-only tool).
tool_guidance: |
  Use `code-with-tests-first`. Sample input: a single-file Solidity contract with one detectable bug.
  Slither CLI: `slither contracts/ --json -` then parse stdout JSON. Read /root/Silica/notes.md:619-625 for the exact isolation policy.
boundaries: |
  Do NOT touch tools/source-fetch/ or tools/foundry/ — sibling workers.
  Do NOT modify the Slither package itself; only wrap.
```

**Worker B3 — `/root/Silica/tools/foundry/`**
```yaml
objective: Implement the Foundry runner that forks mainnet at a specific block, runs forge test, and emits state-snapshot artifacts per design/validation-tiers.md R2/R3.
output_format: |
  Files: tools/foundry/run.py (anvil --fork-url --fork-block-number; forge test; capture trace),
  tools/foundry/anvil-pool.py (instance pool with cleanup), tools/foundry/state-snapshot.py,
  tools/foundry/Dockerfile, tools/foundry/tests/. Per-test wall-clock cap: 600s.
tool_guidance: |
  Use `code-with-tests-first`. Bench fixture: a synthetic forge test that asserts a state change.
  Use Alchemy archive RPC env var; fall back to public RPC for non-archive blocks.
boundaries: |
  Do NOT touch tools/source-fetch/ or tools/slither/ — sibling workers.
  Do NOT enable anvil debug methods (anvil_setStorageAt) for validation runs — only dev profile.
```

## Group C — EVM hardening (P12, P13)

**Justification (REQUIRED):** Bench cases and heuristics are independent of each other and write to disjoint paths (`bench/cases/evm/` vs `heuristics/baseline/evm/`). Each case is itself a slice; parallelizing across cases gives ≥2× wall-time win on what would otherwise be a long sequential phase.

**Mechanism:** parallel `Agent` calls, `subagent_type: general-purpose`. Mode: independent fan-out.

**Fan-out budget:**
- `max_workers`: 2
- `per_worker_token_budget`: 320000
- `per_worker_tool_budget`: 200
- `aggregation_strategy`: none
- `failure_policy`: continue-with-N-1
- `termination`: 3000s wall-clock per worker

**Worker C1 — `/root/Silica/bench/cases/evm/` + 5 case fixtures**
```yaml
objective: Wire 5 additional EVM bench cases (Cream Oct 2021, Beanstalk Apr 2022, Wormhole-EVM Feb 2022, Nomad Aug 2022, Curve/Vyper Jul 2023) end-to-end through the orchestrator, each with state-asserted PoC. Heuristic citations in expected-finding.json reference IDs from the P11-authored convention file.
output_format: |
  Files: bench/cases/evm/{cream,beanstalk,wormhole-evm,nomad,curve-vyper}/{fixture.json,exploit.t.sol,expected-finding.json},
  bench/run-evm.ts (runner that walks all cases), checkpoints/P12.md.
tool_guidance: |
  READ bench/heuristic-id-convention.md FIRST — this is the stable C1↔C2 contract written in P11. expected-finding.json heuristics_cited entries reference IDs from that convention.
  Read research/case-studies/{cream-october-2021,beanstalk-april-2022,wormhole-february-2022,nomad-august-2022,curve-vyper-july-2023}.md for the lessons-for-Silica section in each.
  Use the bench/cases/evm/euler/ template established in P11. Use `code-with-tests-first` per case.
  Etherscan-verified addresses + exploit tx hashes are in research/bench-corpus.md (some marked [verify]; resolve as needed).
boundaries: |
  Do NOT modify the orchestrator, agents, or tool layer — those are stable inputs.
  Do NOT add cases beyond the 5 named — scope discipline.
  Do NOT touch heuristics/baseline/ — sibling worker C2 owns it.
  Do NOT modify bench/heuristic-id-convention.md — it is a frozen P11 deliverable.
```

**Worker C2 — `/root/Silica/heuristics/baseline/evm/` (30 heuristics)**
```yaml
objective: Seed 30 EVM baseline heuristics from research/bug-taxonomy.md, each with a regression case attached, persisted to the heuristic table at status=Active. Heuristic IDs follow the convention defined in bench/heuristic-id-convention.md (authored in P11; stable input by the time Group C runs).
output_format: |
  Files: heuristics/baseline/evm/HEUR-*.json (30 files), heuristics/baseline/evm/regression/HEUR-*.t.sol (one per heuristic),
  scripts/seed-heuristics.ts (loads JSONs into Postgres), checkpoints/P13.md.
tool_guidance: |
  READ bench/heuristic-id-convention.md FIRST — this is the stable C1↔C2 contract written in P11. HEUR-* IDs follow the prefix scheme there (e.g., DEFI-ACCESS-CONTROL-* → HEUR-AC-NN, DEFI-ORACLE-* → HEUR-ORACLE-NN).
  Pick the 30 highest-impact entries from research/bug-taxonomy.md (skim categories: Access Control, Reentrancy,
  Arithmetic, Oracle, Flash-Loan, Governance, Proxy, Cross-Contract, Bridge, Token-Standard).
  Each heuristic's regression case is a synthetic vulnerable contract that triggers the heuristic.
  Use `code-with-tests-first` for each pair (heuristic + regression).
boundaries: |
  Do NOT touch bench/cases/ — sibling worker C1 owns it.
  Do NOT include SVM heuristics — those are P16.
  Do NOT modify bench/heuristic-id-convention.md — it is a frozen P11 deliverable.
```

## Group D — Off-chain perimeter (P17, P18)

**Justification (REQUIRED):** Surface-class boundaries (frontend taint vs network scanners vs OSINT) are genuinely independent technical work and disjoint paths under tools/perimeter/. Parallelization saves ≥2× wall-time on what is otherwise a long single-author phase.

**Mechanism:** parallel `Agent` calls, `subagent_type: general-purpose`. Mode: independent fan-out.

**Fan-out budget:**
- `max_workers`: 2
- `per_worker_token_budget`: 220000
- `per_worker_tool_budget`: 140
- `aggregation_strategy`: none
- `failure_policy`: continue-with-N-1
- `termination`: 2400s wall-clock per worker

**Worker D1 — `/root/Silica/tools/perimeter/frontend/` + `/root/Silica/tools/perimeter/rpc/` + `/root/Silica/src/scope/`**
```yaml
objective: Implement the frontend wallet-call taint analyzer, RPC node fingerprinter, and the scope-artifact authorization primitive per ops/perimeter-playbook.md Surfaces 1 and 3, with container isolation per notes.md:619-625 §17.10.
output_format: |
  Files: tools/perimeter/frontend/{run.py,taint.ts,Dockerfile}, tools/perimeter/rpc/{run.py,fingerprint.py,Dockerfile},
  src/scope/{artifact.ts,store.ts,enforce.ts}, tests/.
  Container limits per Dockerfile + run.py orchestration: 2GB RAM, 1 CPU, 300s timeout, network egress allow-list = [target domain only for frontend; target IP/port only for RPC]. Frontend container runs Playwright with --no-sandbox disabled (Playwright needs sandbox); use Docker user namespace isolation.
tool_guidance: |
  Frontend: Playwright + AST analysis on bundled JS via source-maps. Synthetic injection sandbox for BadgerDAO-style detection.
  RPC: nmap + custom JSON-RPC method enumeration. Scope artifact: Zod schema, Postgres-backed.
  Use `code-with-tests-first`. Read /root/Silica/notes.md:619-625 for isolation requirements before authoring Dockerfiles.
boundaries: |
  Do NOT touch tools/perimeter/{subdomain,ci-secrets,multisig}/ — sibling worker D2 owns them.
  Off-chain agents must refuse to run without an active scope artifact (enforce.ts gate).
  Container egress allow-list MUST be enforced at run.py invocation; missing allow-list → fail-closed.
```

**Worker D2 — `/root/Silica/tools/perimeter/{subdomain,ci-secrets,multisig}/`**
```yaml
objective: Implement subdomain takeover detection, CI/CD secret scanner, and multisig signer OSINT per ops/perimeter-playbook.md Surfaces 2, 4, 5, with container isolation per notes.md:619-625 §17.10.
output_format: |
  Files: tools/perimeter/subdomain/{run.py,Dockerfile}, tools/perimeter/ci-secrets/{run.py,Dockerfile},
  tools/perimeter/multisig/{run.py,Dockerfile,osint-resolvers.py}, tests/.
  Container limits per Dockerfile: 2GB RAM, 1 CPU, 600s timeout (multisig OSINT may need extended time for ENS/Etherscan calls). Network egress allow-list: subdomain → DNS resolvers + target nameservers; ci-secrets → none for offline scan, github.com only for live GH API mode; multisig → Etherscan API endpoint, ENS resolver, and any user-configured OSINT data sources from scope_artifact.osint_endpoints.
tool_guidance: |
  Subdomain: subfinder + amass + dnsx + nuclei subdomain-takeover templates.
  CI secrets: trufflehog + gitleaks + Docker layer extraction (skopeo/dive).
  Multisig: on-chain Safe.getOwners(), ENS resolution, Etherscan name tags. Provide BOTH live (Etherscan API) and mock (fixtures) modes; tests use mock; production uses live behind scope_artifact_id.
  Use `code-with-tests-first`. Each surface emits Finding-shape JSON.
boundaries: |
  Do NOT touch tools/perimeter/frontend/ or tools/perimeter/rpc/ — sibling worker D1 owns them.
  Do NOT scan any out-of-scope target; scope_artifact_id check is mandatory.
  Container egress allow-list MUST be enforced; missing allow-list → fail-closed.
```

## Per-phase adversarial review (every `*.review` checkbox)

**Review worker template:**
```yaml
objective: Apply the bob:873-883 Six-Layer Review Framework to <phase artifact>, returning a verdict (approve | proceed-with-changes | block) with file:line evidence per finding.
output_format: |
  Markdown report at /root/Silica/spec/checkpoints/<phase-id>.review.md with sections per Layer 1-6 and a final ## Verdict line.
  Verdict line literal: "verdict: approve" | "verdict: proceed-with-changes" | "verdict: block".
tool_guidance: Read only — no Edit/Write outside the checkpoint file. Use Grep/Glob/Read on /root/Silica/.
boundaries: Do not run the artifact. Do not propose unrelated improvements. Stop after the six layers. Do not modify any source file under /root/Silica/src/, /root/Silica/tools/, /root/Silica/db/, or /root/Silica/bench/.
```

Per-phase reviewer instances are spawned independently per phase ID; each writes to a unique checkpoint file (`P0.review.md`, `P1.review.md`, …, `P20.review.md`) so no shared-mutable-state collision arises.

## Trust-tier surfacing in agent contracts (P9 / P15)

Per `notes.md:541` (§17.3 trust-tier locked decision), every agent prompt MUST declare its tenant's trust tier (`anthropic-no-retention | self-hosted-vllm`) at invocation time. The model router consumes the tier when picking the LLM endpoint.

P9 worker contracts (Analyzer, Prover, Skeptic):
- Each agent's prompt scaffold takes a `trust_tier` parameter.
- `trust_tier == 'self-hosted-vllm'` → model router routes to local vLLM endpoint with open-weights model (Llama 4 / Mistral / DeepSeek per `notes.md:541`).
- `trust_tier == 'anthropic-no-retention'` → model router routes to Anthropic with no-retention enterprise contract.
- Agents emit `trust_tier_used` field in their AgentProvenance evidence per `01-use-case-frame.md` Contract A so audits trace which tier each finding was produced under.

P15 worker contracts (SVM specialist agents):
- Same trust-tier parameter; same routing rule.

The trust-tier contract is verified at P9.test and P15.test — at least one synthetic audit must run end-to-end with `trust_tier == 'self-hosted-vllm'` and produce a Finding tagged with `trust_tier_used == 'self-hosted-vllm'`.

## Anti-fan-out justifications (where chose sequential)

- **P0 (pre-flight):** single coordinated artifact (CLAUDE.md + scaffolding); one writer's voice; sequential.
- **P7 (LLM gateway), P8 (5 routers), P9 (3 agents), P10 (orchestrator):** strict data dependency chain — gateway feeds routers, routers feed agents, agents feed orchestrator. Parallelization would invent fake independence.
- **P11 (first end-to-end):** single integration milestone; sequential by definition (Euler is the canonical first case).
- **P14, P15, P16 (SVM track):** strict dependency chain — tools then agents then bench cases. Each builds on prior.
- **P19 (heuristic library):** single-author narrative ties storage + mining + drift together; any fan-out risks shared-mutable-state on the heuristic table.
- **P20 (publication + acceptance gate):** final gate; sequential coordination.
