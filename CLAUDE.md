# CLAUDE.md

You are working in **Silica** — a VM-agnostic smart-contract vulnerability platform (EVM + SVM + off-chain perimeter). Follow these rules every session.

## Project shape

- **Languages:** TypeScript 5.x (orchestrator, spine, routers, agents) + Python 3.11 (tool runners under `tools/`)
- **Frameworks:** Zod (schema validation), Vitest (test runner), tsx (dev runner), Prisma-style raw SQL migrations
- **Test runner:** `npm run test` (Vitest, forks pool, no file parallelism) for TS; `pytest` for Python tool tests
- **Type checker:** `npm run typecheck` (tsc --noEmit strict); `mypy --strict` for Python
- **Linter:** `npm run lint` (ESLint @typescript-eslint); `ruff check` for Python
- **Top-level layout:**
  - `src/finding/` — Finding spine: schema, canonical_id, lifecycle (domain primitives)
  - `src/validation/` — 11-rung ValidationRungHandler interface + per-rung shells (domain)
  - `src/heuristic/` — Heuristic schema, three-pool store, mining agent, drift monitor (domain)
  - `src/scope/` — Scope artifact: authorization primitive for off-chain perimeter (application)
  - `src/router/` — Five runtime routers: tool/escalation/model/agent/validation (application)
  - `src/llm/` — Anthropic gateway + trust-tier model router (infrastructure adapter)
  - `src/agents/` — Analyzer, Prover, Skeptic + SVM specialist agents (application, calls gateway)
  - `src/orchestrator/` — Audit-job state machine + budget enforcement (application)
  - `src/store/` — Postgres persistence adapters for findings, audits, events (infrastructure)
  - `tools/` — Python Docker-sandboxed runners: slither, foundry, source-fetch, anchor, perimeter/*
  - `db/migrations/` — Plain SQL migrations (Postgres schema)
  - `bench/` — Bench corpus fixtures + regression harness
  - `heuristics/baseline/` — Open-source seed heuristics (EVM + SVM)
  - `heuristics/production/` — Gitignored; never committed

## Architecture posture

This repo is **full** because it is a production security-audit platform with a multi-month lifecycle, multi-tenant data isolation requirements, and cryptographic reproducibility guarantees. Every finding must be provably reproducible from a frozen toolchain manifest; that property requires explicit boundary discipline throughout the stack.

## Dependency rules

- `src/finding/**`, `src/validation/**`, `src/heuristic/**` (spine / domain) may import **only** each other and the language stdlib + Zod. Forbidden: `src/store/**`, `src/llm/**`, `tools/**`, `node_modules/pg`, `node_modules/ioredis`, `node_modules/docker`, any HTTP client, any ORM.
- `src/scope/**`, `src/router/**`, `src/orchestrator/**` (application) may import the domain layer and other application modules. Forbidden: direct database clients, tool subprocess calls.
- `src/llm/**`, `src/store/**` (infrastructure adapters) may import application ports and vendor SDKs. They implement interfaces owned by the application layer.
- `src/agents/**` invokes `src/llm/` (through the gateway interface) and reads `src/finding/` types. No SVM agent may import EVM tool runners and vice versa.
- `tools/**` (Python) are infrastructure: they may import Docker SDK, requests, and their own helpers. They must NOT import from `src/`.

Run before committing:

```bash
cd /root/Silica && npm run check:boundaries
```

## Naming rules

- **Files:** domain-noun or domain-qualified concept. Banned without a one-line domain justification: `utils`, `helpers`, `manager`, `misc`, `data`, `processor`, `handler`, `service` (use the actual role noun instead).
- **Functions / methods:** verb-noun pattern, domain-first. Banned alone: `process`, `handle`, `do`, `run`. Domain-qualified examples: `computeCanonicalId`, `attemptValidationRung`, `proposeHeuristic`, `emitAuditEvent`.
- **Types / interfaces:** domain noun, PascalCase. `Finding`, `ValidationRungHandler`, `HeuristicCitation`, `AuditJobState` — NOT `IFinding`, `AbstractHandler`, `FindingService`.
- **Heuristic IDs:** follow `bench/heuristic-id-convention.md` (written in P11; stable contract — never rename existing IDs after baseline is seeded).
- **Bench case IDs:** kebab-case exploit-name + date. E.g., `euler-march-2023`, `cashio-march-2022`.

Run before committing:

```bash
cd /root/Silica && python3 /root/.claude/skills/choose-better-names/scripts/check_generic_names.py src/ --strict 2>/dev/null || true
```

## TDD policy

- Every behavior change requires a failing test written **before** the implementation. The test name describes the user-visible outcome, not the implementation call.
- Tests assert observable outputs (returned values, emitted events, persisted records, emitted JSON shape). Tests that only assert mock call counts are not behavior tests.
- Mock at port boundaries only — `src/llm/` gateway is the LLM boundary; `src/store/` is the persistence boundary. Domain logic never touches real I/O.
- Refactor only under green. Unrelated debt is recorded (not silently fixed) in `reports/tech-debt/`.
- The bench corpus (`bench/cases/`) is the regression gate for every agent / model / heuristic change. A regression in any bench case blocks the change.
- RED gate evidence goes in `spec/checkpoints/<phase-id>.red-gate.txt`; GREEN gate evidence in `spec/checkpoints/<phase-id>.green-gate.txt`.

## Review checklist

Every diff is reviewed against all six layers before merge:

1. **Requirement fidelity** — does the change implement what the phase row asked? no scope creep? spec invariants preserved?
2. **Logic and edge cases** — zero/max/malformed inputs; concurrency/ordering/idempotency; hostile-input handling (all audit input is adversarial by default per Invariant #2)
3. **API integrity** — are cited paths, type signatures, RPC method names, Zod schemas, and Etherscan/Sourcify endpoints real? No hallucinated method signatures.
4. **Security** — out-of-scope writes? credential leaks? prompt-injection from contract comments/NatSpec/strings? off-chain agent running without `scope_artifact_id`? container egress allow-list enforced?
5. **Context awareness** — contradictions with prior phases? reuse of existing patterns? dependencies on frozen contracts (heuristic IDs, bench case IDs, `canonical_id` formula)?
6. **Test quality** — behavioral assertions, not call graphs; edge cases covered; no `xfail`/skip added to make CI green; behavioral coverage mapping provided.

## Debt policy

- Scanner outputs live in `reports/tech-debt/`.
- Run dead-code + smell scans before every P20-style publication gate.
- Remediate `safe-to-remove` findings freely. `manual-review` and `blocked` require human signoff.
- Schema changes require passing all 8 stressors in `design/schema-stressors-v0.md` — zero exceptions.
- Heuristic library FP rate must be empirically recalibrated after each batch of 50 audits.

## Verification gates

A change is not done until all of these pass:

```bash
cd /root/Silica
npm run typecheck                    # zero type errors
npm run lint                         # zero lint errors
npm run test                         # all tests green (forks pool, no file parallelism)
npm run check:boundaries             # depcruise: no domain→infra imports
npm run check:size                   # all source files <300 lines
python3 -m radon cc src/ -a -nc     # cyclomatic complexity <15 per function
npm run test:coverage                # ≥80% lines, ≥70% branches, ≥85% functions
```

For schema changes, additionally:

```bash
cd /root/Silica && npm run test:integration -- bench/stressors/   # all 8 stressors round-trip
```

For any agent/model/heuristic change:

```bash
cd /root/Silica && npm run bench:full && python3 bench/regression-check.py
```

## Hard stops

- **Spine domain code imports infrastructure.** `src/finding/`, `src/validation/`, `src/heuristic/` importing `pg`, `ioredis`, any ORM, any HTTP client, or `tools/**`. Stop. Introduce a port interface owned by the spine layer; push the concrete dependency outward.
- **Off-chain agent runs without scope_artifact_id.** Stop. The `enforce.ts` gate is not optional.
- **Container tool invocation without egress allow-list.** Stop. Missing allow-list → fail-closed; never open-ended network access from tool containers.
- **Prompt-injection vector from contract source not in the hostile-input corpus.** Stop. Add to corpus via ADR + heuristic mint before proceeding.
- **Heuristic ID renamed after baseline is seeded.** Stop. Heuristic IDs are frozen in `bench/heuristic-id-convention.md`; rename breaks all bench case citations. File a PIVOT ADR if truly necessary.
- **Bench regression.** Any case that previously passed now fails. Stop. Revert the change or escalate to user.
- **Test skipped or xfail-ed to make CI green.** Stop. Fix or revert.
- **Secrets or API keys in source.** Stop. Use `.env` (gitignored); rotate immediately.
- **Files modified outside `/root/Silica/`.** Stop. The sister repo (`/root/nexus/`) and global rules (`~/.claude/CLAUDE.md`, `/root/CLAUDE.md`) are off-limits.
- **Schema change without all 8 stressors passing.** Stop. Run `npm run test:integration -- bench/stressors/` first.

## Active scope

Silica v1 build per `/root/Silica/spec/` (21 phases P0–P20). EVM front (P1–P13) + SVM front (P14–P16) + off-chain perimeter (P17–P18) + heuristic library (P19) + open-source publication (P20). Design dossier at `/root/Silica/notes.md`, `/root/Silica/design/`, `/root/Silica/ops/`, `/root/Silica/research/` is read-only; changes go through `spec/decisions/PIVOT-NNN.md` ADRs.
