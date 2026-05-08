# Silica Finding Schema — Draft v0

> Status: design draft, not frozen. Stress-tested against three scenarios at the bottom (Diamond proxy, Beanstalk multi-tx governance, Solana CPI). Schema fields are subject to revision until v1 freeze.

## Goal

A `Finding` is the canonical artifact emitted by every detection path in Silica — static analyzer hit, LLM agent hypothesis, fuzzer counterexample, formal-method violation, off-chain perimeter alert. The schema must be:

1. **VM-agnostic at its top level.** EVM is a tenant of the schema, not the schema itself.
2. **Source-format-agnostic.** Same shape whether the finding is over verified Solidity, decompiled bytecode, an Anchor IDL, or a compiled Move package.
3. **Round-trippable** through dedup, heuristic citation, validation tier upgrade, audit re-runs, and dispute lifecycle without losing identity.
4. **Evidence-first.** Every claim is anchored to artifacts. The `Finding` is a manifest over evidence, not a narrative.

The finding schema is the spine of the platform. Every plugin (tool, agent, VM) is downstream of it; every router operates on it; the heuristic library is keyed by it; the bench corpus is built from it.

## Top-level structure

```jsonc
{
  "schema_version": "silica.finding.v0",
  "id": "fnd_01HXG2K4...",                         // ULID, monotonically sortable
  "canonical_id": "cf_3a91f0...",                  // hash for dedup; see §Canonicalization
  "audit_id": "aud_01HXG2K3...",
  "tenant_id": "tnt_acme",                         // multi-tenant isolation

  "created_at": "2026-05-08T17:35:00Z",
  "updated_at": "2026-05-08T18:42:11Z",

  "subject": Subject,
  "class": Classification,
  "severity": Severity,
  "confidence": Confidence,
  "validation": Validation,
  "evidence": Evidence[],
  "heuristics_cited": HeuristicCitation[],
  "agent_provenance": AgentProvenance,
  "remediation": Remediation,

  "composite_of": ["fnd_..."],                     // multi-step exploits
  "supersedes": "fnd_...",                         // re-audit refines prior finding
  "related_to": ["fnd_..."],                       // weak link, not composition

  "scope_artifact_id": "scp_...",                  // off-chain authorization (when applicable)

  "status": "candidate" | "confirmed" | "disputed" | "rejected" | "fixed",
  "lifecycle": LifecycleEvent[]
}
```

## Subject

The "what is being audited" structure. Abstracts over EVM/SVM/Move/Cairo without bias.

```jsonc
{
  "kind": "evm" | "svm" | "move" | "cairo" | "wasm-cosmos",
  "primary_locator": Locator,                      // VM-specific, see below
  "secondary_locators": [Locator],                 // for cross-contract / multi-program findings
  "logical_subject": "diamond" | "proxy" | "single-contract" | "multi-program-system" | "frontend" | "rpc-endpoint" | "ci-pipeline",

  "source_format": "verified_source" | "decompiled_bytecode" | "raw_bytecode" | "anchor_idl_only" | "move_published" | "frontend_bundle" | "rpc_introspection",
  "source_artifact_uri": "uri:...",                // pointer to the actual source content

  "toolchain_manifest": ToolchainManifest
}
```

### Locator (per-VM discriminated union)

The spine never assumes blocks. Each VM defines its own `time_anchor`.

**EVM Locator:**
```jsonc
{
  "vm": "evm",
  "chain_id": 1,
  "address": "0xabcd...",
  "time_anchor": { "kind": "block_height", "value": 18234567 },
  "implementation_resolution": {
    "strategy": "static" | "follow-eip1967" | "follow-diamond-loupe" | "follow-uups" | "follow-beacon",
    "resolved_implementation": "0x...",
    "resolved_at_block": 18234567,
    "facets": [ { "selector": "0xabcd1234", "implementation": "0x..." } ]
  },
  "storage_layout_ref": "uri:bytecode_hash_anchored_layout",
  "deployer": "0x...",
  "creation_tx": "0x..."
}
```

**SVM Locator:**
```jsonc
{
  "vm": "svm",
  "cluster": "mainnet-beta",
  "program_id": "...",
  "time_anchor": { "kind": "slot", "value": 245678123 },
  "program_version": "...",
  "upgrade_authority": "...",
  "idl_ref": "uri:...",
  "involved_accounts": [
    { "pubkey": "...", "type_name": "Vault", "is_writable": true, "is_signer": false }
  ]
}
```

