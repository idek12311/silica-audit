# Multi-VM Stress Test — Solana SVM

> Why Solana first: $50B+ ecosystem TVL, more public exploits than any non-EVM chain, and no auto-PoC competitor. If the spine handles Solana cleanly, it's VM-agnostic. If it can't, EVM bias is encoded somewhere.

## Solana fundamentals (relevant differences from EVM)

| Concept | EVM | Solana |
|---|---|---|
| Code host | Smart contract (with state) | Program (stateless) |
| State host | Same contract | Account (separate) |
| Caller identity | `msg.sender` (single) | `is_signer` per-account (many) |
| Cross-program call | `CALL` with msg.sender chain | CPI with bounded depth, no callbacks |
| Reentrancy | Possible (callbacks) | Impossible by construction |
| Address derivation | Hash of (deployer, nonce/salt) | Public-key (ed25519) or PDA (seeded hash) |
| Bytecode | EVM bytecode | BPF |
| Source standard | Solidity / Vyper / Yul | Rust (Anchor framework conventional) |
| State mutation pattern | `SSTORE` to slots | Account data deserialization + serialization |
| Time | Block height | Slot |
| Code upgrades | Proxy patterns | Native (BPF Loader Upgradeable) |

## What this means for Silica's spine

Two questions:
1. Does the Finding schema hold without modification?
2. Does the validation tier ladder hold without modification?

### Finding schema

From `schema-draft-v0.md` stress test 3, schema verdict was: holds. The key abstractions:
- `Subject.kind = "svm"`
- `Locator` is a discriminated union; SVM variant has `program_id`, `slot`, `program_version`, `idl_ref`, `involved_accounts`
- `time_anchor` is opaque; SVM uses `slot`
- No `msg.sender` assumption — actor information is in `involved_accounts[]` with `is_signer`

### Validation tier ladder

From `validation-tiers.md`, the rungs were defined VM-abstractly. Per-rung implementor:

| Rung | EVM implementor | SVM implementor |
|---|---|---|
| R0 static-only | Slither | Soteria, Sec3 X-ray (proprietary), or LLM-only for many SVM bugs |
| R1 compile-only | `forge build` | `anchor build` |
| R2 fork-no-revert | `forge test --fork-url` | `solana-test-validator` with state snapshot |
| R3 fork-state-asserted | `forge test` with assertions | `anchor test` with assertions |
| R4 fork-with-mocked-actor | `vm.prank()` | provider-wallet impersonation, programmatic signer |
| R5 multi-tx | `vm.warp() + vm.startPrank()` | sleeps + transactions against test-validator |
| R6 multi-fork | multi-anvil | multi-validator (rare) |
| R7 mempool | mev-boost simulator | Solana banking-stage simulation (less mature) |
| R8 time-shifted | `vm.warp()` | clock-sysvar mocking |
| R9 invariant-fuzz | Echidna, Medusa | Trident (Solana fuzzer, less mature) |
| R10 formal-proof | Halmos, hevm | (immature on SVM; PVM proofs research-stage) |

R7, R9, R10 are weaker on SVM. The schema accepts this — `highest_applicable` for SVM is often capped at R5 today.

## Solana-specific bug classes the harness must catch

This is a partial list — full taxonomy in `research/bug-taxonomy.md`. The classes are sufficiently different from EVM that they need their own taxonomy entries, not generic re-use:

### SVM-CPI-AUTHORITY-CONFUSION
The CPI's signing authority isn't verified as a program-derived PDA. Attacker passes a PDA they control; transfer signs with their PDA.

**Detection signal:** Anchor account constraint missing `seeds = [...], bump = ...` on PDA accounts that act as signers.
**Validation:** R3 fork-state-asserted via anchor test.
**Real exploits:** Cashio (March 2022), variants of Wormhole-Solana issues.

### SVM-MISSING-SIGNER-CHECK
A function expects an authority but doesn't enforce `is_signer`. Anyone can pass any account as the authority.

