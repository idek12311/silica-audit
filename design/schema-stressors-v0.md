# Schema Stressors — additional round-trip tests

> Companion to [`schema-draft-v0.md`](schema-draft-v0.md). The base schema doc carries three stressors (Diamond proxy, Beanstalk multi-tx, Solana CPI). This file adds five more to exercise schema dimensions the base set didn't reach: cross-chain coordination, toolchain-as-root-cause, oracle-manipulation economic attacks, off-chain subjects, and initialization defects. Each stressor either confirms the schema holds without modification or reveals a concrete gap with a proposed fix.

---

## Stressor 4 — Wormhole signature-verify bypass (Feb 2022)

**Scenario:** Wormhole's Solana-side bridge program had a guardian-signature verification step that read the `Sysvar1nstructions` account but did not verify it was the actual sysvar. The attacker passed a crafted instructions account that made the signature check pass without valid guardian signatures, then minted ~120,000 wETH on Solana, bridged to Ethereum, withdrew real ETH. ~$326M loss.

This is a **cross-chain finding** — the bug is on Solana, but the exploitable impact (real ETH withdrawal) materializes on Ethereum. The schema must support secondary locators on a different chain, and the validation tier must reach R6 (multi-fork-coordinated).

**Finding shape (composite):**

```jsonc
{
  "schema_version": "silica.finding.v0",
  "id": "fnd_wormhole_sig_verify",
  "canonical_id": "cf_svm_sysvar_spoof_wormhole_aabbccdd",

  "subject": {
    "kind": "svm",
    "logical_subject": "multi-program-system",
    "primary_locator": {
      "vm": "svm",
      "cluster": "mainnet-beta",
      "program_id": "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth",
      "time_anchor": { "kind": "slot", "value": 119203745 },
      "program_version": "[verify]",
      "idl_ref": null,
      "involved_accounts": [
        { "pubkey_role": "instructions_sysvar_passed", "type_name": "ANY (BUG: not verified)", "is_writable": false, "is_signer": false },
        { "pubkey_role": "guardian_set", "type_name": "GuardianSet", "is_writable": false }
      ]
    },
    "secondary_locators": [
      {
        "vm": "evm",
        "chain_id": 1,
        "address": "0x3ee18B2214AFF97000D974cf647E54bd6c2a9C8c",
        "time_anchor": { "kind": "block_height", "value": 14223503 },
        "implementation_resolution": { "strategy": "follow-eip1967", "resolved_implementation": "[verify]" }
      }
    ],
    "source_format": "verified_source",
    "toolchain_manifest": { "build_framework": "anchor@[verify]" }
  },

  "class": {
    "taxonomy_id": "SVM-SYSVAR-SPOOFING-001",
    "label": "Solana sysvar account not verified — guardian-sig bypass on Wormhole bridge"
  },

  "severity": {
    "level": "critical",
    "loss_basis": "actual-loss-if-exploited",
    "loss_estimate_usd": { "min": 320000000, "max": 330000000 }
  },

  "confidence": { "score": 0.97, "breakdown": { "static_signal": 0.7, "dynamic_signal": 0.99, "agent_consensus": 0.95 } },

  "validation": {
    "highest_passed": "multi-fork-coordinated",
    "highest_applicable": "multi-fork-coordinated",
    "rungs_attempted": [
      { "rung": "static-signal-only", "result": "pass", "metadata": { "detector_id": "soteria-missing-sysvar-check" } },
      { "rung": "fork-execution-state-asserted", "result": "pass", "artifact_uri": "uri:anchor-test-sysvar-spoof",
        "metadata": { "fork": "solana-test-validator @ slot 119203745" } },
      { "rung": "multi-fork-coordinated", "result": "pass", "artifact_uri": "uri:multifork-wormhole-bridge",
        "metadata": {
          "fork_set": [
            { "vm": "svm", "cluster": "mainnet-beta", "slot": 119203745 },
            { "vm": "evm", "chain_id": 1, "block": 14223503 }
          ],
          "tx_sequence": [
            { "fork_id": "svm", "action": "spoof_sysvar + mint_wETH" },
            { "fork_id": "svm", "action": "lock_wETH_for_bridge_out" },
            { "fork_id": "evm", "action": "submit_VAA + withdraw_ETH" }
          ],
          "before": { "evm": { "wormhole_eth_balance": 120000 }, "svm": { "attacker_wETH": 0 } },
          "after":  { "evm": { "wormhole_eth_balance": 0 },      "svm": { "attacker_wETH": 0 } }
        }
      }
    ]
  },

  "evidence": [
    { "kind": "static-analysis", "tool": "soteria", "detector_id": "missing-sysvar-id-check",
      "snippet": "load_instruction_at_checked called on account without preceding solana_program::sysvar::instructions::check_id" },
    { "kind": "execution-proof", "framework": "anchor + foundry-multi-fork",
      "test_path": "tests/exploit/wormhole_cross_chain.ts",
      "exit_code": 0 },
    { "kind": "state-assertion",
      "before": { "wormhole_eth_locked_usd": 326000000 },
      "after":  { "wormhole_eth_locked_usd": 0, "attacker_eth": 120000 } }
  ],

  "heuristics_cited": [
    { "heuristic_id": "HEUR-SVM-SYSVAR-NOT-CHECKED-001", "version": 1, "weight": 0.85 },
    { "heuristic_id": "HEUR-CROSS-CHAIN-VAA-FALSE-POSITIVE-001", "version": 1, "weight": 0.50 }
  ],

  "remediation": {
    "summary": "Use solana_program::sysvar::instructions::check_id() or load_current_index_checked(); migrate to anchor's #[account(address = sysvar::instructions::ID)] constraint.",
    "references": [ "https://docs.rs/solana-program/latest/solana_program/sysvar/instructions/index.html" ]
  }
}
```

