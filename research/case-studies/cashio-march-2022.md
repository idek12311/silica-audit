## Cashio (March 23, 2022)

**At a glance:** Solana, Cashio CASH stablecoin protocol. ~$48M minted out of thin air (later mostly returned by attacker). Initial exploit signature: `4b2GE6c…` [verify exact sig]; backed by tx series creating fake LP "saber-arrow" accounts. Bug class: missing account validation (Solana account-confusion / "Anchor without ownership constraints"). Single-tx exploit, single actor (operationally). Post-mortem: Cashio team statement (Mar 2022); OtterSec writeup; Neodyme retrospective; Sec3 / SlowMist analyses.

### Timeline

- Pre-deploy: Cashio launches Q1 2022. CASH is a stablecoin minted against Saber LP shares (USDC-USDT, USDT-UST, etc.) deposited in their "brrr" minter program.
- Vulnerability introduced: From deploy. The mint program receives an LP token + an "arrow" (a Saber-side wrapper) + a "saber" account, but does not validate that the chain of derivation is genuine — i.e., that the "arrow" really is the Saber-issued arrow for the supplied LP, that the "saber" account is the real Saber program, and so on up the validation chain.
- Audit-coverage pre-exploit: Cashio's audit history is sparse. Solana audit culture in early 2022 was still maturing; many programs shipped without formal third-party reviews.
- Attack window: Continuous since launch.
- Exploit tx: One concentrated exploit transaction; ~$48M of CASH minted, swapped to USDC/USDT, withdrawn.
- Post-mortem: Cashio halts mint. Attacker, after a public statement, returns most funds and keeps a portion as "tax on poor users" — a moral-philosophy stance that received mixed reception.

### Root cause (technical)

In Solana's Anchor framework, every account passed to an instruction is just a public-key + data blob. The program is responsible for validating *every* account's identity:
- Address (`account.key == EXPECTED_PDA`)
- Owner (`account.owner == EXPECTED_PROGRAM`)
- Data layout (deserialize and check fields)

When an account chain is involved (account A is owned by program X, account B should be derived from A and program X, account C should be derived from B…), the program must validate *each link*. Skipping a link means an attacker can substitute a forged account at that step.

Cashio's `print_cash` (or equivalent) instruction takes:
- `crate_token` — the Cashio LP wrapper around a Saber LP
- `crate_collateral` — the underlying Saber LP token account
- `saber_swap` — the Saber AMM pool account
- `arrow` — a Saber "arrow" wrapper

The vulnerable check missed: the program validated that `arrow.crate_token == crate_token` but did *not* validate that `arrow` was actually issued by the Saber arrow program (i.e., did not check `arrow.owner == SABER_ARROW_PROGRAM_ID`).

Pseudocode (reconstructed from Cashio source as it stood pre-fix):

```rust
// brrr/program/src/lib.rs (paraphrased)
#[derive(Accounts)]
pub struct PrintCash<'info> {
    pub crate_token: Account<'info, CrateToken>,
    pub crate_collateral: AccountInfo<'info>,
    pub saber_swap: AccountInfo<'info>,
    pub arrow: AccountInfo<'info>,           // ← no Owner constraint
    // … plus mint, user_cash_account, etc.
}

pub fn print_cash(ctx: Context<PrintCash>, amount: u64) -> Result<()> {
    let arrow_data = QArrowAccount::deserialize(&ctx.accounts.arrow.data.borrow())?;
    // ❌ missing: assert!(ctx.accounts.arrow.owner == &saber_arrow::ID);
    // The deserialize succeeds against attacker-supplied data,
    // because the layout is permissive.
    require!(arrow_data.crate_token == ctx.accounts.crate_token.key());
    // … now trust arrow_data fields for collateral validation
    let collateral_value = arrow_data.collateral_value;
    cash_mint::mint_to(ctx.accounts.user, amount)?;
    Ok(())
}
```

The attacker's recipe:
1. Create a *fake* arrow account at an address the attacker controls. Owner = attacker's program (or system, with synthesized data). Layout matches `QArrowAccount`. Set `crate_token` field = attacker's *fake* crate token address.
2. Create a *fake* crate token at an address the attacker controls. Layout matches Cashio's `CrateToken`. Self-consistent values.
3. Pass these fake accounts into `print_cash`. Cashio's checks confirm "arrow.crate_token == crate_token" (true, because attacker rigged both) and skip ownership checks. Cashio mints CASH against a "collateral" that doesn't exist.

The chain-of-derivation that *should* have been enforced: Cashio's `crate_token` should have been validated as being owned by the legitimate Crate program. The `arrow` should have been validated as being owned by Saber's arrow program. The `saber_swap` should have been validated as being owned by Saber's swap program. Without any of these, the entire account chain is attacker-forgeable.