**Move Locator:**
```jsonc
{
  "vm": "move",
  "network": "aptos-mainnet",
  "package_address": "0x...",
  "module_name": "Vault",
  "time_anchor": { "kind": "package_version", "value": "1.4.0" },
  "resource_types": ["Vault::Position", "Vault::AccessCap"]
}
```

The invariant: `time_anchor.kind` is opaque to the spine. Each VM defines its own.

### ToolchainManifest

Reproducibility is a platform property. Every audit pins a full toolchain.

```jsonc
{
  "compiler": { "name": "solc", "version": "0.8.19+commit.7dd6d404" },
  "compiler_settings": { "optimizer_enabled": true, "optimizer_runs": 200, "via_ir": false, "evm_version": "paris" },
  "build_framework": "foundry@1.0.0" | "hardhat@2.20.1" | "anchor@0.29.0" | "aptos-cli@2.5.0",
  "static_analyzers": [
    { "name": "slither", "version": "0.10.0" },
    { "name": "mythril", "version": "0.24.7" },
    { "name": "halmos", "version": "0.1.13" }
  ],
  "fuzzers": [ { "name": "echidna", "version": "2.2.3" } ],
  "model_invocations": [
    { "agent_role": "analyzer", "model": "claude-sonnet-4-6", "prompt_hash": "..." }
  ]
}
```

## Classification

```jsonc
{
  "taxonomy_id": "DEFI-ORACLE-SPOT-PRICE-MANIPULATION-001",  // links to bug-taxonomy.md
  "swc_id": "SWC-115",                                       // when applicable
  "label": "Spot-price oracle manipulation",
  "category": "oracle"
}
```

## Severity

```jsonc
{
  "level": "critical" | "high" | "medium" | "low" | "informational",
  "rationale": "...",
  "loss_estimate_usd": { "min": 0, "max": 50000000, "currency": "USD" },
  "loss_basis": "TVL-at-risk" | "actual-loss-if-exploited" | "griefing-only" | "informational",
  "rubric_id": "silica.severity.v0"                          // versioned rubric
}
```

Severity rubrics are VM-specific because EVM "ownership transfer" semantics don't translate to Solana "upgrade authority compromise." A rubric is a Heuristic itself.

## Confidence

```jsonc
{
  "score": 0.87,                                              // 0.0 to 1.0
  "breakdown": {
    "static_signal": 0.7,
    "dynamic_signal": 0.95,
    "agent_consensus": 0.85,
    "heuristic_priors": 0.80
  },
  "method": "weighted_geometric_mean"
}
```

A finding's confidence is bounded above by the rung of the validation ladder it cleared. A "static-only" finding cannot have confidence > 0.6 by policy.

## Validation

The finding's place on the validation tier ladder. See [`validation-tiers.md`](validation-tiers.md) for full rung definitions.

```jsonc
{
  "highest_passed": "fork-execution-state-asserted",
  "highest_applicable": "fork-execution-with-mocked-actor",
  "rungs_attempted": [
    { "rung": "static-signal-only", "result": "pass", "artifact_uri": "..." },
    { "rung": "compile-only", "result": "pass", "artifact_uri": "..." },
    { "rung": "fork-execution-state-asserted", "result": "pass", "artifact_uri": "..." }
  ],
  "block_reason": null,                                        // if highest_applicable not reached
  "ladder_version": "silica.validation.v0"
}
```

If `highest_passed != highest_applicable`, the finding is incomplete; the harness should attempt to clear higher rungs.

## Evidence

A flat list of artifacts. Order matters (chronological by collection time).

```jsonc
[
  {
    "kind": "static-analysis",
    "tool": "slither-0.10.0",
    "detector_id": "uninitialized-state",
    "artifact_uri": "uri:...",
    "snippet": "function _balances ..."
  },
  {
    "kind": "execution-proof",
    "framework": "foundry@1.0.0",
    "test_path": "test/exploit/EulerDonation.t.sol",
    "fork_anchor": { "chain_id": 1, "block": 16817993 },
    "exit_code": 0,
    "gas_used": 487231,
    "artifact_uri": "uri:..."
  },
  {
    "kind": "state-assertion",
    "before": { "attacker_balance_dai": "0", "victim_tvl_usd": "200000000" },
    "after":  { "attacker_balance_dai": "197000000", "victim_tvl_usd": "3000000" },
    "delta":  { "attacker_balance_dai": "+197000000", "victim_tvl_usd": "-197000000" }
  },
  {
    "kind": "agent-output",
    "agent_id": "economic-specialist@v3",
    "model": "claude-opus-4-7",
    "prompt_hash": "sha256:...",
    "completion_artifact_uri": "uri:..."
  },
  {
    "kind": "fuzz-counterexample",
    "fuzzer": "echidna@2.2.3",
    "invariant": "vault.totalAssets() >= sum(user.shares * pricePerShare)",
    "shrunken_call_sequence": [ /* ... */ ],
    "artifact_uri": "uri:..."
  }
]
```