**Schema verdict:** Holds. Three observations:
- `secondary_locators[]` carries the Ethereum-side impact location while `primary_locator` is the Solana program where the bug lives. This separation is exactly what the schema was designed to express.
- The new `multi-fork-coordinated` rung carries `fork_set` metadata listing per-VM forks plus a `tx_sequence` ordered across forks. Per-rung metadata is flexible enough.
- `time_anchor` differs per locator (slot for SVM, block_height for EVM). The spine accepts this without conversion.

**No schema change required.** ✓

---

## Stressor 5 — Curve/Vyper compiler reentrancy-lock bug (July 2023)

**Scenario:** Vyper compiler versions 0.2.15, 0.2.16, and 0.3.0 had a buggy implementation of the `@nonreentrant` decorator: the storage slot used as the lock could collide with other storage slots in certain layouts, allowing reentrancy on functions marked non-reentrant. Several Curve pools (alETH, msETH, pETH) compiled with these versions were exploited for ~$73M total. The Solidity source (well, Vyper source) was correct; the compiler emitted broken bytecode.

This is a **toolchain-as-root-cause** finding — the bug isn't in the source code, it's in the compiler version. The schema must encode this via `toolchain_manifest`, and the canonical_id must include the compiler version (otherwise the same source compiled with a fixed Vyper would have the same canonical_id and incorrectly match).

**Finding shape:**