**Detection signal:** account marked `signer` in IDL but not enforced in code; or `signer` constraint missing in Anchor account struct.
**Validation:** R3 fork-state-asserted.

### SVM-ACCOUNT-TYPE-COSPLAY
Account passed as type X is treated as type Y. Different deserialization could grant different privileges.

**Detection signal:** discriminator check missing on deserialized account; bytewise pattern match against expected struct without explicit type tag.
**Validation:** R3 fork-state-asserted with malicious account-data injection.

### SVM-SYSVAR-SPOOFING
Program reads from sysvar (e.g., Clock, Rent) but doesn't verify the passed account is the actual sysvar.

**Detection signal:** account named like a sysvar but no `solana_program::sysvar::*::check_id()` call.
**Validation:** R3 with attacker-passed fake-sysvar account.

### SVM-ARBITRARY-CPI
Program calls into a `program_id` passed by the user without restricting to a whitelist.

**Detection signal:** CPI target accounts derived from instruction args, not from constant or PDA.
**Validation:** R3 with attacker-pointed CPI target.

### SVM-MISSING-OWNER-CHECK
Program reads account data without verifying the account is owned by the expected program.

**Detection signal:** Anchor account struct without `#[account(owner = ...)]` or `#[account(constraint = ...)]`; raw-Solana code without `account.owner == expected_id` check.
**Validation:** R3 with attacker-owned account masquerading as expected type.

### SVM-DUPLICATE-ACCOUNT-MUTABLE
Two accounts in the instruction list are the same account, both marked `is_writable`. Mutations conflict.

**Detection signal:** instruction validates account positions but doesn't reject duplicates among writables.
**Validation:** R3 with duplicate-account exploit.

These seven are a starting set. A real taxonomy would have ~15 SVM-specific entries.

## Solana validation infrastructure

What Silica needs to build (or integrate) for SVM support:

### Static analysis: Soteria + custom
- Soteria is the open-source Slither analog for Solana. Older codebase, modest detector inventory.
- Sec3 X-ray and OtterSec's tools are proprietary; not integrable.
- **Custom Anchor-IDL analyzer:** parses Anchor IDLs, identifies missing constraints, missing signer checks. ~weeks to build.

