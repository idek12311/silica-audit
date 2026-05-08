# 1. Identity & Scope

## What is being built

**Silica v1** — a VM-and-source-agnostic vulnerability platform that audits smart contracts (EVM + SVM) and the off-chain infrastructure surrounding them. The platform is shaped around four spine primitives (Finding, Execution Proof, Heuristic, Bench Case), driven by five runtime routers (Tool / Escalation / Model / Agent / Validation), with vulnerabilities validated through an 11-rung tier ladder. v1 ships three differentiation axes: EVM front, SVM front, and off-chain perimeter. Continuous monitoring and Move/Cairo support are deferred to v2.

The spec lives at `/root/Silica/spec/`. Executor agents invoke it by reading `README.md` and walking `03-phase-map.md` row by row, honoring `depends_on`. Implementation lands at `/root/Silica/src/` (TypeScript orchestrator), `/root/Silica/tools/` (Python tool wrappers for Slither / Mythril / Soteria / Anchor / Echidna), and `/root/Silica/db/` (Postgres migrations).

## Filesystem identity
- **Project root:** `/root/Silica/`
- **Spec root:** `/root/Silica/spec/`
- **Implementation root:** `/root/Silica/src/` (created in P0)
- **Scope:** project
- **Invocation:** `python3 /root/.claude/skills/author-agent-spec/scripts/validate_spec.py --strict /root/Silica/spec` to verify; the executor reads `/root/Silica/spec/README.md` to begin work.

## Required artifacts

| Path | Purpose | Modeled on |
|---|---|---|
| `/root/Silica/src/finding/schema.ts` | Finding schema TS types + Zod validators | `/root/Silica/design/schema-draft-v0.md:17-49` |
| `/root/Silica/src/validation/tiers.ts` | Validation tier ladder rung interfaces | `/root/Silica/design/validation-tiers.md:13-128` |
| `/root/Silica/src/heuristic/schema.ts` | Heuristic schema + lifecycle | `/root/Silica/design/heuristic-schema.md:21-100` |
| `/root/Silica/src/orchestrator/audit-job.ts` | Audit-job state machine | `/root/Silica/spec/01-use-case-frame.md:174-191` (Contract E — defined here, no notes.md anchor) |
| `/root/Silica/src/router/{tool,escalation,model,agent,validation}.ts` | Five runtime routers | `/root/Silica/notes.md:221-227` (§6 router table) and `notes.md:477` (§16 spec items) |
| `/root/Silica/src/llm/anthropic-gateway.ts` | LLM gateway with caching + trust tiers | `/root/Silica/notes.md:541` (§17.3 trust-tier locked decision) |
| `/root/Silica/src/agents/{analyzer,prover,skeptic}.ts` | Three baseline agents | `/root/Silica/notes.md:154` (Analyzer/Prover/Skeptic named) |
| `/root/Silica/tools/slither/run.py` | Slither runner (Dockerized) | `/root/Silica/design/cost-model.md:43-49` (static-analysis tool cost) |
| `/root/Silica/tools/foundry/run.py` | Foundry / Anvil runner | `/root/Silica/design/validation-tiers.md:33-44` (R2/R3 EVM implementor) |
| `/root/Silica/tools/anchor/run.py` | Anchor + solana-test-validator runner | `/root/Silica/design/multi-vm-svm-sketch.md:114-122` (Fork environment + PoC framework) |
| `/root/Silica/tools/source-fetch/fetch.py` | Etherscan + Sourcify + multi-Solc compile | `/root/Silica/notes.md:340` (§11.3 verifier drift) and `notes.md:491` (§16 source fetcher) |
| `/root/Silica/db/migrations/` | Postgres schema for findings, heuristics, audits | `/root/Silica/design/heuristic-schema.md:205-207` (Storage section) |
| `/root/Silica/bench/cases/*.json` | Bench corpus regression fixtures | `/root/Silica/research/bench-corpus.md:1-30` (summary table) |
| `/root/Silica/heuristics/baseline/` | 30+ EVM heuristics seeded from bug-taxonomy | `/root/Silica/research/bug-taxonomy.md` (full taxonomy; 58 entries across 18 categories) |
| `/root/Silica/CLAUDE.md` | Repo agent rules (architecture, TDD, naming, debt) | `/root/Silica/notes.md:493-580` (§17 locked decisions — repo conventions derived from these) |

## Allowed tools

| Tool | Why |
|---|---|
| `Read` | Read existing Silica docs and skills |
| `Write` | Create new source / config / fixture files |
| `Edit` | Modify existing files in `/root/Silica/` |
| `Bash` | Run package managers, compilers, tools, tests, migrations |
| `Glob` / `Grep` | Search the implementation as it grows |
| `Skill` (`codex`) | Apply planned file-edit slices via the executor |
| `Skill` (`code-with-tests-first`) | Red-green-refactor loop per slice |
| `Skill` (`plan-feature-architecture`) | Per-phase architecture plan |
| `Skill` (`choose-better-names`) | Name new files / functions / types |
| `Skill` (`check-architecture-boundaries`) | Layer audit after each phase |
| `Skill` (`check-test-quality`) | Behavioral coverage audit |
| `Skill` (`review-ai-code`) | Pre-PR adversarial review |
| `Skill` (`decide-duplicate-code`) | DRY decisions during slices |
| `Skill` (`clean-code-before-change`) | Refactor before feature when tangled |
| `Skill` (`scan-code-smells`) | Periodic structural debt scan |
| `Skill` (`find-dead-code`) | Periodic dead-code scan |
| `Skill` (`claude-api`) | Anthropic SDK with prompt caching |
| `Skill` (`write-agent-rules`) | CLAUDE.md authoring (P0 only) |
| `Agent` (Explore / general-purpose) | Parallel research and verification fan-out |
| `WebSearch` / `WebFetch` | External docs (Etherscan, Anchor, Solana, etc.) |

## Hard "do not touch" boundaries

- `~/.claude/CLAUDE.md` — never modify (per `/root/CLAUDE.md` global rules)
- `/root/CLAUDE.md` — never modify (root project rules)
- `/root/.claude/skills/*/SKILL.md` — never modify any skill
- `/root/.claude/bob` — never modify; read-only reference
- `/root/nexus/` — never modify (sister project)
- `/root/Silica/notes.md` — read-only after spec authoring; design pivots go through `/root/Silica/spec/decisions/PIVOT-NNN.md` not by editing notes inline
- `/root/Silica/design/`, `/root/Silica/ops/`, `/root/Silica/research/` — read-only references during execution; updates go through ADRs
- Production secrets — never commit `.env`, `*.key`, `*.pem`, RPC API keys, deployer private keys

## Single actor (SRP — bob:35-37)

This artifact serves **one actor**: the Silica platform engineer building the v1 product. The spec is NOT responsible for: (a) the legal entity / KYB / insurance setup (that's `/root/Silica/ops/legal-framing.md` for counsel review); (b) sales / GTM / customer onboarding (`/root/Silica/ops/business-model.md` for the founder); (c) v2 features — continuous monitoring scheduler, Move/Cairo VMs, R10 formal-proof tooling, marketplace integrations.

All code, tests, fixtures, migrations, and toolchain integration live within this actor's scope. Anything outside that scope is out-of-scope for this spec; treat as `decisions/ASK-*.md` if proposed mid-execution.