```jsonc
{
  "schema_version": "silica.finding.v0",
  "id": "fnd_curve_vyper_lock_collision",
  "canonical_id": "cf_compiler_vyper_nonreentrant_aabbccdd",

  "subject": {
    "kind": "evm",
    "logical_subject": "single-contract",
    "primary_locator": {
      "vm": "evm",
      "chain_id": 1,
      "address": "[verify - Curve alETH pool]",
      "time_anchor": { "kind": "block_height", "value": 17806000 },
      "implementation_resolution": { "strategy": "static" },
      "deployer": "[verify]"
    },
    "secondary_locators": [
      { "vm": "evm", "chain_id": 1, "address": "[verify - msETH pool]", "time_anchor": { "kind": "block_height", "value": 17806000 } },
      { "vm": "evm", "chain_id": 1, "address": "[verify - pETH pool]", "time_anchor": { "kind": "block_height", "value": 17806000 } }
    ],
    "source_format": "verified_source",
    "toolchain_manifest": {
      "compiler": { "name": "vyper", "version": "0.2.15" },
      "compiler_settings": { "evm_version": "paris" },
      "build_framework": "n/a (Vyper standalone)",
      "static_analyzers": [ { "name": "slither", "version": "0.10.0" } ]
    }
  },

  "class": {
    "taxonomy_id": "COMPILER-VYPER-NONREENTRANT-LOCK-COLLISION-001",
    "label": "Vyper @nonreentrant decorator emits broken lock; reentrancy-lock-violations"
  },

  "severity": {
    "level": "critical",
    "loss_basis": "actual-loss-if-exploited",
    "loss_estimate_usd": { "min": 70000000, "max": 75000000 }
  },

  "confidence": { "score": 0.99, "breakdown": { "static_signal": 0.6, "dynamic_signal": 0.99, "agent_consensus": 0.98 } },

  "validation": {
    "highest_passed": "fork-execution-state-asserted",
    "highest_applicable": "fork-execution-state-asserted",
    "rungs_attempted": [
      { "rung": "static-signal-only", "result": "pass",
        "metadata": { "detector_id": "vyper-version-known-buggy",
                      "matched_compiler_versions": ["0.2.15", "0.2.16", "0.3.0"] } },
      { "rung": "fork-execution-state-asserted", "result": "pass",
        "artifact_uri": "uri:foundry-test-curve-reentrancy",
        "metadata": {
          "fork": { "chain_id": 1, "block": 17806000 },
          "before": { "pool_balance_eth": 7600 },
          "after":  { "pool_balance_eth": 0, "attacker_eth": 7600 }
        }
      }
    ]
  },

  "evidence": [
    { "kind": "static-analysis", "tool": "silica-vyper-version-checker",
      "snippet": "Compiler version 0.2.15 listed in known-buggy-vyper-versions (CVE-style)" },
    { "kind": "execution-proof", "framework": "foundry@1.0.0",
      "test_path": "test/exploit/curve_vyper_reentrancy.t.sol", "exit_code": 0 }
  ],

  "heuristics_cited": [
    { "heuristic_id": "HEUR-COMPILER-VERSION-KNOWN-BUGGY-001", "version": 1, "weight": 0.95 }
  ],

  "remediation": {
    "summary": "Recompile with Vyper >= 0.3.7 (lock collision fixed in 0.3.1+ but 0.3.7 is the recommended floor).",
    "references": [ "https://github.com/vyperlang/vyper/security/advisories/GHSA-c647-pxm2-c52w" ]
  }
}
```

**Schema verdict:** Holds — but reveals an important canonicalization detail.

- The `toolchain_manifest.compiler.version` IS part of the implicit canonical state, but only because we include `bytecode_hash` (or its functional equivalent) in `canonical_subject_locator`. If two pools have identical Vyper source but different compiler versions, they have different deployed bytecode → different canonical_subject_locator → different canonical_id. This works correctly.
- The class taxonomy includes the compiler version as part of the class ID (`COMPILER-VYPER-NONREENTRANT-LOCK-COLLISION-001`). When Vyper 0.3.1 fixes it, future compilations are immune; the heuristic's `applicability.compiler_versions` filter prevents it from firing on safe versions.

**Implication for the bug taxonomy:** compiler / framework CVEs need their own taxonomy category (already present: §17 in `bug-taxonomy.md`). They mint heuristics at the toolchain level, not the source level.

**No schema change required.** ✓

---

## Stressor 6 — Mango Markets oracle manipulation (Oct 2022)

**Scenario:** Avraham Eisenberg manipulated MNGO spot price on Serum/Mango DEX by taking large positions on both sides simultaneously, inflating the perceived value of MNGO collateral. Mango's oracle pulled spot price (no TWAP, no deviation guard); Eisenberg used the inflated MNGO collateral to "borrow" ~$117M of other assets that he had no intention of repaying. Multi-step economic attack on Solana.

This is **economic oracle manipulation** with required-actor (the attacker is an external EOA who can deposit and trade), and the attack is multi-tx because the price manipulation precedes the borrow. Schema must support R5 multi-tx-orchestrated with `actor_assumptions` and economic loss accounting.

**Finding shape:**