## HeuristicCitation

Every finding cites which heuristics fired. Closed loop: finding → heuristic → finding.

```jsonc
[
  { "heuristic_id": "HEUR-OZ-PROXY-INIT-001", "version": "v3", "weight": 0.6 },
  { "heuristic_id": "HEUR-DEFI-FIRST-DEPOSITOR-002", "version": "v1", "weight": 0.4 }
]
```

Findings without heuristic citations are flagged for review — they may be the seed for a new heuristic.

## AgentProvenance

```jsonc
{
  "discovering_agent": "access-control-specialist@v2",
  "validating_agents": ["prover@v1", "skeptic@v3"],
  "skeptic_verdict": "passed" | "failed" | "uncertain",
  "skeptic_reasoning_uri": "uri:...",
  "router_decisions": [
    { "router": "tool-router", "selected": "slither-modifiers" },
    { "router": "model-router", "selected": "claude-sonnet-4-6" }
  ]
}
```

## Remediation

```jsonc
{
  "summary": "Add `_disableInitializers()` in implementation contract constructor.",
  "patch_suggestion_uri": "uri:patch_diff",
  "references": [
    "https://docs.openzeppelin.com/contracts/4.x/api/proxy#Initializable",
    "EIP-1967"
  ],
  "estimated_effort": "trivial" | "small" | "moderate" | "large"
}
```

## Canonicalization

`canonical_id` is the dedup key. Two findings with the same `canonical_id` are the same finding regardless of which agent emitted them or which audit run produced them.

```
canonical_id = sha256(
  canonical_subject_locator     // VM-specific canonical form (chain+addr+impl-hash for EVM, etc.)
  + canonical_class_id          // taxonomy_id (NOT the human-readable label)
  + canonical_invariant_violated // structured spec of the violated property
)
```

The catch: `canonical_invariant_violated` must itself be canonical. For an oracle bug it's `"price_at_block_X_is_manipulable_below_threshold_Y"` — not the prose description. The harness defines a canonicalizer per bug class.

If two agents find the same bug via different paths (Slither flagged the modifier; LLM hypothesized the access bypass), they emit findings with the same `canonical_id` and the harness merges them, accumulating confidence.

## Composition (multi-step exploits)

```jsonc
{
  "id": "fnd_beanstalk_governance_chain",
  "composite_of": [
    "fnd_beanstalk_bip_malicious_payload",
    "fnd_beanstalk_voting_power_flashloanable",
    "fnd_beanstalk_governance_immediate_exec"
  ],
  "validation": { "highest_passed": "multi-tx-orchestrated" },
  "...": "..."
}
```

The composite finding's severity dominates its parts (often "critical" even if components are "medium" individually). Each child stands alone in the finding store; the composite is a logical roll-up.

## Lifecycle

```jsonc
[
  { "at": "2026-05-08T17:35:00Z", "event": "discovered", "by": "analyzer@v2" },
  { "at": "2026-05-08T17:38:21Z", "event": "validated_to_rung", "rung": "fork-execution-state-asserted" },
  { "at": "2026-05-08T17:42:00Z", "event": "skeptic_passed", "by": "skeptic@v3" },
  { "at": "2026-05-08T18:00:00Z", "event": "status_changed", "from": "candidate", "to": "confirmed" },
  { "at": "2026-05-08T18:42:11Z", "event": "remediation_proposed" }
]
```

## Stress Test 1 — Diamond proxy facet selector clash (EIP-2535)

**Scenario:** A diamond proxy at `0xDIAMOND` registers two facets `F1` and `F2`. F1 owns selector `0xabcd1234` (`transferOwnership(address)`) with proper access control. Later, `diamondCut` is called to add F2 which also exposes `0xabcd1234` but unprotected. From that block onward, calls to `0xabcd1234` on the diamond execute the F2 implementation, silently bypassing access control.

**Finding shape:**

