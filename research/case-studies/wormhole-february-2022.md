## Wormhole Bridge (February 2, 2022)

**At a glance:** Solana ↔ Ethereum bridge. ~$326M (120,000 wETH) minted out of thin air on Solana, then bridged out to Ethereum. Attacker tx on Solana: tx signature `4DcnSV7…` [verify exact sig]; corresponding Ethereum drain via `complete_transfer` paths. Bug class: missing/spoofed signature-set verification — `Secp256k1` precompile substituted with a fake. Single-tx-on-each-side; single actor. Post-mortem: Jump Trading / Wormhole official statement (Feb 2022); samczsun thread; CertiK and Neodyme analyses.

### Timeline

- Pre-deploy: Wormhole launches mid-2021 as a multi-chain message bus. Solana-side core program is `bridge_program` (Rust, Anchor-based partly).
- Vulnerability introduced: Initial deploy. The `verify_signatures` instruction trusts that the `secp256k1_program` (Solana's native secp256k1 verification system program) is used. The check is "is the program key in this account the secp256k1 program?" — but the check uses `solana_program::sysvar::instructions::load_current_index_checked` and a manual lookup that the attacker could bypass.
- Audit-coverage pre-exploit: Neodyme audited the program in 2021 [verify]. The audit report flagged some account-validation issues but not the specific instruction-introspection gap that enabled the spoof.
- Attack window: ~6 months at deployed scale. The fix went into a developer commit on Jan 13, 2022, but had not yet been deployed when the exploit hit on Feb 2.
- Exploit txs: A pair on Solana (deposit 0.1 ETH to look legitimate, then mint 120k wETH against forged guardian VAA), then a bridge-back on Ethereum.
- Post-mortem: Jump Crypto replenished the 120k ETH from corporate treasury within hours.

### Root cause (technical)

Wormhole's security model: 19 "guardians" sign a Verifiable Action Approval (VAA) — a message attesting "X tokens were locked on chain A." On the destination chain, the program verifies guardian signatures, and on success mints the wrapped representation.

On Solana, signature verification leverages the *native secp256k1 verify instruction*. Instead of doing the curve math inside the program (slow), Wormhole posts a separate `Secp256k1` system instruction in the same transaction that verifies N signatures, then the bridge program inspects that prior instruction and trusts its result.

The vulnerable function: `verify_signatures`. Its job is to look at the immediately-preceding instruction in the same transaction and confirm:
1. The instruction's program ID is the secp256k1 program.
2. The signatures verified are over the correct VAA hash.
3. The signers correspond to current guardian set.

The bug was in step 1's enforcement.

Pseudocode (reconstructed from the public Wormhole Solana source pre-fix):

```rust
// solitaire/program/src/instructions/verify_signatures.rs
pub fn verify_signatures(ctx: Context<VerifySignatures>, ...) -> Result<()> {
    let ix_sysvar = &ctx.accounts.instruction_sysvar; // ← AccountInfo
    // Read previous instruction
    let current_idx = sysvar::instructions::load_current_index(...);
    let secp_ix = sysvar::instructions::load_instruction_at(current_idx - 1, ix_sysvar)?;
    // ❌ MISSING: assert!(secp_ix.program_id == solana_program::secp256k1_program::ID);
    // The check was either omitted or bypassable due to using load_instruction_at
    // (which doesn't validate the sysvar) instead of load_instruction_at_checked
    // (which does).
    // … parse secp_ix.data and accept declared signers as proof
}
```

The fix later (Jan 13, 2022 commit, deployed Feb 2 post-exploit) replaced `load_instruction_at` with `load_instruction_at_checked`, which validates that the sysvar account's owner is the System Program — preventing the attacker from supplying a malicious sysvar account.

The attacker therefore could:
1. Construct a transaction whose first instruction is a *fake* secp256k1-style instruction that they themselves crafted (program ID = anything, data = "I claim signatures verified").
2. Pass a *fake instructions sysvar* account whose contents the attacker controls.
3. Wormhole's `verify_signatures` reads the fake sysvar, sees the fake declared signers, accepts them as guardian sigs, and proceeds to call the mint path.

The mint path then trusts that the guardians signed off on "120k wETH transfer to attacker," credits the attacker's Solana wETH ATA with the supply, and the attacker bridges it to Ethereum.

### Attack flow

1. **Attacker creates a Solana transaction** with three instructions:
   1. A *fake* secp256k1-style instruction that mimics the layout of a real one — program ID is attacker-controlled, data is crafted to appear as 13-of-19 guardian signatures over a VAA the attacker writes.
   2. A *fake* instructions-sysvar account: Solana's account model lets the caller supply an account at the position the program expects. The sysvar account owner check was the missing piece.
   3. The Wormhole `verify_signatures` instruction, then the `post_vaa` and mint chain.
2. **`verify_signatures`** reads the fake sysvar via `load_instruction_at`, parses the fake "secp256k1" instruction, and accepts the declared signers.
3. **`post_vaa`** records the VAA as verified.
4. **`complete_transfer`** mints 120,000 wETH on Solana to attacker's wallet.
5. **Attacker bridges** wETH back to Ethereum via the legitimate path. Ethereum-side `complete_transfer` requires a real guardian VAA, so the attacker now needs to repeat the trick on Ethereum.

For the Ethereum exfil leg, the attacker actually used the *real* Solana → Ethereum mechanism but with the falsely-minted Solana wETH as the asset being burned. Wormhole on Ethereum sees the legitimate burn-on-Solana event (because Solana now legitimately recognizes the attacker's 120k wETH), and the guardians (unaware of the spoof) sign a real VAA for the unwrap. The unwrap on Ethereum dispenses 120k wETH from Wormhole's locked reserves.

### Pre-exploit signals

- **Static signal:** Solana-specific Anchor lints exist for missing `Owner` constraint on accounts, and there are linter rules for `load_instruction_at` vs `load_instruction_at_checked`. Stock 2021 Anchor pre-dates that lint; the fix-by-rename is exactly what the post-incident lint enforces.
- **Audit signal:** Neodyme's audit covered account-ownership checks. Their report mentioned that "instruction introspection should validate the sysvar account." It is not publicly clear whether this was rated critical or informational at the time [verify].
- **Public speculation:** None public pre-exploit. Solana program-security culture in late 2021 was relatively immature; the "missing-owner-check" class was being discovered in many programs around that period (Cashio used one shortly after; cf. that case study).
- **Bug bounty:** The Wormhole repo had a public commit titled (effectively) "use load_instruction_at_checked" merged Jan 13. The exploit was Feb 2. A monitor watching the Wormhole repo for security-relevant commits could in principle have seen the fix and front-run the deploy.

The signal that was *publicly visible*: a security-relevant fix in a public repo, *not yet deployed*. This is one of the highest-quality signals in DeFi history. Anyone running an automated diff between deployed bytecode and HEAD-of-master would have flagged it.

### What our harness would need

- **Static-analyzer output sufficiency:** Anchor / Solana-specific linters with the `instruction-sysvar-checked` rule are sufficient. Stock Slither/Mythril (EVM tools) don't apply.
- **Required LLM-reasoning depth:**
  - Q1: "Does the program perform instruction introspection (read prior or following instructions in the tx)? If yes, does it validate that the introspected account is the genuine instructions sysvar (owned by System Program)?"
  - Q2: "Are there any AccountInfo parameters whose owner / address is not validated against a constant?"
  - Q3: "Does the program trust off-chain attestations (signatures) verified by another on-chain program? If yes, is the calling program's identity validated?"
- **Required validation tier:** **fork-execution-state-asserted** on Solana. Spin a local validator with deployed bytecode at exploit-block-1. Construct the malicious transaction (including a fake sysvar). Invoke `verify_signatures + post_vaa + complete_transfer`. Assert wETH minted to attacker.
- **Required cross-contract context:** Solana bridge program + token mint program + (for the Ethereum leg) Ethereum Wormhole bridge contract. Cross-chain.
- **Required temporal / economic state setup:** Need the Ethereum side to hold sufficient wETH reserves — at exploit time, ~$326M.

### Lessons for Silica

- **Lead specialist:** *signature* (primary — verifying the verifier), *cross-chain* (second), *bridge* (third).
- **Heuristic to add to library:** `solana.account-owner-validation` — for every program, every AccountInfo passed to an instruction must have its `owner` (and where applicable, `key`) validated against an expected constant or against an authority on file. Companion: `solana.instruction-introspection-checked` — any use of `load_instruction_at`/equivalent must use the `_checked` variant or hand-validate sysvar ownership.
- **Bench-case shape:** Local validator + deployed Wormhole bytecode at exploit-block-1. Construct attacker tx with fake sysvar. Assert mint succeeds.
- **Detection-difficulty class:** **medium**. The bug's surface is non-trivially Solana-specific. Once you know the question ("did they validate the sysvar?"), the answer is in 5 lines of code. But the question lives in a Solana-mental-model that EVM-trained tooling and reasoners often lack.
- **Could Cecuro plausibly catch this today?** *Conditional on Solana coverage.* If Cecuro's specialist library includes an `solana.account-owner-validation` heuristic, yes. If it's EVM-only, no — the bug doesn't translate to EVM mental models. This case study is the strongest argument for explicit per-chain heuristic libraries: the same conceptual flaw (missing identity check on a privileged input) manifests very differently in EVM (msg.sender == authorized) vs Solana (account.owner == expected_program), and a generic "missing access control" rule misses both.