### Attack flow

1. **Attacker creates 4–6 fake accounts** mimicking the Cashio/Saber chain layout. Every relationship is internally consistent (so equality checks pass), but every account's owner is attacker-controlled (or a benign program), not the genuine Saber/Crate programs.
2. **Attacker calls `print_cash(50_000_000_000_000)`** (an absurdly-large CASH amount, given as raw lamport-style integer with decimals).
3. **Cashio program's checks pass.** Equality checks confirm cross-references; ownership checks are absent.
4. **CASH minted to attacker's wallet.** ~$48M nominal value.
5. **Attacker swaps CASH** to USDC/USDT via Saber's CASH pools and via Serum AMM markets.
6. **Withdraws to outside wallets.**
7. **Eventually returns most funds** after public dialogue.

### Pre-exploit signals

- **Static signal:** Solana-specific Anchor lints exist for missing `Owner` constraint. By 2022, Sec3's anchor-lint, Neodyme's `account-validation` patterns, and OtterSec's checklists all flag `AccountInfo` parameters without ownership constraints. Cashio's contract would have been flagged immediately by any of these.
- **Audit signal:** Cashio reportedly did not undergo a formal Solana-savvy audit pre-launch [verify].
- **Public speculation:** Solana audit Twitter (Neodyme, OtterSec) had been hammering the "validate every account" message for months. Several other Solana projects had already lost funds to similar bugs (Wormhole's Feb 2022 exploit being the largest).
- **Bug bounty:** No formal program at exploit time [verify].

The signal that was *publicly known and broadcasted*: the Solana account-validation rule was the *single biggest known security risk* in the ecosystem in early 2022. A continuous-audit harness running on every Solana program would catch the entire bug class — Wormhole, Cashio, and a half-dozen smaller incidents — with one heuristic.

### What our harness would need

- **Static-analyzer output sufficiency:** Anchor-aware Solana linters are sufficient. Stock EVM tooling does not apply.
- **Required LLM-reasoning depth:**
  - Q1: "Enumerate every `AccountInfo` (untyped) parameter in every instruction. For each, what owner / address / data-layout is expected?"
  - Q2: "Is each expectation enforced by an Anchor constraint, an explicit `assert_eq!(account.owner, X)`, or a `Account<'info, T>` typed binding (which Anchor enforces)?"
  - Q3: "If the instruction reads relationships among accounts (A.field == B.key), are those relationships rooted in at least one account whose authority is independently validated (typically by ownership)?"
- **Required validation tier:** **fork-execution-state-asserted**. Local validator + deployed bytecode at exploit-block-1. Construct a transaction with attacker-forged accounts. Call `print_cash`. Assert CASH mint succeeds.
- **Required cross-contract context:** Cashio brrr + (mocked) Saber arrow + Saber swap + Crate token program. The bug requires the cross-program account chain to make sense.
- **Required temporal / economic state setup:** Pre-exploit block. Cashio's CASH mint cap must allow the requested amount.

### Lessons for Silica

- **Lead specialist:** *access-control* with Solana-specific framing (account-ownership validation).
- **Heuristic to add to library:** `solana.untyped-account-no-owner-check` — for every `AccountInfo` parameter in every Anchor instruction, require an Anchor `#[account(owner = …)]` constraint *or* an in-body `assert_eq!(account.owner, EXPECTED)` *or* an `Account<'info, T>` typed binding. Companion: `solana.account-chain-rooted-in-validated-authority` — for any check `A.field == B.key`, walk back to find whether at least one account in the relationship chain has an independently-validated authority. If not, flag.
- **Bench-case shape:** Local validator + deployed Cashio bytecode + attacker tx with forged arrow account + forged crate_token. Assert CASH minted to attacker.
- **Detection-difficulty class:** **easy**. The bug class was widely known and tooled-for at the time of the exploit. Any harness running modern Solana lints would catch it.
- **Could Cecuro plausibly catch this today?** Yes, with very high confidence, *if* it has Solana coverage. This is one of the cleanest cases for a continuous-audit harness: the heuristic is well-defined, the false-positive rate is moderate (some uses of bare AccountInfo are intentional), and the failure mode is catastrophic.

This case is a particularly clean illustration of why per-chain heuristic libraries are necessary. The same mental concept — "validate the identity of privileged inputs" — exists in EVM (msg.sender vs ACL) and Solana (account.owner vs expected program), but the manifestation is so different that a generic detector misses both. Silica should have explicit Solana, EVM, MoveVM, and CosmosSDK heuristic packs.
