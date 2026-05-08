## Euler Finance (March 13, 2023)

**At a glance:** Ethereum mainnet. ~$197M lost (DAI, WBTC, stETH, USDC). Primary exploit tx: `0xc310a0affe2169d1f6feec1c63dbc7f7c62a887fa48795d327d4d2da2d6b111d` (the headline drain) plus the well-known setup tx `0x71a908be0bef6174bccc3d493becdfd28395d8898f6f0f1ba999d2a3aaad0dee`. Bug class: missing health check after donation/burn (donateToReserves) → self-liquidation profit. Multi-tx, single-actor (operationally; later multiple addresses returned funds). Post-mortem: Euler Labs blog "Euler Exploit Post-Mortem" (Mar 2023) and Rekt News "Euler Finance — REKT" entry; also Omniscia and ChainSecurity follow-up writeups [verify exact URLs].

### Timeline

- Pre-deploy: Euler v1 launches Dec 2021; lending core lives in `Etoken`/`Dtoken` modules behind a module router. Multiple audits (Halborn, Sherlock, ZK Labs, Solidified, Certora). Euler-mainnet has paid ~$4M in audits/contests by Q1 2023.
- Vulnerability introduced: EIP-14, `eIP 14 — Contract Layout`, merged ~Jul 2022 [verify], adds `donateToReserves(uint256 subAccountId, uint256 amount)` to `Etoken`. The function lets a depositor burn eTokens and credit the reserve account in one call. Critically, it skips the post-state `checkLiquidity()` (or routes around it) that every other state-mutating Etoken function calls.
- Audit-coverage pre-exploit: Sherlock contest covered the original Etoken; the donate function was added later in eIP-14. The new function path was reviewed but the absence of the liquidity check post-mutation was not flagged as exploit-grade. Sherlock later acknowledged the gap.
- Attack window: ~8 months between donate addition and exploit.
- Exploit txs: setup `0x71a908…` (flash loan + leveraged borrow + self-donate to push self underwater) and `0xc310a0…` (self-liquidation by attacker EOA).
- Post-mortem: All funds returned by Mar 26, 2023. Euler froze the lending mechanism and later published a detailed Solidity-level post-mortem.

### Root cause (technical)

Euler's lending invariant is: any function that mutates a user's debt or collateral must end by calling `checkLiquidity(account)` (or implicitly defer it via a "liquidity check" registration in the global checkpoint). `donateToReserves` mutates `eTokenStorage.users[account].balance` (decreases) and credits reserves, but does not register a liquidity check on the donor.

Pseudocode of the buggy function (reconstructed from verified bytecode and Euler GitHub history):

```solidity
// Etoken.sol — donateToReserves
function donateToReserves(uint256 subAccountId, uint256 amount) external nonReentrant {
    address account = getSubAccount(msgSender(), subAccountId);
    // Snapshot
    AssetCache memory assetCache = loadAssetCache(...);
    // Convert tokens → underlying-equivalent
    uint256 amountInternal = balanceFromUnderlyingAmount(assetCache, amount);
    // Burn from donor
    decreaseBalance(assetCache, account, amountInternal);
    // Credit reserves
    increaseReserves(assetCache, amountInternal);
    emit RequestDonate(...);
    // ❌ MISSING: checkLiquidity(account)  — every other mutating fn calls this
}
```

For comparison, `transfer`, `withdraw`, `borrow`, and `repay` all end with `checkLiquidity(...)` either directly or via the deferred-check pattern. The mismatch is that `donate` reduces collateral basis (your eToken balance is the receipt for collateral) without confirming you remain solvent.

The exploit's punchline: an account holding $X collateral and $Y debt that is borderline-healthy can `donate` enough collateral to itself to flip underwater, while still holding the debt. Now the account is liquidatable. Euler's liquidation logic offers a discount to the liquidator that scales with how underwater the account is. Because the underwater state is *self-induced and arbitrarily deep*, the liquidator (controlled by the same attacker) takes the discounted collateral at extreme markup. The attacker liquidates *themselves* via a second EOA and walks away with the discount.

The math: Euler's `getLiquidationOpportunity` uses a discount = `min(maxDiscount, sqrt(healthScore - 1))` style curve [verify exact formula]. An account taken from health=1.0 to health=0.05 yields the maximum discount, often >20%. Multiply by ~$30M of recursively-borrowed collateral and the take is an order of magnitude larger than the attacker's seed capital.

### Attack flow

1. **Flash loan** ~$30M DAI from Aave (tx `0x71a908…`).
2. **Deposit** DAI into Euler `eDAI` contract → receive eDAI as collateral receipt. Account A.
3. **Recursively borrow + redeposit** to amplify position. Euler's "leveraged deposit" path lets a single account hold 10x leveraged collateral against own debt.
4. **`donateToReserves(0, hugeAmount)`** from account A. Account A's eDAI balance crashes; debt unchanged. Health < 1.
5. **From a second EOA (account B)** call `liquidate(A, ...)`. Liquidation engine grants the maximum discount because A is far underwater. B receives discounted eDAI and assumes a fraction of A's debt.
6. **B withdraws** the discounted eDAI to underlying DAI.
7. **Repay flash loan**, keep delta. Repeat for WBTC, stETH, USDC pools.

