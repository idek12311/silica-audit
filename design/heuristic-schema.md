# Heuristic Schema — v0

> The heuristic library is the substrate that lets Silica compound. Every confirmed finding mints or strengthens a heuristic. Every audit run cites heuristics. After 1000 audits, the library is dense enough to dominate detection performance over any single agent's reasoning.

## What is a heuristic

A heuristic is a versioned, queryable detection rule that:
1. Has a **stable identity** independent of how it's implemented.
2. Has an **applicability constraint** (when it should fire).
3. Has a **confidence prior** (how often it's right when it fires).
4. Cites **founding evidence** (the finding(s) that minted it).
5. Has a **regression case attached** (so we can detect when it's rotted).
6. Has a **deprecation lifecycle** (heuristics get retired).

A heuristic is **not** a detector implementation. A heuristic *can be implemented as* a Slither detector, a Semgrep rule, an LLM rubric, a fuzz invariant, or a hybrid. Multiple implementations of the same heuristic should converge on the same set of findings.

## Schema (v0)

```jsonc
{
  "schema_version": "silica.heuristic.v0",
  "id": "HEUR-OZ-PROXY-INIT-001",                   // stable; version separately
  "version": 3,                                      // monotonic per-id
  "lineage": [
    { "version": 1, "summary": "Initial mint from finding fnd_..." },
    { "version": 2, "summary": "Tightened applicable_when after 4 false positives" },
    { "version": 3, "summary": "Added _disableInitializers() FP shape" }
  ],
  "supersedes": null,                                // for ID renames; rare
  "deprecated": false,
  "deprecation_reason": null,

  "name": "Uninitialized OpenZeppelin proxy implementation",
  "summary": "An implementation contract intended to sit behind an OZ proxy can be left uninitialized at deploy. Anyone can call initialize() on the impl directly and seize control.",

  "category": "proxy-upgradeability",                // matches taxonomy top-level category
  "taxonomy_links": ["DEFI-PROXY-IMPL-UNINITIALIZED-001"],
  "swc_mapping": "SWC-118",

  "vm_scope": ["evm"],
  "applicability": {
    "compiler_versions": ["solc>=0.6.0"],
    "frameworks": ["openzeppelin-contracts>=4.0.0,<4.6.0"],
    "logical_subjects": ["proxy", "diamond"],
    "applicable_when": [
      "imports OpenZeppelin's Initializable",
      "uses initializer modifier",
      "deploy script does not call initialize() on impl directly",
      "impl constructor does not call _disableInitializers()"
    ]
  },

  "false_positive_shapes": [
    {
      "id": "FP-OZ-DISABLE-INIT",
      "summary": "Implementation has _disableInitializers() in constructor (introduced in OZ v4.6).",
      "discriminator": "constructor body contains _disableInitializers() call"
    },
    {
      "id": "FP-FACTORY-INIT",
      "summary": "Deploy script atomically initializes via factory in same tx as deployment.",
      "discriminator": "creation tx calldata contains initialize selector"
    }
  ],

  "implementations": [
    {
      "kind": "slither-detector",
      "ref": "uri:silica/detectors/oz-proxy-init.py",
      "version": "1.2.0"
    },
    {
      "kind": "semgrep-rule",
      "ref": "uri:silica/rules/oz-proxy-init.yaml",
      "version": "1.0.0"
    },
    {
      "kind": "llm-rubric",
      "ref": "uri:silica/rubrics/oz-proxy-init.md",
      "version": "1.1.0",
      "model_compatibility": ["claude-sonnet-4-6", "claude-opus-4-7"]
    }
  ],

  "minted_by": {
    "founding_findings": ["fnd_audius_2022_init", "fnd_wormhole_uniswap_2022_init"],
    "evidence_class": "real-exploit",
    "minted_at": "2024-08-12T00:00:00Z",
    "minted_by_agent": "manual",
    "minted_by_audit": "aud_..."
  },

  "regression_cases": ["bench_audius_2022_init", "bench_wormhole_uniswap_2022_init"],

  "confidence_prior": 0.85,
  "fp_rate_observed": 0.07,
  "tp_rate_observed": 0.93,
  "n_observations": 412,
  "last_observation_at": "2026-05-01T00:00:00Z",

  "severity_default": "high",
  "severity_modifiers": [
    { "if": "implementation has admin-only state-mutating functions", "level": "critical" },
    { "if": "implementation is fixed (no upgrade path)", "level": "medium" }
  ],

  "remediation_template": {
    "summary": "Add `_disableInitializers()` in implementation constructor (or call `initialize()` atomically in deploy).",
    "patch_template_uri": "uri:silica/patches/oz-proxy-init.diff",
    "references": [
      "https://docs.openzeppelin.com/contracts/4.x/api/proxy#Initializable",
      "OZ-2022-08-09 advisory"
    ]
  },

  "tenant_visibility": "public" | "private-tenant" | "shared-pool",
  "tenant_id": null                                  // null = public/shared
}
```

## Identity model

`id` is stable across versions. `version` increments on any change. The pair `(id, version)` is the immutable reference.

When a finding cites a heuristic, it cites the specific version:
```jsonc
{ "heuristic_id": "HEUR-OZ-PROXY-INIT-001", "version": 3, "weight": 0.6 }
```

This means: when v4 is published, prior findings still trace to v3 (the version they were cited under). Historical accuracy of heuristic citation is preserved.

## Lifecycle

```
Proposed → Active → (Deprecated | Superseded)
```

### Proposed
A new finding has no existing heuristic citation. The harness's `heuristic-mining` agent proposes a candidate heuristic with:
- A name + summary
- Initial applicability constraints (extracted from the finding)
- A regression case (the finding itself, frozen as a bench case)
- A confidence prior (default 0.5; updated as observations accrue)

Proposed heuristics are sandboxed — they don't affect production audits until promoted.

### Active
After human review (or after N consistent observations across audits), a proposed heuristic is promoted to Active. At promotion:
- Implementations are written (Slither detector or Semgrep rule or LLM rubric).
- The heuristic enters the production library.
- Citation by future findings begins.

### Deprecated
A heuristic is deprecated when:
- Its FP rate exceeds a threshold (default >0.30 over 50+ observations)
- Its TP regression case fails after a code-side fix (the bug class no longer exists in the wild)
- A superior version is promoted (`supersedes` field)

Deprecated heuristics remain in the library for historical citation but don't fire on new audits.

### Superseded
A heuristic with `supersedes: HEUR-X-001` replaces X. The two are siblings; both remain queryable. Citation by past findings doesn't migrate.

## Heuristic algebra: how citations combine

A finding may cite multiple heuristics. Confidence aggregation:

```
P(true | h1, h2, ...) = 1 - prod_i (1 - h_i.confidence_prior * h_i.weight)
```

This treats heuristics as independent evidence. When they're correlated (e.g., two heuristics that both fire on OZ proxies), the harness applies a correlation-discount factor (configurable per heuristic-pair).

## Heuristic mining (auto-mint)

When a confirmed finding has no heuristic citations, the `heuristic-mining` agent inspects:
- The class taxonomy_id
- The vulnerable code structure
- The validation evidence

And produces a proposed heuristic. The proposal is reviewed (manual at first, automated review by skeptic agent later).

Mining policies:
- Don't propose heuristics for one-off compiler bugs (Vyper compiler bug is a regression case, not a heuristic).
- Don't propose heuristics for findings whose `confidence < 0.85`.
- Always include the founding finding's contract as a regression case.
- Don't auto-mint heuristics from `disputed` findings.

## Multi-tenant heuristic library

Three pools:

1. **Public pool** — heuristics derived from public exploits. Available to all tenants.
2. **Shared pool** — derived from tenants who opted in to share. Available to opt-in tenants.
3. **Private pool** — tenant-specific. Never leaves the tenant.

Promotion path: Private → Shared (with sanitization) → Public (manual review).

Sanitization on Private→Shared:
- Strip tenant-identifying applicability constraints
- Generalize specific addresses to placeholder selectors
- Replace tenant-specific code patterns with abstract pattern descriptors
- Remove magic constants tied to tenant economy

## Storage

Heuristics live in a Postgres table with jsonb body and indexed columns: `id`, `version`, `vm_scope[]`, `category`, `deprecated`, `tenant_visibility`. Implementation artifacts (detector code, semgrep rules, LLM rubrics) live in versioned object storage with content hashes.

## Drift monitoring

The harness runs nightly:
- Re-runs every active heuristic against its regression cases. Fails if any regression case stops firing.
- Re-runs every active heuristic against the bench corpus negatives. Flags if a heuristic starts firing on cases it shouldn't.
- Reports: heuristics with FP rate growth >0.05 over 30 days; heuristics with no observations in 90 days (candidate for deprecation review).

## Agent integration

Agents consume heuristics two ways:

**As priors during reasoning.** The Analyzer agent's prompt is conditioned on relevant heuristics (filtered by `vm_scope`, `framework`, `logical_subject`). Prompt budget is curated — top-N highest-prior heuristics relevant to the contract surface, plus any whose `applicable_when` literal-matches imports/modifiers.

**As citations on emission.** Every finding emitted must cite at least one heuristic OR explicitly mark itself as a candidate for new-heuristic mining.

## Worked example: heuristic conflict

Two heuristics fire on the same finding:
- `HEUR-DEFI-FIRST-DEPOSITOR-INFLATION-001` (v2): "ERC-4626 vault first-depositor inflation," prior 0.78
- `HEUR-DEFI-VAULT-ROUNDING-FAVORS-VAULT-001` (v1): "Vault rounding favors the vault," prior 0.40 (often a non-bug, sometimes a feature)

The Analyzer cites both with weights 0.7 and 0.3 respectively. The Skeptic looks at the citations and the actual evidence; if the rounding-favors-vault citation is a known-pair-with first-depositor (correlated), correlation-discount cuts its effective weight by 0.5. Final confidence calculation respects the correlation.

If the heuristics genuinely contradict (one says TP, the other says FP), the harness:
- Surfaces the conflict to the human reviewer at audit-report time
- Records both citations on the finding
- Lets the lifecycle event log carry the dispute

## Open questions for v1

1. **Cross-tenant correlation discount factors** — currently configured per-heuristic-pair; should it be a global learned model?
2. **Implementation portability** — when a heuristic has Slither + Semgrep + LLM-rubric implementations, which is canonical? Disagreement resolution?
3. **Auto-promotion thresholds** — N observations and FP rate threshold for Proposed→Active. Hand-tuned at v0; learn from audit outcomes at v1.
4. **Heuristic ID space** — flat vs hierarchical? Currently flat with prefixes (HEUR-{CATEGORY}-{NAME}-{NN}). Trade-offs around renaming.
5. **External heuristic imports** — should we be able to import community-contributed heuristics from a public registry (npm-style)? Trust model?