```jsonc
{
  "schema_version": "silica.finding.v0",
  "id": "fnd_diamond_clash_demo",
  "canonical_id": "cf_diamond_clash_aabbccdd",

  "subject": {
    "kind": "evm",
    "logical_subject": "diamond",
    "primary_locator": {
      "vm": "evm",
      "chain_id": 1,
      "address": "0xDIAMOND...",
      "time_anchor": { "kind": "block_height", "value": 18800000 },
      "implementation_resolution": {
        "strategy": "follow-diamond-loupe",
        "facets": [
          { "selector": "0xabcd1234", "implementation": "0xF2..." },
          { "selector": "0x5678aabb", "implementation": "0xF1..." }
        ]
      }
    },
    "secondary_locators": [
      { "vm": "evm", "chain_id": 1, "address": "0xF1...", "time_anchor": { "kind": "block_height", "value": 18800000 } },
      { "vm": "evm", "chain_id": 1, "address": "0xF2...", "time_anchor": { "kind": "block_height", "value": 18800000 } }
    ],
    "source_format": "verified_source",
    "toolchain_manifest": { "compiler": { "name": "solc", "version": "0.8.20" } }
  },

  "class": {
    "taxonomy_id": "DIAMOND-FACET-SELECTOR-CLASH-001",
    "label": "Diamond facet selector overwrite — silent access-control bypass"
  },

  "severity": { "level": "critical", "loss_basis": "TVL-at-risk" },
  "confidence": { "score": 0.94, "breakdown": { "static_signal": 0.5, "dynamic_signal": 0.99, "agent_consensus": 0.92 } },

  "validation": {
    "highest_passed": "fork-execution-state-asserted",
    "highest_applicable": "fork-execution-state-asserted",
    "rungs_attempted": [
      { "rung": "static-signal-only", "result": "pass", "artifact_uri": "uri:slither-diamond-clash" },
      { "rung": "compile-only", "result": "pass" },
      { "rung": "fork-execution-state-asserted", "result": "pass", "artifact_uri": "uri:foundry-test-clash" }
    ]
  },

  "evidence": [
    {
      "kind": "static-analysis",
      "tool": "slither-0.10.0",
      "detector_id": "diamond-facet-selector-overlap",
      "snippet": "F2.exposedSelectors() ∩ F1.exposedSelectors() = {0xabcd1234}"
    },
    {
      "kind": "execution-proof",
      "framework": "foundry@1.0.0",
      "test_path": "test/exploit/DiamondClash.t.sol",
      "fork_anchor": { "chain_id": 1, "block": 18800000 },
      "exit_code": 0
    },
    {
      "kind": "state-assertion",
      "before": { "owner": "0xDEPLOYER" },
      "after": { "owner": "0xATTACKER" }
    }
  ],

  "heuristics_cited": [ { "heuristic_id": "HEUR-DIAMOND-LOUPE-CLASH-001", "version": "v1", "weight": 0.9 } ],
  "agent_provenance": { "discovering_agent": "proxy-pattern-specialist@v1" },
  "remediation": {
    "summary": "Add selector-collision check to diamondCut: revert if any selector in the new cut already exists in the registry unless explicitly replacing.",
    "references": ["EIP-2535"]
  },

  "status": "confirmed"
}
```

**Schema verdict:** Handles cleanly. Three things matter:
- `secondary_locators` carries the facet implementations.
- `implementation_resolution.facets` enumerates the selector→impl mapping at the snapshot block.
- `class.taxonomy_id = DIAMOND-FACET-SELECTOR-CLASH-001` is a Diamond-specific class; the taxonomy must include diamond-pattern-specific classes alongside the generic ones.

Schema does NOT need new fields for this stressor. ✓

## Stress Test 2 — Beanstalk governance flash-loan attack

**Scenario:** April 2022 Beanstalk exploit. Attacker submitted BIP-18 with malicious payload, waited the governance delay, took a flash loan to acquire voting power, voted+executed in one tx, drained $182M.

**Three child findings + composite:**

Child A — `fnd_beanstalk_bip_malicious_payload`:
```jsonc
{
  "class": { "taxonomy_id": "GOVERNANCE-MALICIOUS-PROPOSAL-PAYLOAD-001" },
  "subject": { "primary_locator": { "address": "0xBEANSTALK_GOV", "time_anchor": { "kind": "block_height", "value": 14595730 } } },
  "validation": { "highest_passed": "static-signal-only", "highest_applicable": "static-signal-only" },
  "severity": { "level": "high", "rationale": "Proposal payload calls arbitrary delegatecall." },
  "confidence": { "score": 0.55, "breakdown": { "static_signal": 0.6, "agent_consensus": 0.5 } }
}
```

