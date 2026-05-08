## Mango Markets (October 11, 2022)

**At a glance:** Solana, Mango Markets v3. ~$117M drained via oracle manipulation of MNGO/USDC perpetual. Attacker (Avraham Eisenberg, who self-doxxed) tx signature: `5gxr6dYiq1F…` [verify exact sig]; the manipulation involved a series of trades on AOB/Serum-style markets. Bug class: thin-liquidity oracle / mark-price manipulation feeding an undercollateralized borrow. Multi-tx, single actor (in operational sense; legally contested as "successful trade"). Post-mortem: Mango DAO official statement; Eisenberg's own public Twitter thread; OtterSec, Neodyme, and Coinbase Research analyses.

### Timeline

- Pre-deploy: Mango v3 launches early 2022 on Solana. Cross-margin perpetuals + spot lending. MNGO is the governance token, low FDV, traded on Mango's own AOB and on Serum.
- Vulnerability introduced: From v3 deploy. The mark price for MNGO-PERP collateralization is computed from a low-liquidity feed (Mango's own AOB price + Serum oracle). The system is designed for relatively-stable assets but treats MNGO under the same model.
- Audit-coverage pre-exploit: Mango v3 had multiple audits (Neodyme, OtterSec) [verify]. Oracle thinness was acknowledged in design but classified as a tail-risk product decision, not a bug.
- Attack window: Continuous since launch. The attack was always feasible; what changed was that someone capitalized.
- Exploit txs: Series over ~30 minutes on Oct 11, 2022.
- Post-mortem: Eisenberg negotiates a "bug-bounty"-style return, retains ~$47M as fee. Later arrested by US authorities in Dec 2022 and convicted of fraud / market manipulation.

### Root cause (technical)

Mango's perpetual margin engine values open positions at *mark price*, derived from external oracles. For MNGO-PERP, the oracle is the on-chain MNGO/USDC price, which on Solana flows from Pyth/Switchboard with fallback to Mango's own AOB.

The attack lever is that *MNGO's market liquidity is small* (millions of dollars in book depth). With $5–10M of capital and a willing counterparty (the attacker's own second account), MNGO's price can be moved 10x without significant net cost.

When the mark price is manipulated 10x upward:
- The attacker's *long* MNGO-PERP position appears massively profitable.
- Mango's risk engine credits the unrealized PnL as available collateral.
- The attacker can borrow against this credit — withdrawing real USDC, USDT, BTC, ETH, SOL — up to the collateral value.

The vulnerable code path is in Mango's `Withdraw` instruction, which calls `mango_account.health_check(...)`. The health check uses oracle-reported prices for each asset, including MNGO-PERP's mark price. The mark price is read from the oracle without a sanity-band, sanity-rate-limit, or circuit-breaker.

Pseudocode of the relevant logic:

```rust
// mango-v3/program/src/processor.rs (paraphrased)
pub fn withdraw(...) -> ProgramResult {
    let mango_account = MangoAccount::load(...)?;
    let mango_group = MangoGroup::load(...)?;
    let oracle_prices = read_all_oracles(&mango_group);
    // Compute health using current oracle prices
    let health = mango_account.compute_health(&oracle_prices, HealthType::Init);
    require!(health >= 0, MangoErrorCode::InsufficientFunds);
    // Transfer underlying to user
    transfer_from_vault(...);
    Ok(())
}

// compute_health:
// for each spot asset: balance * oracle_price * weight
// for each perp position: mark_price * size * weight  // ← manipulated leg
```

There is no defense like:
- "If oracle moved >X% in last N blocks, refuse withdraw or use TWAP"
- "If the perp's mark price diverges >Y% from a bonded reference, halt new withdrawals"
- "Withdraw caps as a fraction of TVL per epoch"

These are economic-safety policies absent at the code level.

### Attack flow

1. **Eisenberg deposits ~$5M USDC** into Mango account A, opens a *long* MNGO-PERP position. Notional ~$10M.
2. **From account B (also his), deposit similar capital.** Open a *short* MNGO-PERP position (matched against A via the AOB).
3. **On the spot market** (Serum MNGO/USDC, Raydium MNGO/USDC), buy aggressively to push MNGO spot up from ~$0.04 to ~$0.91 (a 22x move). The available book is shallow enough that ~$5M in buys does it.
4. **Oracle aggregation** picks up the spot move and reports the new MNGO price to Mango. The mark price for MNGO-PERP rises with it.
5. **Account A's long position** is now massively unrealized-profitable on paper — ~$200M+ of credited collateral.
6. **Eisenberg calls `Withdraw`** on account A for USDC, USDT, BTC, ETH, SOL, MNGO from Mango's vaults. The health check passes because the unrealized PnL on the long is enormous. Tens of millions in real assets exit Mango's vaults to Eisenberg.
7. **Within ~30 min**, ~$117M is withdrawn.
8. **Spot price gradually returns** to fair value as Eisenberg's spot buying stops. Account A is now deeply underwater (the unrealized PnL evaporates), but Mango cannot claw back — the assets are already in Eisenberg's wallet.
9. **Account B's short position** is also deeply underwater, but B has no remaining collateral (it was minimal seed). The DAO eats the loss.