State changes per step are localized to the eToken/dToken storage of the asset under attack. No oracle was touched. No governance was touched. The exploit is a pure accounting flaw amplified by a flash loan.

### Pre-exploit signals

- **Static signal that existed:** Slither has a "missing-state-check-after-modifier" detector and a "function modifies state without health check" pattern in some custom Euler-aware rules — but not in stock Slither. Stock Slither would have flagged `donateToReserves` only as "external function with no access control," which on its own is normal for a permissionless lending market.
- **Audit signal that existed but was missed:** The Sherlock contest covering eIP-14 had submissions about reserve accounting and donate semantics. None framed it as a self-liquidation vector. Sherlock's post-mortem acknowledged this.
- **Twitter / public signal:** None pre-exploit. There was no public speculation. Researchers @YannickCrypto and @samczsun-style threads only appeared post-fact.
- **Bug bounty:** Euler ran an Immunefi bounty up to $1M+. No relevant submission landed on this surface despite being live for months.

The signal that *would have required novel inference*: a reasoner needs to ask "does every function that decreases collateral also enforce health?" — a *cross-cutting invariant* over the contract surface. This is the kind of question a static analyzer typically can't ask without protocol-specific configuration; it is exactly the kind of question a well-prompted LLM with the contract source can ask if directed to enumerate state-mutating functions and group them by whether they end in `checkLiquidity()`.

### What our harness would need

- **Static-analyzer output sufficiency:** Slither/Mythril/Echidna alone are *not* sufficient. Slither flags the function as state-mutating + external + no access control; this is true of every public lending function and produces no actionable rank. Mythril's symbolic execution on `donateToReserves` would not flag it without a property like "for all accounts a, post(donate(a)) implies healthScore(a) >= 1." That property has to be supplied.
- **Required LLM-reasoning depth:**
  - Q1: "Enumerate every external state-mutating function in `Etoken`. For each, list the post-state checks it performs."
  - Q2: "Among those, which mutate collateral accounting? Of those, which do not call `checkLiquidity` or register a deferred check?"
  - Q3: "Is there a path where a user can self-induce undercollateralization, then capture liquidation discount?"
  - The agent must hold the *protocol's* invariant model in mind (collateral receipt = eToken balance; liquidations pay discount scaled by underwater depth) and cross-reference it against the function-by-function check list.
- **Required validation tier:** **fork-execution-with-mocked-actor** plus **multi-tx-orchestrated**. To prove exploit, the harness must (a) fork mainnet at a pre-exploit block, (b) spin up two EOAs, (c) execute deposit → leveraged borrow → donate → liquidate from EOA1/EOA2, (d) assert that EOA-controlling-funds-out > funds-in. Pure invariant fuzzing with Echidna *would* catch it given the right invariant ("for every multi-tx sequence, no actor's net withdraw > net deposit assuming no oracle move and no genuine bad debt") — but that invariant has to be authored.
- **Required cross-contract context:** Yes — interaction with the `RiskManager` module that owns `checkLiquidity` and the `Liquidation` module that grants the discount. The bug is *between modules*, not within `donate`'s body.
- **Required temporal / economic state setup:** Specific block close to exploit (so liquidity depths in Aave/Balancer for the flash loan exist). No oracle move required. No governance state. No time travel.

### Lessons for Silica

- **Lead specialist:** *state-manipulation* (post-state invariant violation under multi-tx self-attack), with *economic* as second-chair (the liquidation-discount curve is what makes the bug profitable; without it the attacker just goes underwater for fun).
- **Heuristic to add to library:** `lending.no-health-check-on-collateral-decrease` — for every function in a lending core that decreases a user's collateral receipt balance, prove a post-state liquidity check is enforced (directly, by deferred-check pattern, or by routing through a checked function). Implementation: AST walk of all functions touching `users[*].balance -= ...` cross-referenced against `checkLiquidity` call sites.
- **Bench-case shape:** Two-EOA deposit-borrow-donate-liquidate sequence on a forked mainnet block. Expected output: PnL > 0 for combined EOA pair after net flash-loan repayment.
- **Detection-difficulty class (retrospective):** **medium**. Once you know "donate skips check," the proof is mechanical. Discovering it requires the cross-cutting-invariant question, which is within reach of a moderately-prompted reasoner against the Etoken source.
- **Could Cecuro plausibly catch this today?** If Cecuro has a lending-protocol invariant template (collateral-decreasing-function → must-end-with-health-check) and runs it across the 200 lending forks in production, *yes, plausibly*. Without that template, no — generic taint/reentrancy/access-control rules would not surface it. The novelty isn't bug exoticism; it is the cross-cutting invariant that has to be authored once and then trivially applies.
