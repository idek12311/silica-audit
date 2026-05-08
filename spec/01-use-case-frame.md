# 2. Use Case Frame — Five-Level Design-First (bob:858-866)

## L1 — Capability

> Audit a smart-contract protocol (EVM and/or SVM, optionally with off-chain perimeter) and emit a list of execution-validated Findings, each cited to a versioned heuristic, persisted to a multi-tenant store, and reproducible from the toolchain manifest.

## L2 — Components

| Component | Responsibility | File |
|---|---|---|
| Finding spine | The canonical Finding JSON, schema validators, dedup, lifecycle | `/root/Silica/src/finding/schema.ts` |
| Validation ladder | 11-rung interface; per-rung handler shells; per-VM implementor binding | `/root/Silica/src/validation/tiers.ts` |
| Heuristic library | Versioned, citable detection rules; three-pool storage; mining agent | `/root/Silica/src/heuristic/{schema,store,mining}.ts` |
| Bench corpus | Held-out exploit cases as regression fixtures | `/root/Silica/bench/cases/*.json` |
| Source fetcher | Etherscan/Sourcify resolution; multi-Solc compile; bytecode-equivalence check | `/root/Silica/tools/source-fetch/fetch.py` |
| EVM tool layer | Slither, Mythril, Foundry, Echidna runners (Docker sandboxed) | `/root/Silica/tools/{slither,mythril,foundry,echidna}/run.py` |
| SVM tool layer | Soteria, Anchor IDL analyzer, anchor-test runner, Trident | `/root/Silica/tools/{soteria,anchor-idl,anchor,trident}/run.py` |
| Off-chain perimeter | Frontend taint, RPC fingerprinter, subdomain enum, CI key scan, multisig OSINT | `/root/Silica/tools/perimeter/{frontend,rpc,subdomain,ci-secrets,multisig}/run.py` |
| LLM gateway | Anthropic SDK + prompt caching + trust-tier routing; OpenAI fallback | `/root/Silica/src/llm/anthropic-gateway.ts` |
| Five routers | Tool / Escalation / Model / Agent / Validation routers operating on the spine | `/root/Silica/src/router/{tool,escalation,model,agent,validation}.ts` |
| Three baseline agents | Analyzer, Prover, Skeptic with role-specific prompts | `/root/Silica/src/agents/{analyzer,prover,skeptic}.ts` |
| SVM specialist agents (7) | One agent per SVM bug class: CPI-authority, missing-signer-check, account-cosplay, sysvar-spoofing, arbitrary-CPI, missing-owner-check, duplicate-account-mutable | `/root/Silica/src/agents/svm-{cpi-authority,missing-signer,account-cosplay,sysvar-spoofing,arbitrary-cpi,missing-owner,duplicate-account-mutable}.ts` |
| Orchestrator | Audit-job state machine; phase transitions; budget enforcement | `/root/Silica/src/orchestrator/audit-job.ts` |
| Persistence | Postgres for findings/heuristics/audit-records; Redis for coordination; S3-class for artifacts | `/root/Silica/db/migrations/`, `/root/Silica/src/store/` |

## L3 — Interactions

```
                 ┌─────────────────────────────────────────────────┐
                 │              Silica orchestrator                │
                 │     (audit-job state machine + 5 routers)       │
                 └─────────┬─────────────────────────────────┬─────┘
                           │                                 │
              ┌────────────▼────────────┐         ┌──────────▼──────────┐
              │  Source fetcher         │         │  LLM gateway        │
              │  (Etherscan/Sourcify    │         │  (Anthropic, prompt │
              │   + multi-Solc compile) │         │   cache, trust tier)│
              └────────────┬────────────┘         └──────────┬──────────┘
                           │                                 │
                           ▼                                 ▼
        ┌──────────────────┴──────────────────┐    ┌─────────┴─────────┐
        │  Tool runners (Docker-sandboxed)    │    │  3 agents         │
        │  EVM: slither / mythril / foundry / │    │  Analyzer →       │
        │       echidna                       │ ◄──┤  Prover →         │
        │  SVM: soteria / anchor / trident    │    │  Skeptic          │
        │  Off-chain: frontend / rpc / CI /   │    └─────────┬─────────┘
        │             multisig / subdomain    │              │
        └─────────────────┬───────────────────┘              │
                          │                                  │
                          └──────────┐    ┌──────────────────┘
                                     ▼    ▼
                            ┌────────────────────┐
                            │  Finding spine     │
                            │  (schema, dedup,   │
                            │   lifecycle, ID)   │
                            └─────────┬──────────┘
                                      │
                         ┌────────────┼────────────┐
                         ▼            ▼            ▼
                  ┌──────────┐ ┌──────────┐ ┌──────────┐
                  │ Postgres │ │ Heuristic│ │  Bench   │
                  │ (multi-  │ │ library  │ │  corpus  │
                  │  tenant) │ │ (3-pool) │ │  (regr.) │
                  └──────────┘ └──────────┘ └──────────┘
```

