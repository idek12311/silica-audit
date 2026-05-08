## Cream Finance — AMP Reentrancy (August 30, 2021)

**At a glance:** Ethereum mainnet. ~$18.8M loss in the first event (AMP/ETH reentrancy), part of the broader Cream Finance loss series totaling >$130M across 2021. Exploit tx for the AMP event: `0xa9a1b8ea288eb9ad315088f17f7c7386b9989c95b4d13c81b69d5ddad7ffe61e` [verify]. Bug class: ERC-777 / ERC-1820 hook reentrancy in a Compound-fork lending market. Multi-internal-call single-external-tx; single actor. Post-mortem: Cream Finance Discord/Medium statement (Aug 2021); Mudit Gupta's writeup; PeckShield brief; Rekt News "C.R.E.A.M. — REKT" entry (covers the series).

### Timeline

- Pre-deploy: Cream V1 forks Compound's `cToken` system in 2020. Cream lists AMP, an ERC-777-like token with sender/receiver hooks, in 2021.
- Vulnerability introduced: AMP listing date. The market `cAMP` integrates with `Amp.transferAndCall` which invokes the recipient's `tokensReceived` hook before the cToken accounting completes.
- Audit-coverage pre-exploit: Cream's market listing process did not require a per-token reentrancy review for tokens with transfer hooks. Compound itself avoids ERC-777 listings in part for this reason.
- Attack window: From AMP listing to exploit, ~weeks.
- Exploit tx: Single tx, multi-internal-call, ~17 reentrancy iterations.
- Post-mortem: Cream pauses AMP market, reimburses partially, then suffers two more (independent) exploits later in 2021.

### Root cause (technical)

The Compound `cToken` pattern updates internal state *after* a token transfer. For ERC-20 tokens, this is fine because `transferFrom` doesn't yield control to the user. For ERC-777, the recipient's `tokensReceived` hook fires *during* the transfer, before the cToken's `borrow` finishes updating its accounting.

Pseudocode of the vulnerable path (Compound v2 fork):

```solidity
// CErc20.sol
function borrow(uint256 borrowAmount) external returns (uint256) {
    return borrowInternal(borrowAmount);
}

function borrowInternal(uint256 borrowAmount) internal {
    accrueInterest();
    return borrowFresh(payable(msg.sender), borrowAmount);
}

function borrowFresh(address payable borrower, uint256 borrowAmount) internal {
    // 1. Solvency check
    (uint256 err, ...) = comptroller.borrowAllowed(address(this), borrower, borrowAmount);
    require(err == 0);
    // 2. Update internal state — increase borrowBalance
    accountBorrows[borrower].principal = newBorrowBalance;
    totalBorrows = totalBorrows + borrowAmount;
    // 3. Transfer underlying to borrower (AMP)
    doTransferOut(borrower, borrowAmount);  // ← hook fires here for AMP
    // 4. Emit event
    emit Borrow(...);
}

// During doTransferOut, AMP calls tokensReceived(borrower) → attacker contract
// Attacker reenters comptroller-aware state via a *different* cToken
```

The reentrancy isn't on the same `cAMP` market. The attacker uses the AMP hook to reenter into `cETH.borrow` (or any other cToken). At the moment of reentry, the comptroller checks "is borrower healthy?" using up-to-date AMP debt accounting (already incremented) but the *collateral* check uses the existing balance which has not yet been reduced — and the attacker's collateral position has not been modified yet because they haven't actually withdrawn anything.

But that's not the bug. The actual bug is more subtle: the attacker first deposits AMP as collateral (mints `cAMP`). Then they borrow AMP. During the borrow, the AMP `tokensReceived` hook reenters and calls `cAMP.borrow` *again* — but here's the trick — during reentry the borrower hasn't yet had their *first* borrow finalized in the comptroller's account-state view (or alternatively, the comptroller does see the first borrow but the attacker has additional collateral capacity from the AMP they're about to receive). The compounding effect of reentrant borrows means the attacker can borrow far more than their collateral allows.

The primary vector documented by Mudit Gupta: the attacker borrows ETH from `cETH` while inside the AMP `tokensReceived` hook, and the comptroller's solvency check at that point uses an inconsistent snapshot — the AMP debt is not yet reflected in the collateral conversion factor used by `getAccountLiquidity`.

### Attack flow

1. **Attacker deposits ~500 ETH** as collateral in `cETH`.
2. **Attacker borrows ~19M AMP** from `cAMP` against this ETH collateral. Inside `borrowFresh`'s `doTransferOut`, AMP triggers attacker's `tokensReceived` hook.
3. **Inside the hook** (still inside the original `cAMP.borrow`), the attacker calls `cAMP.borrow` *again* with a similar amount. The comptroller's `borrowAllowed` check sees the borrower's collateral as the original 500 ETH — because the first borrow's debt has been credited but the collateral remains untouched, and the *cross-asset* snapshot is read from cached values that haven't been updated for this transaction.
4. **The reentrant borrow** completes with another 19M AMP transferred. The hook fires again; this could be repeated, but the documented exploit reentered just once for a clean 2x.
5. **Attacker withdraws** the borrowed AMP, swaps to ETH/stables on Uniswap, walks away.

Net profit: approximately the second borrow's value minus tx cost, since the first borrow is "legitimate" (collateralized) but the second borrow is uncollateralized and the attacker abandons their cETH collateral (which is worth less than the second borrow's value).