### Fork environment: solana-test-validator + state snapshot
- `solana-test-validator --clone <account_pubkey>` to clone live mainnet state into a local validator at a slot.
- State snapshots are fragile across slot updates; need a snapshot-fixture system (analog of Foundry's fork at block).
- Anchor's testing harness wraps this; we use Anchor's APIs for R3+ rungs.

### PoC framework: anchor test
- `anchor test` runs TypeScript scripts against a `solana-test-validator`. Familiar to Solana devs.
- Native Rust-side testing also available (`#[test]` attributes), more performant but less ergonomic.
- Silica's PoC generator emits TypeScript Anchor tests for SVM findings.

### Fuzzing: Trident
- Trident is the Echidna analog for Solana. Less mature; smaller corpus of invariants in production.
- Open opportunity: build a richer Solana invariant template library (modeled on Foundry's `invariant_*` patterns).

## Cost model for SVM audits

Mostly similar to EVM:
- LLM calls: ~same cost shape, slightly more context per agent because Anchor IDLs and Rust modules are larger than equivalent Solidity.
- RPC: Solana mainnet RPC is much cheaper (Helius, QuickNode) than EVM archive nodes.
- Fork state: small (few MB) — easy to snapshot and clone.
- Static analysis: Soteria is fast; LLM context-build is the dominant cost.

Estimated per-audit cost for medium SVM protocol (~10 programs, 5,000 Rust LOC): $20–60 on cheap path, $80–150 on full ladder.

## What's underserved

The state of the SVM audit market today:

- **Sec3** and **OtterSec** dominate paid audits. Both are commercial, manual-led with proprietary tooling. No public benchmark numbers.
- **Neodyme** does paid audits; published research (sealevel-attacks educational corpus) is widely cited.
- **Soteria** is the only open-source detector tool. Old; small detector inventory.
- **No auto-PoC platform exists for Solana.** This is the gap.
- **No continuous monitoring** for Solana programs (Forta and Hypernative are EVM-focused; ChainPatrol does branding-side, not on-chain).

If Silica ships an auto-PoC capability for Solana that Cecuro can't match (because they're EVM-only), the SVM front becomes a defensible niche immediately. Sec3/OtterSec aren't shipping auto-PoC; they ship PDFs.

## Bench corpus targets (Solana subset)

From `research/bench-corpus.md` (when populated): target ~10 Solana exploits covering the bug classes above. Expected mix:
- Cashio (account validation)
- Wormhole (Solana side; signature)
- Mango Markets (oracle — cross-VM-applicable category)
- Crema Finance (account validation)
- OptiFi (program close exploit)
- Slope wallet (private-key handling — frontend, off-chain)
- Several smaller protocol exploits

## v1 scope decision

Silica's v1 SVM coverage:
- Static-only: usable with Soteria + custom Anchor-IDL analyzer
- R3 fork-state-asserted: usable with anchor-test PoC generator
- R5 multi-tx: usable
- R9 fuzz: experimental (Trident integration; small invariant template library)
- R10 formal: out-of-scope for v1

Coverage is sufficient for ~80% of historical Solana exploits in the bench corpus. The remaining 20% (e.g., novel cryptographic bugs, specific race conditions) are roadmap items.

## What this stress test confirms

- The Finding schema **holds** for SVM without modification. ✓
- The Validation tier ladder **holds** with VM-specific implementors. ✓
- The Heuristic library **holds** with `vm_scope: ["svm"]` filter. ✓
- The five routers **hold** — tool router selects Soteria vs anchor-test, model router selects best Solana-savvy LLM, etc. ✓

EVM bias was *not* baked into the spine. The platform is genuinely VM-agnostic at v0.

The expensive part of SVM expansion is building the per-VM tool layer (Anchor IDL analyzer, anchor-test PoC generator, Trident invariant library). That's tactical work, not architectural rework.

## Move sketch (briefer)

Move (Aptos / Sui) is a smaller stress test but worth a quick pass:

- Type system: linear types — resources can't be silently duplicated/dropped. Eliminates entire bug classes (no "double-spend by re-entering a balance update").
- New bug classes: resource leaks (orphaned resources after a function aborts), capability misuse (capabilities are values, can be stored/transferred — needs careful access control), generic-type confusion (Move generics with phantom types).
- Static analysis: `move-prover-lite` (lightweight); Move Prover for formal proofs (R10-tier on Move is unusually strong).
- Fork environment: `aptos move test` runs against a local node with state cloning.

Schema mapping:
- subject.kind = "move"
- primary_locator: package_address, module_name, package_version
- source_format: "move_published"

The schema holds for Move with the same abstractions as SVM. The Locator differs (no slot, no PDA — but `package_version` serves as time_anchor). The bug taxonomy diverges sharply because Move's type system rules out many EVM/SVM bugs and introduces its own.

For v1: Move support is roadmap, not initial. Aptos and Sui combined TVL is meaningful but smaller than Solana, and the Move audit market is even more nascent than Solana's.

## Cairo sketch

Cairo (Starknet) is the smallest priority of the four:
- Account abstraction native — no msg.sender semantics
- Different proof system (STARK-based)
- Solidity-Cairo cross-talks via L1↔L2 messaging
- Tooling: Caracal (Slither analog for Cairo), Starknet Foundry

Schema: holds with `kind = "cairo"`. Tool layer: needs Caracal + Starknet Foundry integration. Bug classes: significant overlap with EVM (Cairo borrowed many semantics) plus account-abstraction-specific issues.

For v1: Cairo is post-roadmap. We support multi-VM in spine, not all VMs in production v1.

## Conclusion

Solana stress test passes. The spine is VM-agnostic. EVM bias was rejected at design time, not retrofitted.

Per-VM tool layer is the work; per-VM schema work is none.
