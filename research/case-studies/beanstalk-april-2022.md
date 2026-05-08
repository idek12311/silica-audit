## Beanstalk Farms (April 17, 2022)

**At a glance:** Ethereum mainnet. ~$182M drained (the protocol's reserves and user-deposited stablecoins). Attacker net profit ~$76M (after flash-loan fees and ETH/BEAN slippage). Exploit txs: governance proposal commit `0xe1d29d0a39b4… (BIP-18, BIP-19)` and execution `0xcd314668aaa9fbc4f8…` [verify exact hash]. Bug class: governance flash-loan / single-block proposal-and-execution. Single tx for execution after a 24-hour seed; single actor. Post-mortem: Beanstalk Farms blog "Beanstalk Governance Exploit" (Apr 2022); Rekt News "Beanstalk Farms — REKT"; Halborn and OtterSec analyses.

### Timeline

- Pre-deploy: Beanstalk launches Aug 2021. Native stablecoin BEAN, decentralized governance via "Stalk" (vote weight from Silo deposits) and "Seeds" (Stalk growth).
- Vulnerability introduced: From inception. Beanstalk's `vote()` and `commit()` paths use a snapshot of *current* Stalk balance to compute voting weight. Stalk is granted instantly upon Silo deposit. There is no proposal-time-to-execution delay (no timelock) for a class of "emergencyCommit" governance actions when the supermajority condition is met.
- Audit-coverage pre-exploit: Halborn audited core in 2021. The audit identified governance-quorum design as "consider timelock" but did not classify as critical. No timelock was added.
- Attack window: ~24 hours. The attacker submitted BIP-18 ("Save the Bees") and BIP-19 (a benign-looking emergency proposal) on Apr 16. After the 24-hour minimum proposal lifetime, they triggered emergencyCommit on Apr 17.
- Exploit tx: A single transaction at block ~14602790 [verify] that flash-loans, deposits, votes, commits, and exfiltrates.
- Post-mortem: Beanstalk halts; protocol redeploys Beanstalk 2 with timelocks, multi-sig review, and proposal-state-snapshot at proposal-creation time (not execution time).

### Root cause (technical)

Beanstalk's governance has two fatal properties that combine into the exploit:

1. **Vote weight is read at the moment of commit, not at proposal creation.** A user can deposit Stalk into the Silo *the same block as commit* and have those Stalk count.
2. **Silo deposits return Stalk synchronously.** No epoch lag. Deposit DAI/USDC/3CRV and you receive Stalk instantly proportional to deposit value × bdv (bean-denominated value).

Together: a flash-loaned $1B of stables → instant supermajority Stalk → instant `emergencyCommit` of a malicious BIP that calls `init()` of an attacker-controlled contract delegating into Beanstalk's diamond.

Pseudocode of the vulnerable governance pattern (reconstructed from Beanstalk's GovernanceFacet.sol):

```solidity
function emergencyCommit(uint32 bip) external {
    require(propose[bip].start + EMERGENCY_THRESHOLD < block.timestamp);
    require(votes[bip].for >= (totalStalk() * 2) / 3, "supermajority");
    // ❌ totalStalk() reads CURRENT balance, not balance at propose-time
    // ❌ votes[bip].for is computed against CURRENT Stalk holdings
    _execute(bip); // arbitrary delegatecall via Diamond pattern
}

function vote(uint32 bip) external {
    votes[bip].for += stalkOf(msg.sender); // current stalk
    voted[msg.sender][bip] = true;
}

function deposit(IERC20 token, uint256 amount) external {
    // ❌ Deposit grants Stalk in the same block, no epoch lag
    uint256 bdv = bdvOf(token, amount);
    stalk[msg.sender] += bdv * STALK_PER_BDV;
    seeds[msg.sender] += bdv * SEEDS_PER_BDV;
    token.transferFrom(msg.sender, address(this), amount);
}
```

`_execute(bip)` is the kill switch: BIPs are arbitrary `address` + `bytes calldata` packages that the Diamond delegatecalls into. The malicious BIP's payload was a `transfer()` of all reserves to the attacker's address.

The *Save the Bees* cover proposal (BIP-18) was a humanitarian-aid donation to Ukraine — a social-engineering choice. BIP-19 was the actual payload: it pointed to an init contract that, when delegatecalled by the Diamond, transferred the protocol-owned BEAN3CRV LP to the attacker.

### Attack flow

1. **T-24h:** Attacker submits BIP-18 and BIP-19 via `propose(...)`. BIP-19's target is `0xb66aD8…` (an attacker-controlled init contract) [verify]. Cost: a small Stalk balance to satisfy `propose()` minimum.
2. **T-0:** Attacker calls a single execution contract that does:
   1. Flash-loan ~$350M USDC from Aave + ~$500M DAI from MakerDAO + ~$150M USDT from… [verify exact splits; aggregate ~$1B].
   2. Swap a fraction → BEAN, LUSD, etc. via Curve / Uniswap.
   3. Deposit large BEAN3CRV LP, BEANLUSD LP, and stables into Beanstalk Silo. Receive massive Stalk grant (>67% of total supply).
   4. `vote(BIP18)` and `vote(BIP19)` with the new Stalk.
   5. `emergencyCommit(BIP19)`. Diamond delegatecalls attacker init → transfers BEAN reserves and BEAN3CRV LP to attacker.
   6. Withdraw flash-loaned positions from Silo (a portion is stuck because the protocol has been drained, but the attacker's *deposit* is still recoverable in part).
   7. Swap stolen BEAN-LP for ETH on Uniswap. Repay flash loans. Net ~$76M.
3. **T+seconds:** Attacker bridges to Tornado Cash. Donates a small portion to Ukraine wallet (cover identity).

Each step is one internal call within the same external transaction. The whole exploit is atomic — there is no opportunity to interrupt once mined.

### Pre-exploit signals

- **Static signal:** None from stock tooling. Slither has no "governance reads voting power at execution time" detector. The Diamond pattern with arbitrary delegatecall is intentional and not a flag on its own.
- **Audit signal:** Halborn's report mentioned "lack of timelock" as informational. It was acknowledged and accepted. No critical-rated finding on flash-loan-vote.
- **Public speculation:** None pre-exploit. *Post*-Mango / post-MakerDAO governance literature had general unease about flash-loan governance; nobody specifically had Beanstalk on a watch list.
- **Bug bounty:** Beanstalk had no Immunefi-listed bounty at the time [verify].

The signal that *would have required novel inference*: an LLM agent looking at GovernanceFacet has to chain three observations: (1) deposit yields Stalk in same block; (2) vote weight is read at commit time; (3) emergencyCommit lets BIP execute arbitrary delegatecall. Each observation is local; the exploit is the composition. This is exactly the class of bug an agent reasoner outperforms a static analyzer on, *provided* it is prompted to ask "can voting power be acquired in the same tx as voting?"

### What our harness would need

- **Static-analyzer output sufficiency:** Insufficient. Slither's `arbitrary-send` and `delegatecall-loop` rules don't reach this. Mythril could in principle prove "deposit + vote + commit is profitable in one tx" via symbolic exec, but the search space is huge.
- **Required LLM-reasoning depth:**
  - Q1: "Trace the vote-weight calculation path. At what block / state snapshot is voting power read?"
  - Q2: "Can vote-weight tokens be acquired (mint, deposit, transfer) within the same transaction as the vote?"
  - Q3: "Does the proposal-execution path call a user-specified target (delegatecall, low-level call, or upgrade)?"
  - Q4: "Combine: is there a single-tx flow where vote-weight is acquired via flash loan, used to pass a malicious proposal, and the loan is repaid?"
- **Required validation tier:** **multi-tx-orchestrated** with **time-shift** (need to skip past 24-hour proposal minimum). Specifically: fork mainnet, propose BIP, fast-forward 24h+1, execute exploit transaction, assert net profit. Echidna-style fuzzing alone is unlikely to find the social-engineering "wait 24h" because that's a parameter, but a directed agent with the temporal hint can.
- **Required cross-contract context:** Aave/Maker (for flash-loan source), Curve (for BEAN3CRV bdv), Beanstalk Diamond + GovernanceFacet + SiloFacet. The attack spans 4-5 contracts in one tx.
- **Required temporal / economic state setup:** Pre-exploit block. Must have ~$1B aggregate flash-loan liquidity available across Aave + Maker + dYdX. Must have BEAN3CRV LP depth such that 67% of Stalk is achievable inside the flash-loan budget.

### Lessons for Silica

- **Lead specialist:** *governance* (primary), with *economic* as second-chair (flash-loan economics determine feasibility).
- **Heuristic to add to library:** `governance.same-block-vote-weight-acquisition` — for any governance system, check whether vote-weight tokens are mintable/depositable/transferable in the same block as the vote, or whether vote-weight is snapshotted at proposal-creation-block. Companion heuristic: `governance.proposal-execution-allows-arbitrary-delegatecall`. Both together = critical.
- **Bench-case shape:** Forked mainnet at block 14602790-1. Agent runs propose+wait+execute and asserts attacker EOA balance increases by ≥$50M in ETH-equivalent.
- **Detection-difficulty class:** **medium-easy**. The bug is a textbook governance flash-loan, and the chain of three observations is reachable by any agent prompted with "look for flash-loan-governance composability." After Beanstalk, this class is widely known.
- **Could Cecuro plausibly catch this today?** Yes, with high confidence, *if* the heuristic library includes the two governance heuristics above. Beanstalk-class bugs are now table stakes for governance-token-deploying audits. The harness should refuse any governance system without snapshot-at-proposal-creation OR a meaningful timelock.