### Pre-exploit signals

- **Static signal:** Slither has a `reentrancy-eth` and `reentrancy-no-eth` detector. The Compound fork pattern (`doTransferOut` near end of borrow, after state update) generally trips these for non-Compound code, but Compound-specific reviewers had widely declared "Compound is safe-by-design because state is updated before transfer." For ERC-20, true. For ERC-777, false. Slither's detector does not differentiate token semantics.
- **Audit signal:** OpenZeppelin's 2018 advisory "Reentrancy after Istanbul" warned about ERC-777 hooks. Compound's own deployment guidelines explicitly warned against listing ERC-777 tokens. Cream's listing process did not enforce this guideline.
- **Public speculation:** Mudit Gupta and others had been publicly warning about ERC-777-on-Compound-forks since 2020. The imBTC reentrancy on Lendf.Me (Apr 2020) was a *direct prior incident* of exactly this class. Cream's AMP listing happened anyway.
- **Bug bounty:** Cream had no published bounty pre-exploit comparable to the loss [verify].

The signal that *was already public*: this exact bug class had blown up Lendf.Me 16 months earlier. Anyone listing ERC-777-style tokens on a Compound fork was repeating a known mistake. This is the cheapest possible signal — historical pattern matching against a previously-disclosed exploit class.

### What our harness would need

- **Static-analyzer output sufficiency:** Slither's reentrancy detector flags `borrowFresh` (because state-changes precede external call to `doTransferOut`). On a well-formed audit pipeline this *should* be triaged but is normally suppressed because "Compound pattern is fine." A harness that does not suppress would have flagged it. So: **Slither alone is sufficient if its output is interpreted with token-semantics context (i.e., the underlying token implements ERC-777-like hooks).**
- **Required LLM-reasoning depth:**
  - Q1: "Does the underlying token of any market implement transfer hooks (ERC-777, ERC-1363, custom)?"
  - Q2: "If yes, can the recipient hook reenter any other cToken / lending function before the originating function's state update is fully visible across all cTokens?"
  - Q3: "Does the comptroller use cross-cToken solvency checks that would be affected by mid-transaction state inconsistency?"
- **Required validation tier:** **fork-execution-state-asserted** is enough. Fork mainnet at exploit-block-1, deploy a malicious `tokensReceived` recipient, call `cAMP.borrow`, assert collateral-vs-debt invariant violation. No multi-tx, no time-shift.
- **Required cross-contract context:** AMP token + cAMP + Comptroller + at least one other cToken to demonstrate cross-asset profit. All on same chain.
- **Required temporal / economic state setup:** Pre-exploit block with sufficient AMP liquidity in cAMP to borrow. No oracle move. Standard mainnet state.

### Lessons for Silica

- **Lead specialist:** *state-manipulation* — specifically reentrancy under non-standard token semantics. *cross-contract* second.
- **Heuristic to add to library:** `lending.fork.compound.erc777-listing` — for any Compound-fork lending market, enumerate listed tokens, check each for ERC-777 / ERC-1363 / hook-bearing semantics, and flag as critical if any exist. Companion: `compound-fork.borrow-state-update-vs-transfer-order` — verify state updates preceded by accrueInterest are visible to ALL cToken paths before any external call yields control. (They aren't, in classic Compound v2 forks.)
- **Bench-case shape:** Fork at exploit-block-1. Deploy attacker contract with tokensReceived. Call cAMP.borrow with reentry into cAMP.borrow. Assert profit > 0.
- **Detection-difficulty class:** **easy**. This is a textbook reentrancy with a publicly-known prior (Lendf.Me, Apr 2020). The harness should never miss it.
- **Could Cecuro plausibly catch this today?** Yes, almost certainly. Slither's reentrancy + token-semantics enumeration is sufficient. The interesting policy question is: should an audit harness *refuse to bless* a Compound fork that lists hook-bearing tokens, or merely flag? Industry consensus today is "refuse." Cecuro should follow.