Audit lifecycle: source-fetch → toolchain pin → tool run (parallel by VM) → static findings → analyzer agent → prover agent (validation ladder R0→R3+) → skeptic agent → composite-finding consolidation → heuristic citation → persist + emit report.

## L4 — Contracts

### Contract A — Finding (the spine artifact)

Verbatim from `/root/Silica/design/schema-draft-v0.md:17-49` (the Finding TypeScript interface block). v1 implements `silica.finding.v0.1` (off-chain Subject support added per stressor 7 in `schema-stressors-v0.md:328-417`, the BadgerDAO stressor that exposed the v0 → v0.1 schema migration):

```typescript
export interface Finding {
  schema_version: 'silica.finding.v0' | 'silica.finding.v0.1';
  id: string;                          // ULID
  canonical_id: string;                // sha256(rfc8785(subject) || 0x1f || taxonomy_id || 0x1f || rfc8785(invariant))
  audit_id: string;
  tenant_id: string;
  created_at: string;                  // ISO 8601 UTC
  updated_at: string;
  subject: Subject;                    // see Contract B
  class: Classification;
  severity: Severity;
  confidence: Confidence;
  validation: Validation;              // see Contract C
  evidence: Evidence[];
  heuristics_cited: HeuristicCitation[];
  agent_provenance: AgentProvenance;
  remediation: Remediation;
  composite_of?: string[];             // multi-step exploits
  supersedes?: string;
  related_to?: string[];
  scope_artifact_id?: string;          // mandatory when subject.kind == 'off-chain'
  status: 'candidate' | 'confirmed' | 'disputed' | 'rejected' | 'fixed';
  lifecycle: LifecycleEvent[];
}
```

Validation: Zod schema in `src/finding/schema.ts`; canonicalization function in `src/finding/canonical.ts` using RFC 8785 JSON canonical form.

### Contract B — Subject (per-VM discriminated union)

Verbatim per-VM Locator structures from `/root/Silica/design/schema-draft-v0.md:50-110` and v0.1 off-chain extension from `schema-stressors-v0.md:541-580`:

```typescript
export type Subject =
  | { kind: 'evm'; primary_locator: EvmLocator; … }
  | { kind: 'svm'; primary_locator: SvmLocator; … }
  | { kind: 'off-chain'; primary_locator: OffChainLocator; scope_artifact_id: string; … };

export interface EvmLocator {
  vm: 'evm';
  chain_id: number;
  address: string;
  time_anchor: { kind: 'block_height'; value: number };
  implementation_resolution: ImplResolution;       // static | follow-eip1967 | follow-uups | follow-diamond-loupe | follow-beacon
  storage_layout_ref?: string;
  deployer?: string;
  creation_tx?: string;
}

export interface SvmLocator {
  vm: 'svm';
  cluster: 'mainnet-beta' | 'devnet' | 'testnet';
  program_id: string;
  time_anchor: { kind: 'slot'; value: number };
  program_version: string;
  upgrade_authority?: string;
  idl_ref?: string;
  involved_accounts: InvolvedAccount[];
}

export interface OffChainLocator {
  vm: null;
  off_chain_kind: 'frontend' | 'rpc-endpoint' | 'ci-pipeline' | 'multisig-osint' | 'supply-chain' | 'bridge-validator-api' | 'community-admin';
  url?: string;            // for frontend / rpc / bridge / community-admin
  domain?: string;         // for rpc / subdomain
  github_org?: string;     // for ci-pipeline
  ip_range?: string;
  package_name?: string;   // for supply-chain
  time_anchor: { kind: 'wall_clock'; value: string };  // ISO 8601
  snapshot_uri?: string;
}
```

### Contract C — Validation ladder

11 rungs + R-INFO per `/root/Silica/design/validation-tiers.md:13-128`. Per-rung handler interface:

```typescript
export interface ValidationRungHandler {
  rung: 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9' | 'R10' | 'R-INFO';
  applicableFor(finding: Finding): boolean;
  attempt(finding: Finding, ctx: ValidationContext): Promise<ValidationResult>;
  confidenceCeiling: number;           // 0.6 (R0) → 0.99 (R10)
}
```

Per-VM implementor mapping: EVM = forge-build / forge-test / vm.warp / vm.prank; SVM = anchor-build / anchor-test / sleep+sequence / signer-mock. Reference: `validation-tiers.md:178-198`.

### Contract D — Heuristic