Child B — `fnd_beanstalk_voting_power_flashloanable`:
```jsonc
{
  "class": { "taxonomy_id": "GOVERNANCE-FLASHLOANABLE-VOTING-POWER-001" },
  "validation": { "highest_passed": "fork-execution-state-asserted" },
  "severity": { "level": "high" }
}
```

Child C — `fnd_beanstalk_governance_immediate_exec`:
```jsonc
{
  "class": { "taxonomy_id": "GOVERNANCE-IMMEDIATE-EXECUTION-001" },
  "validation": { "highest_passed": "static-signal-only" },
  "severity": { "level": "medium" }
}
```

Composite — `fnd_beanstalk_governance_chain`:
```jsonc
{
  "id": "fnd_beanstalk_governance_chain",
  "composite_of": [
    "fnd_beanstalk_bip_malicious_payload",
    "fnd_beanstalk_voting_power_flashloanable",
    "fnd_beanstalk_governance_immediate_exec"
  ],

  "class": { "taxonomy_id": "GOVERNANCE-FLASHLOAN-IMMEDIATE-EXEC-CHAIN-001" },

  "severity": { "level": "critical", "loss_basis": "actual-loss-if-exploited", "loss_estimate_usd": { "min": 100000000, "max": 200000000 } },

  "validation": {
    "highest_passed": "multi-tx-orchestrated",
    "highest_applicable": "multi-tx-orchestrated",
    "rungs_attempted": [
      {
        "rung": "multi-tx-orchestrated",
        "result": "pass",
        "artifact_uri": "uri:foundry-multitx-beanstalk",
        "metadata": {
          "tx_sequence": [
            { "block_offset": 0, "action": "submit_BIP18" },
            { "block_offset": "+1_day", "action": "wait_governance_delay" },
            { "block_offset": "+governance_delay", "action": "flash_loan + vote + execute (atomic)" }
          ],
          "actor_assumptions": ["attacker has gas + flash loan source"]
        }
      }
    ]
  }
}
```

**Schema verdict:** Handles cleanly.
- `composite_of` makes the multi-step structure explicit.
- The composite finding's `validation.rung = multi-tx-orchestrated` triggers the multi-tx-capable validator.
- `metadata.tx_sequence` and `actor_assumptions` belong on a per-rung basis (not at the top of the finding) — the schema supports per-rung metadata.
- Each child can be remediated independently; remediating any one breaks the chain.

Schema does NOT need new fields for this stressor. ✓

## Stress Test 3 — Solana CPI authority confusion

**Scenario:** A lending program `LendingX` performs a CPI to a token transfer with a passed-in `authority_pda` account that it doesn't verify is its own program-derived address. Attacker passes a PDA they control; the CPI signs with the attacker's PDA; tokens transfer to attacker.

**Finding shape:**