```jsonc
{
  "schema_version": "silica.finding.v0",
  "id": "fnd_mango_oracle_spot_manipulation",
  "canonical_id": "cf_svm_oracle_spot_mango_aabbccdd",

  "subject": {
    "kind": "svm",
    "logical_subject": "multi-program-system",
    "primary_locator": {
      "vm": "svm",
      "cluster": "mainnet-beta",
      "program_id": "mv3ekLzLbnVPNxjSKvqBpU3ZeZXPQdEC3bp5MDEBG68",
      "time_anchor": { "kind": "slot", "value": 153000000 },
      "program_version": "[verify]",
      "idl_ref": "uri:mango-v3-idl",
      "involved_accounts": [
        { "pubkey_role": "mango_group", "type_name": "MangoGroup", "is_writable": true },
        { "pubkey_role": "mngo_perp_market", "type_name": "PerpMarket", "is_writable": true },
        { "pubkey_role": "mngo_spot_oracle_source", "type_name": "PythPriceAccount or SerumDex", "is_writable": false }
      ]
    },
    "secondary_locators": [
      { "vm": "svm", "cluster": "mainnet-beta",
        "program_id": "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
        "time_anchor": { "kind": "slot", "value": 153000000 } }
    ],
    "source_format": "verified_source"
  },

  "class": {
    "taxonomy_id": "DEFI-ORACLE-SPOT-PRICE-MANIPULATION-001",
    "label": "Spot-price oracle without TWAP enables flash manipulation"
  },

  "severity": {
    "level": "critical",
    "loss_basis": "actual-loss-if-exploited",
    "loss_estimate_usd": { "min": 110000000, "max": 117000000 }
  },

  "confidence": { "score": 0.93, "breakdown": { "static_signal": 0.5, "dynamic_signal": 0.99, "agent_consensus": 0.92 } },

  "validation": {
    "highest_passed": "multi-tx-orchestrated",
    "highest_applicable": "multi-tx-orchestrated",
    "rungs_attempted": [
      { "rung": "static-signal-only", "result": "pass",
        "metadata": { "detector_id": "oracle-spot-price-no-deviation-guard" } },
      { "rung": "multi-tx-orchestrated", "result": "pass",
        "artifact_uri": "uri:anchor-test-mango-oracle",
        "metadata": {
          "tx_sequence": [
            { "step": 1, "action": "attacker funds two accounts (A, B) with equal collateral" },
            { "step": 2, "action": "A opens long MNGO perp; B opens short MNGO perp (same size)" },
            { "step": 3, "action": "A buys MNGO spot aggressively, raising spot price 10x" },
            { "step": 4, "action": "B's short is underwater; oracle reads inflated spot; A's collateral inflated" },
            { "step": 5, "action": "A withdraws all available borrow against inflated MNGO collateral" }
          ],
          "actor_assumptions": [ "attacker has ~$10M initial capital (publicly verifiable on-chain)" ],
          "before": { "mango_treasury": 117000000, "attacker_balance": 10000000 },
          "after":  { "mango_treasury": 0, "attacker_balance": 117000000 }
        }
      }
    ]
  },

  "evidence": [
    { "kind": "static-analysis", "tool": "silica-svm-oracle-checker",
      "snippet": "MNGO oracle source: SerumDex spot read; no TWAP; no max-deviation-bps guard" },
    { "kind": "execution-proof", "framework": "anchor + solana-test-validator",
      "test_path": "tests/exploit/mango_oracle_manipulation.ts", "exit_code": 0 }
  ],

  "heuristics_cited": [
    { "heuristic_id": "HEUR-DEFI-ORACLE-SPOT-NO-TWAP-001", "version": 2, "weight": 0.9 },
    { "heuristic_id": "HEUR-DEFI-COLLATERAL-FROM-PERPS-002", "version": 1, "weight": 0.5 }
  ],

  "remediation": {
    "summary": "Replace spot-price oracle reads with TWAP (>= 30 min window) and add max-deviation guard (e.g., reject if spot deviates >5% from TWAP); cap collateral value contribution from each illiquid asset.",
    "references": [
      "https://github.com/uniswap/v3-periphery/blob/main/contracts/libraries/OracleLibrary.sol",
      "https://blog.chain.link/oracle-manipulation-attacks-rising/"
    ]
  }
}
```