Verbatim schema from `/root/Silica/design/heuristic-schema.md:21-100`. Three-pool tenant visibility, lifecycle Proposed → Active → Deprecated, regression case attached to every active heuristic. v1 ships ~30 EVM baseline heuristics seeded from `bug-taxonomy.md` + ~10 SVM baseline heuristics.

Confidence aggregation when multiple heuristics fire:
```
P(true | h1, h2, …) = 1 − ∏(1 − h_i.confidence_prior * h_i.weight)
```

### Contract E — Audit-job state machine

```typescript
type AuditJobState =
  | 'pending'                  // job created, waiting for source-fetch
  | 'fetching'                 // source-fetcher running
  | 'compiling'                // toolchain compile + bytecode-equivalence
  | 'static-analyzing'         // tool layer running in parallel by VM
  | 'analyzer-pass'            // Analyzer agent active
  | 'prover-pass'              // Prover agent generating + validating PoCs
  | 'skeptic-pass'             // Skeptic agent reviewing
  | 'consolidating'            // composite-finding rollup; heuristic citation
  | 'persisting'               // write to Postgres + emit report
  | 'completed'
  | 'failed'
  | 'budget-truncated'
  | 'cancelled';
```

State transitions in `/root/Silica/src/orchestrator/audit-job.ts`. Each transition writes a checkpoint event to the audit-job ledger for observability and resumption.

## L5 — Implementation gate

No code is written until L1–L4 above are filled and the user has confirmed (`Approved` or `Approved with changes`). This is the bob §6.3.2 hard gate (bob:858-866). For Silica v1, this gate is satisfied — the user explicitly authorized "do all" execution after reviewing the locked design pass; this spec records that approval as durable. Subsequent pivots require new ADRs in `decisions/`.

## Invariants

1. **Spine VM-agnosticism.** No spine code (`src/finding/`, `src/validation/`, `src/heuristic/`) imports VM-specific tools or runtime libraries. EVM / SVM / off-chain plug into the spine through ports owned by the spine layer (Dependency Rule, bob:64-72).
2. **Hostile-input-by-default.** All audit input (Solidity source, Vyper, Rust/Anchor, frontend bundles, RPC introspection) is treated as adversarial. LLM prompt-injection defense is architectural — comment/string content is tagged untrusted in the context bundle and prompts are engineered to treat tagged content as data, not instructions.
3. **Confidence bounded by validation rung** (D-07 from `schema-draft-v0.md:404`). A static-only finding never reports confidence > 0.6. A R3 fork-state-asserted finding never reports > 0.92.
4. **Toolchain reproducibility.** Every audit pins a complete toolchain manifest (Solc/Vyper/Foundry/Slither/Mythril/Anchor/Soteria versions). Bench cases without toolchain pin are flaky and rejected from the regression suite.
5. **Three-pool heuristic isolation.** Private-pool heuristics never leak into Shared or Public pools without sanitization (strip tenant-identifying applicability constraints, generalize specific addresses, replace tenant-specific patterns).
6. **Container-level tool isolation.** Every tool subprocess runs in a Docker container with cgroups CPU/memory limits, read-only filesystem except scratch, network egress restricted to allow-listed RPC endpoints.
7. **Schema discipline.** Schema changes go through one owner; PRs proposing extensions for "just this case" are rejected unless they pass all 8 round-trip stressors (`design/schema-stressors-v0.md`) without coercion.
8. **Bench-corpus regression as gate.** Every prompt / agent / model / heuristic change must run the full bench corpus. Regression in any case → block.

## Non-goals

1. **Continuous monitoring scheduler.** v2 feature. v1 ships only the bytecode-equivalence/storage-layout-changed/external-call-graph-changed primitives that v2 will use.
2. **Move and Cairo VMs.** v2 priority. v1 spine must not encode EVM bias that would block their addition; spine VM-agnosticism is verified against the SVM stress test (`design/multi-vm-svm-sketch.md`).
3. **R10 formal-proof rung depth.** v1 lists Halmos / hevm / Move-Prover as future implementors but does not ship working R10 handlers — reserved for v2.
4. **Marketplace integrations** (Sherlock, Code4rena, Cantina, Immunefi). v2 partnership path; v1 is API-first.
5. **Self-serve subscription product** (web dashboard + GitHub app). v1 ships the engine and CLI; the SaaS layer is a separate spec.
6. **Audit-report PDF generator.** v1 emits structured JSON + Markdown; PDF formatting is a thin downstream concern.
7. **Hosted multi-tenant SaaS deployment.** v1 ships the engine; deployment infrastructure is operational concern post-spec.
8. **180-agent scaling** (Cecuro press-release framing). v1 ships 3 baseline agents + per-VM specialists. Optimize for findings/$ on bench corpus, not agent count.