```jsonc
{
  "schema_version": "silica.finding.v0",
  "id": "fnd_lendingx_cpi_authority",
  "canonical_id": "cf_svm_cpi_auth_aabbccdd",

  "subject": {
    "kind": "svm",
    "logical_subject": "single-contract",
    "primary_locator": {
      "vm": "svm",
      "cluster": "mainnet-beta",
      "program_id": "LendingX1111111111111111111111111111111111",
      "time_anchor": { "kind": "slot", "value": 245678123 },
      "program_version": "1.4.2",
      "upgrade_authority": "...",
      "idl_ref": "uri:lendingx-idl-v1.4.2",
      "involved_accounts": [
        { "pubkey_role": "depositor", "type_name": "Signer", "is_writable": false, "is_signer": true },
        { "pubkey_role": "collateral_vault", "type_name": "TokenAccount", "is_writable": true },
        { "pubkey_role": "authority_pda", "type_name": "ANY (BUG: not constrained)", "is_writable": false, "is_signer": true },
        { "pubkey_role": "token_program", "type_name": "Program(spl_token)", "is_writable": false }
      ]
    },
    "source_format": "anchor_idl_only",
    "toolchain_manifest": { "build_framework": "anchor@0.29.0" }
  },

  "class": {
    "taxonomy_id": "SVM-CPI-AUTHORITY-CONFUSION-001",
    "label": "Solana CPI authority not verified as program PDA"
  },

  "severity": { "level": "critical", "loss_basis": "TVL-at-risk" },

  "validation": {
    "highest_passed": "fork-execution-state-asserted",
    "rungs_attempted": [
      {
        "rung": "static-signal-only",
        "result": "pass",
        "artifact_uri": "uri:soteria-detector",
        "metadata": { "detector_id": "soteria-missing-pda-constraint" }
      },
      {
        "rung": "fork-execution-state-asserted",
        "result": "pass",
        "artifact_uri": "uri:anchor-test-cpi-confusion",
        "metadata": {
          "framework": "solana-test-validator + anchor",
          "fork_snapshot_uri": "uri:lendingx-state-slot-245678123",
          "before": { "attacker_token_balance": 0, "vault_balance": 1000000 },
          "after":  { "attacker_token_balance": 1000000, "vault_balance": 0 }
        }
      }
    ]
  },

  "evidence": [
    {
      "kind": "static-analysis",
      "tool": "soteria@0.4",
      "detector_id": "missing-pda-verification",
      "snippet": "withdraw_collateral: authority_pda has no #[account(seeds = [...], bump)] constraint"
    },
    {
      "kind": "execution-proof",
      "framework": "anchor@0.29.0",
      "test_path": "tests/exploit/cpi_auth_confusion.ts",
      "fork_anchor": { "cluster": "mainnet-beta", "slot": 245678123 },
      "exit_code": 0
    }
  ],

  "heuristics_cited": [
    { "heuristic_id": "HEUR-SVM-MISSING-PDA-CONSTRAINT-001", "version": "v2", "weight": 0.85 }
  ],

  "remediation": {
    "summary": "Add Anchor account constraint: `#[account(seeds = [b\"authority\", market.key().as_ref()], bump = market.authority_bump)]` on `authority_pda`.",
    "references": ["https://book.anchor-lang.com/anchor_in_depth/PDAs.html"]
  }
}
```

**Schema verdict:** Handles cleanly with three observations:
- `time_anchor.kind = slot` — the spine accepts this without leaking EVM block-height assumptions.
- `involved_accounts` on the SVM Locator is essential — Solana's "what is being audited" includes the account-graph, not just the program ID.
- `validation.rung` value `fork-execution-state-asserted` is reused; the executor differs (anchor vs foundry) but the rung semantics generalize.

Schema does NOT need new fields. ✓

## What this draft does not yet pin

Open for v1:

1. **Severity rubric per VM.** Rubrics are versioned heuristics; v0 leaves them as opaque IDs.
2. **Off-chain finding subjects** — the schema mentions `frontend`, `rpc-endpoint`, `ci-pipeline` logical subjects, but per-surface locators aren't fully drafted. See [`../ops/perimeter-playbook.md`](../ops/perimeter-playbook.md) for the per-surface plan.
3. **Heuristic citation algebra.** Multiple heuristics fired with different weights — how they combine into final confidence is policy, not yet defined.
4. **Schema migration policy.** v0 → v0.1 → v1: what changes are allowed without a major bump.
5. **Cross-tenant heuristic sanitization.** When a finding mints a heuristic, what client-identifying fields are stripped before promotion to the shared library.

## Decision log

| # | Decision | Reasoning |
|---|---|---|
| D-01 | `time_anchor` opaque per VM | EVM-block bias would leak into spine otherwise. Stress test 3 confirms. |
| D-02 | `secondary_locators[]` allowed at top level | Diamond and CPI bugs span multiple addresses. |
| D-03 | `composite_of[]` for multi-tx exploits | Beanstalk-class attacks need this; component findings stand alone for remediation tracking. |
| D-04 | `canonical_id` is a hash of (subject, class, invariant) | Same bug from different agents → same canonical_id → automatic dedup. |
| D-05 | Per-rung evidence with metadata | A finding that cleared multi-tx-orchestrated needs a different evidence shape than one that cleared static-only; the schema is flat but per-rung metadata carries the difference. |
| D-06 | `tenant_id` mandatory | Multi-tenant isolation is a spine property, not a deployment detail. |
| D-07 | Confidence bounded by validation rung | Prevents a static-only finding from reporting 0.99 confidence. |

## Next steps

- Run schema against 5 more stressors from the bench corpus once it's populated (esp. cross-chain bridge findings, oracle TWAP manipulations, frontend XSS).
- Define `canonicalizer` functions per bug class.
- Draft `Severity` rubric v0 for EVM, separately for SVM.
- Decide on serialization: JSON canonical form for hashing (RFC 8785).
- Decide on storage: Postgres (jsonb) vs document store. Probably Postgres for ACID + queryable.