**Schema verdict:** Holds. Notable points:
- `actor_assumptions` is per-rung metadata (carried in the rung's `metadata` block), not a top-level Finding field. The schema is flexible enough; locking this as a *required* field for R4/R5 rungs would be a v1 refinement.
- `loss_estimate_usd` reflects realized loss; `severity.loss_basis = "actual-loss-if-exploited"` distinguishes from "TVL-at-risk."
- The multi-tx sequence is descriptive, not formally machine-executable from the schema alone — the `artifact_uri` points to the actual anchor-test that runs it. This is correct: the schema describes the finding, the artifact is the proof.

**No schema change required.** ✓ But: **v1 should consider promoting `actor_assumptions` to a required structured field for R4 and R5 rungs**, with a small ontology of actor types (admin, governance-proposer, oracle-operator, signer-set, large-capital-EOA).

---

## Stressor 7 — BadgerDAO frontend wallet-call swap (Dec 2021) — **EXPOSES SCHEMA GAP**

**Scenario:** Attacker compromised BadgerDAO's Cloudflare Workers (via leaked API token) and injected JavaScript into the production frontend that intercepted user wallet approvals. When users attempted normal transactions, the injected script silently changed the `spender` parameter in `approve(...)` calls to an attacker-controlled address. Once approvals were granted, the attacker drained ~$130M.

The bug is **purely off-chain** — no smart contract vulnerability, no blockchain-level signature flaw. The schema's `Subject.kind` enum (`evm | svm | move | cairo | wasm-cosmos`) does not have a slot for off-chain subjects.

**Finding shape (proposed v1 schema extension):**

```jsonc
{
  "schema_version": "silica.finding.v0.1",                  // PROPOSED extension

  "subject": {
    "kind": "off-chain",                                    // NEW enum value
    "logical_subject": "frontend",
    "primary_locator": {
      "vm": null,                                           // off-chain has no VM
      "off_chain_kind": "frontend",                         // discriminator
      "url": "https://app.badger.finance/",
      "snapshot_uri": "uri:badger-frontend-bundle-2021-12-02",
      "snapshot_method": "wayback-machine | wget-mirror | live-fetch",
      "time_anchor": { "kind": "wall_clock", "value": "2021-12-02T00:00:00Z" }
    },
    "secondary_locators": [
      {
        "off_chain_kind": "ci-pipeline",
        "platform": "cloudflare-workers",
        "asset_id": "[verify - workers script ID]",
        "time_anchor": { "kind": "wall_clock", "value": "2021-12-02T00:00:00Z" }
      },
      {
        "vm": "evm",
        "chain_id": 1,
        "address": "[verify - victim contract: badger sett vault]",
        "time_anchor": { "kind": "block_height", "value": 13693000 }
      }
    ],
    "source_format": "frontend_bundle",
    "source_artifact_uri": "uri:badger-bundle-snapshot",
    "scope_artifact_id": "scp_badger_2021_engagement"        // off-chain findings require scope
  },

  "class": {
    "taxonomy_id": "OFFCHAIN-FRONTEND-WALLET-CALL-SWAP-001",
    "label": "Frontend injected to swap wallet-call recipient address before signing"
  },

  "severity": {
    "level": "critical",
    "loss_basis": "actual-loss-if-exploited",
    "loss_estimate_usd": { "min": 120000000, "max": 130000000 }
  },

  "confidence": { "score": 0.95, "breakdown": { "static_signal": 0.7, "dynamic_signal": 0.99, "agent_consensus": 0.95 } },

  "validation": {
    "highest_passed": "fork-execution-state-asserted",       // synthetic injection in sandbox
    "rungs_attempted": [
      { "rung": "static-signal-only", "result": "pass",
        "metadata": { "detector_id": "frontend-wallet-call-untrusted-input-flow" } },
      { "rung": "fork-execution-state-asserted", "result": "pass",
        "artifact_uri": "uri:playwright-injection-sandbox",
        "metadata": {
          "framework": "playwright + headless-wallet-sim",
          "before": { "user_signed_spender": "0xLEGIT_VAULT" },
          "after":  { "user_signed_spender": "0xATTACKER (post-injection)" }
        }
      }
    ]
  },

  "evidence": [
    { "kind": "static-analysis", "tool": "silica-frontend-taint",
      "snippet": "approve(spender, ...) call site at app.tsx:142; spender derived from /api/vault-info response, no integrity verification" },
    { "kind": "execution-proof", "framework": "playwright",
      "test_path": "tests/perimeter/wallet_swap_injection.spec.ts", "exit_code": 0 },
    { "kind": "agent-output", "agent_id": "perimeter-frontend-specialist@v1",
      "model": "claude-opus-4-7", "completion_artifact_uri": "uri:..." }
  ],

  "remediation": {
    "summary": "(a) CSP with strict-dynamic + nonces, blocking unsafe-eval/inline; (b) subresource-integrity hashes on all third-party JS; (c) tx params signed server-side and verified against signature in a wallet-side display; (d) defense-in-depth: warn user when spender doesn't match displayed protocol address."
  }
}
```

**Schema verdict:** **GAP REVEALED.** v0 cannot represent this finding without coercion. Proposed v0.1 extension:

1. Add `"off-chain"` to `Subject.kind` enum.
2. Define an off-chain Locator variant with `off_chain_kind` discriminator (`frontend | rpc-endpoint | ci-pipeline | multisig-osint | supply-chain | bridge-validator-api | community-admin`).
3. Off-chain Locators use `time_anchor: { kind: "wall_clock", value: ISO8601 }` since blocks/slots don't apply.
4. `Subject.scope_artifact_id` (already in v0 schema as a top-level Finding field) should be mandatory whenever `kind == "off-chain"`. Move from top-level to Subject for off-chain cases.

**This is the first concrete v0 → v0.1 schema migration.** Recorded in `notes.md` §17 as a locked decision.

The mass-tagged proposed shape is in the JSON above. Once locked, the schema doc moves to v0.1 and updates §schema-draft-v0 lifecycle.

---

## Stressor 8 — Nomad Bridge replay-message (Aug 2022)

**Scenario:** Nomad's `Replica` contract had an `initialize()` function that set the trusted message-merkle root. During an upgrade, `initialize()` was called with `0x00` as the root. The verification logic accepted any message whose merkle proof reduced to 0x00 (which is true for empty/missing proofs). This made every message a valid replay. The first attacker noticed; within hours, dozens of "copycat" attackers were running the same exploit. Total loss ~$190M.

This stresses **single-fault mass-exploitable initialization defect** — one upgrade tx caused permanent vulnerability until the contract was paused. The Finding is at the upgrade block, not the deploy block.

**Finding shape:**

```jsonc
{
  "schema_version": "silica.finding.v0",
  "id": "fnd_nomad_replay_root_zero",
  "canonical_id": "cf_evm_init_root_zero_nomad_aabbccdd",

  "subject": {
    "kind": "evm",
    "logical_subject": "proxy",
    "primary_locator": {
      "vm": "evm",
      "chain_id": 1,
      "address": "0x88A69B4E698A4B090DF6CF5Bd7B2D47325Ad30A3",
      "time_anchor": { "kind": "block_height", "value": 14962800 },     // upgrade block
      "implementation_resolution": {
        "strategy": "follow-eip1967",
        "resolved_implementation": "[verify]",
        "resolved_at_block": 14962800
      },
      "deployer": "[verify]",
      "creation_tx": "[verify - upgrade tx that called initialize(0x00)]"
    },
    "source_format": "verified_source",
    "toolchain_manifest": { "compiler": { "name": "solc", "version": "[verify]" } }
  },

  "class": {
    "taxonomy_id": "DEFI-INIT-DEFAULT-VALUE-PERMITS-EVERYTHING-001",
    "label": "Initialization with zero-root in merkle-verifier accepts every message"
  },

  "severity": {
    "level": "critical",
    "loss_basis": "actual-loss-if-exploited",
    "loss_estimate_usd": { "min": 180000000, "max": 200000000 }
  },

  "confidence": { "score": 0.98, "breakdown": { "static_signal": 0.85, "dynamic_signal": 0.99, "agent_consensus": 0.97 } },

  "validation": {
    "highest_passed": "fork-execution-state-asserted",
    "rungs_attempted": [
      { "rung": "static-signal-only", "result": "pass",
        "metadata": {
          "detector_id": "merkle-root-zero-permits-empty-proof",
          "snippet": "function process(...) require(messages[h] == confirmed && acceptedRoots[r], '!proven'); — root 0x00 is in acceptedRoots after init"
        }
      },
      { "rung": "fork-execution-state-asserted", "result": "pass",
        "artifact_uri": "uri:foundry-test-nomad-replay",
        "metadata": {
          "fork": { "chain_id": 1, "block": 14962801 },                   // immediately after upgrade
          "before": { "nomad_bridge_eth_locked": 190000000 },
          "after":  { "nomad_bridge_eth_locked": 0, "attacker_balance": 190000000 }
        }
      }
    ]
  },

  "evidence": [
    { "kind": "static-analysis", "tool": "slither-custom",
      "detector_id": "init-with-zero-trusted-root",
      "snippet": "Replica.initialize(... bytes32 _committedRoot ...) — _committedRoot=0 stored in acceptedRoots[]" },
    { "kind": "execution-proof", "framework": "foundry@1.0.0",
      "test_path": "test/exploit/nomad_replay.t.sol", "exit_code": 0 },
    { "kind": "state-assertion",
      "before": { "acceptedRoots[0x00]": false, "bridge_balance": 190000000 },
      "after":  { "acceptedRoots[0x00]": true, "bridge_balance": 0 } }
  ],

  "heuristics_cited": [
    { "heuristic_id": "HEUR-INIT-ZERO-DEFAULT-IS-AUTHORIZED-001", "version": 1, "weight": 0.9 },
    { "heuristic_id": "HEUR-MERKLE-ROOT-IN-ACCEPTSET-WITHOUT-VERIFY-001", "version": 1, "weight": 0.7 }
  ],

  "remediation": {
    "summary": "Add explicit `require(_committedRoot != bytes32(0), 'init: zero root')` in initialize(); add `acceptedRoots[bytes32(0)] = false` invariant; require multi-sig review of all initialize calls in upgrade pipelines."
  }
}
```

**Schema verdict:** Holds. Notes:
- `time_anchor.value` is the upgrade block, not the original deploy block. The schema doesn't care which — it's a snapshot anchor. Per-finding semantics define what it means.
- The `creation_tx` field is repurposed to point at the upgrade tx (semantically: "when this Subject came into the buggy state"). v1 should consider renaming to `subject_origin_tx` for clarity.
- A separate "copycat" finding shape (the dozens of secondary attackers) would have the same `canonical_id` as the primary finding — they're the same bug, exploited by different actors. The lifecycle event log records the multiple exploit observations.

**No schema change required.** ✓ Minor naming refinement queued for v1.

---

## Schema-stressor scorecard

| # | Stressor | Schema verdict | Lessons |
|---|---|---|---|
| 1 | Diamond proxy facet clash | Holds | secondary_locators + facet enumeration in implementation_resolution |
| 2 | Beanstalk multi-tx | Holds | composite_of + multi-tx-orchestrated rung with tx_sequence metadata |
| 3 | Solana CPI authority | Holds | time_anchor opaque per-VM; involved_accounts in SVM Locator |
| 4 | Wormhole cross-chain | Holds | secondary_locator on different chain; multi-fork-coordinated rung |
| 5 | Curve/Vyper compiler bug | Holds | toolchain_manifest carries root cause; canonical_id includes bytecode hash |
| 6 | Mango oracle manipulation | Holds | actor_assumptions per-rung metadata; loss_basis distinguishes realized vs at-risk |
| 7 | BadgerDAO frontend XSS | **GAP** | Schema needs `kind: "off-chain"` enum; off-chain Locator variant; wall_clock time_anchor |
| 8 | Nomad replay-message | Holds | time_anchor at upgrade block; canonical_id dedupes copycat exploits |

**7 of 8 round-trip without schema modification.** One concrete gap (off-chain subjects) discovered, scoped, and proposed as v0.1 migration.

## Decision: schema upgrade path v0 → v0.1

Locked (recorded in `notes.md` §17):

- Add `"off-chain"` to `Subject.kind` enum
- Define off-chain Locator variant with `off_chain_kind` discriminator (`frontend | rpc-endpoint | ci-pipeline | multisig-osint | supply-chain | bridge-validator-api | community-admin`)
- Off-chain Locators use `time_anchor: { kind: "wall_clock", value: ISO8601 }`
- `scope_artifact_id` is mandatory when `kind == "off-chain"`
- v0.1 is backward-compatible with v0 for on-chain findings; readers handle the new enum gracefully

Naming refinements queued for v1 (not blocking):
- Rename `Locator.creation_tx` → `Locator.subject_origin_tx` (semantic clarity for upgrade-introduced bugs)
- Promote `actor_assumptions` from rung-metadata to a top-level structured field for R4/R5 rungs

## Next 5 stressors to consider (when more bench corpus is verified)

- **Euler donation+liquidation** (March 2023): tests "violated invariant" canonicalization for economic-attack class
- **Reentrancy via ERC-777 hook on Curve** (multiple incidents 2020-2023): tests cross-contract composition + callback-reentrancy heuristic
- **Compound v2 cToken initialization** (theoretical / near-miss): tests heuristic-mining from non-exploited findings
- **DAO Maker** (Aug 2021): tests private-key-compromise as hybrid on-chain + off-chain
- **Ronin Bridge** (March 2022): tests pure off-chain signer compromise with secondary impact on bridge contract

These exercise additional dimensions: invariant-class canonicalization, cross-contract composition, near-miss findings, hybrid on/off-chain, and off-chain-only signer compromise.
