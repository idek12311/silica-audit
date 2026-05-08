# 7. Context Handoff Contract

Each phase boundary has an explicit handoff strategy. This prevents context rot (bob:521 — Poisoning, Distraction, Confusion, Clash) accumulating across phases.

## Handoff matrix

| From → To | Strategy | Payload | Where to find it |
|-----------|----------|---------|------------------|
| P0 → P1 | summary | `CLAUDE.md` rules + `package.json` + `tsconfig.json` + `pyproject.toml` paths | `/root/Silica/CLAUDE.md`, `/root/Silica/package.json`, `/root/Silica/tsconfig.json`, `/root/Silica/pyproject.toml` |
| P0 → P2, P3, P4, P5, P6, P7 | summary | Same as above (P0 outputs to all P1-P7 dependents) | Same paths |
| P1 → P4 | full | Finding TS types + Zod (so P4 fetcher can construct toolchain_manifest) | `/root/Silica/src/finding/schema.ts` |
| P1 → P6 | full | Finding TS types (P6 emits state-asserted findings into the schema shape) | `/root/Silica/src/finding/schema.ts` |
| P1, P2, P3 → P8 | summary | Finding/Validation/Heuristic interfaces only — routers wire them, do not re-derive | `/root/Silica/src/{finding,validation,heuristic}/index.ts` exports |
| P5, P6 → P8 | summary | Tool runner contract (input shape + output shape); no Slither/Foundry implementation details | `/root/Silica/tools/{slither,foundry}/contract.ts` |
| P7 → P9 | full | LLM gateway interface + caching policy + trust-tier API | `/root/Silica/src/llm/gateway.ts` interface |
| P8 → P9 | full | All 5 router interfaces — agents call them | `/root/Silica/src/router/*.ts` exported types |
| P9 → P10 | full | Three agent contracts (Analyzer/Prover/Skeptic) — orchestrator drives them | `/root/Silica/src/agents/*.ts` exported types |
| P3, P8, P9 → P10 | summary | Heuristic store interface + router interfaces + agent contracts | Each module's `index.ts` |
| P4, P5, P6, P10 → P11 | full | All inputs needed for end-to-end Euler audit | `bench/cases/evm/euler/fixture.json` + tool runner contracts + orchestrator |
| P11 → P12 | summary | The Euler case template — P12 follows the same shape | `bench/cases/evm/euler/` directory contents |
| P11 → P13 | summary | Heuristic citation pattern from Euler case (which heuristics fired, with what weights) | `bench/cases/evm/euler/expected-finding.json` heuristics_cited section |
| P10 → P14, P17 | summary | Orchestrator + tool runner contract (P14 SVM tools must conform; P17 perimeter tools too) | `/root/Silica/tools/contract.ts` |
| P14 → P15 | full | SVM tool runner contracts | `/root/Silica/tools/{soteria,anchor-idl,anchor,trident}/contract.ts` |
| P15 → P16 | full | SVM agent contracts | `/root/Silica/src/agents/svm-*.ts` |
| P3, P13, P16 → P19 | summary | Heuristic schema + EVM/SVM seeded heuristics — mining agent + drift monitor build on top | `psql` query + `heuristics/baseline/` directory listing |
| P12, P13, P16, P17, P18, P19 → P20 | summary | All bench cases / heuristics / surfaces — final acceptance gate walks acceptance criteria | `02-acceptance-criteria.md` + `psql` queries |

**Handoff strategy semantics:**
- **`full`**: the receiving phase reads the full payload artifacts (TypeScript types, contract files, fixtures).
- **`summary`**: the receiving phase reads only summary artifacts (`index.ts` exports, contract.ts, README sections); does not load implementation files into context.
- **`fresh-instructions`**: the receiving phase ignores prior context and starts only from the spec section + own dependencies. Used when prior context risks polluting reasoning.

## Compaction triggers

If main context approaches 70% of model window (operational convention; bob:521 documents the four context-rot modes), the executor:

1. Writes `checkpoints/COMPACT-<phase-id>.md` with the summary format below.
2. Runs `/clear` (Two-Correction Rule generalized — bob:867-870).
3. Resumes by reading `README.md` + `03-phase-map.md` + the latest `COMPACT-*.md`.

**Compaction summary format:**

```markdown
# Compaction at <phase-id>
## Phases done
<list of P-IDs with one-line outcome each>
## Key decisions made
<list of any non-obvious calls made during the prior phases>
## Open questions / pivots
<any ADRs written; list with one-line summaries>
## Next phase
<P-ID + what dependency artifacts are needed (cite paths)>
```

## Parallel-worker context isolation

Spawned workers (Group A, B, C, D) get **no main-context inheritance**. Disk reads of previous-phase artifacts ARE permitted via the `output_format` and `tool_guidance` fields of the worker contract — the worker reads what its contract names, nothing else. This is the bob:564-566 Humble Object pattern: spec defines the contract; worker fills it without seeing the rest of the system.

Specifically:
- Workers read the cited design doc(s) named in their `tool_guidance` field.
- Workers read the source files of any dependencies cited in `output_format`.
- Workers do NOT read other workers' in-progress files (they may not exist yet, and reading them risks coupling).
- Workers write only to paths named in their `output_format` field; writing elsewhere triggers `shared-mutable-state` violation.

## Phase-resumption protocol

If the executor session ends mid-phase (e.g., context overflow, hard stop, user interrupt), the next session starts by:

1. Reading `/root/Silica/spec/README.md` (orientation).
2. Reading `/root/Silica/spec/03-phase-map.md` (status — first unchecked box).
3. Reading the latest `checkpoints/COMPACT-*.md` if present.
4. Reading all `decisions/*.md` ADRs.
5. Reading the next-to-do phase row and its `depends_on` checkpoints.
6. Reading skill procedure files for that phase only.

This lets a fresh agent pick up without re-reading the full conversation. The spec is self-sufficient.

## Phase data immutability

Once a phase's `.test` checkbox is checked, its outputs (the files it wrote) are **frozen** for downstream phases. A downstream phase that needs to modify a frozen output must:

1. Open `decisions/PIVOT-NNN.md` documenting the change.
2. Re-run the originating phase's `.test` to confirm post-modification it still passes.
3. Re-run the affected downstream phases' `.test` to confirm cascading correctness.

This prevents "context drift" where late phases silently mutate early-phase contracts.