### Pre-exploit signals

- **Static signal:** Static analyzers don't typically reason about oracle-thinness. There is no "this oracle is shallow" rule.
- **Audit signal:** Mango's audit reports (Neodyme, OtterSec) acknowledged oracle dependence and recommended TWAP usage and per-asset risk parameters. The protocol shipped without circuit-breakers on perp mark prices, an explicit product decision.
- **Public speculation:** Avraham Eisenberg himself had publicly written about "highly profitable trading strategies" days before the exploit and described oracle manipulation as "permissionless market making." He had executed similar (smaller) attacks on dYdX-style venues earlier. So the exact strategy was foreshadowed by the eventual perpetrator.
- **Bug bounty:** Mango DAO had a bounty program but oracle-manipulation was not in scope (it was framed as "trading risk," not "bug").

The signal that *would have required novel inference*: a harness has to reason about *off-chain market depth*, not on-chain code. The on-chain code is correct given its inputs. The bug is that the inputs (oracle prices) are manipulable for $5M against a token with $X book depth, and the protocol allows withdrawals of >$100M against the manipulated PnL.

### What our harness would need

- **Static-analyzer output sufficiency:** Wholly insufficient. This is not a code bug. Mythril/Echidna cannot reason about MNGO's spot-market book depth.
- **Required LLM-reasoning depth:**
  - Q1: "For each asset used as collateral or as a perp's underlying, what is the on-chain liquidity depth?"
  - Q2: "What is the cost in USD to move the spot price by N% (where N is set by the protocol's leverage limits)?"
  - Q3: "Is the protocol's withdraw cap or risk-engine sanity check tight enough that a withdraw exceeding `cost-to-move-oracle × leverage` is impossible?"
  - Q4: "Are there circuit-breakers (TWAP, mark-vs-index divergence cap, cooldowns) that would prevent abnormal withdraw flow?"
- **Required validation tier:** **multi-tx-orchestrated** with **economic state setup**. The harness must (a) fork mainnet, (b) simulate spot-market buys to push price, (c) re-read oracle, (d) attempt withdraw, (e) measure profit. This crosses into market-simulation territory.
- **Required cross-contract context:** Mango program + Pyth/Switchboard oracle programs + Serum AOB + Raydium pool (for spot manipulation source). Multi-program Solana state.
- **Required temporal / economic state setup:** Pre-exploit block. *Crucial:* must accurately reflect MNGO spot-market book depth at that block. This requires either onchain-snapshot replay or reasonable model approximation.

### Lessons for Silica

- **Lead specialist:** *oracle* (primary), *economic* (second-chair).
- **Heuristic to add to library:** `oracle.thin-liquidity-vs-leverage` — for each asset that the protocol treats as collateral or perp underlying, compute (or accept as input) the on-chain spot book depth required to move price by P%. Compare against (max-borrow-against-asset × P) and flag if the cost of manipulation < expected attacker profit. This is an *economic* heuristic, not a code one.
- **Bench-case shape:** Forked Solana state + deployed Mango bytecode + scripted spot buys against MNGO/USDC pools + withdraw call. Assert net profit > 0.
- **Detection-difficulty class:** **hard**. Not because the bug is novel — *Mango-class oracle manipulation has been a known pattern since at least 2020 (bZx)* — but because the harness has to model off-chain market state to score severity. A conservative harness can flag the *structural condition* ("token X is collateral and has thin spot depth") without simulating the exploit; that gets you most of the value.
- **Could Cecuro plausibly catch this today?** *Partially.* The structural-condition flag (thin-liquidity asset used as high-leverage collateral) is reachable. The end-to-end simulated proof of profit is much harder and probably out of scope for a generalist harness. Cecuro's value here is to *raise the question* and demand the protocol team answer with circuit-breaker config. The bench-case for retrospective detection should be: "does the harness flag MNGO-PERP at all?" rather than "does it simulate the full exploit." If the answer is yes, that's a passing grade.
