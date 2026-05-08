## Multichain (July 6, 2023) — exit-scam hybrid

**At a glance:** Multichain (formerly Anyswap) cross-chain bridge. ~$126M+ drained from Fantom-side, BSC-side, and Ethereum-side liquidity pools across multiple bridge contracts in coordinated outflows. Bug class: signer-key compromise where the keys *were* the signing authority and the CEO had sole custody — a hybrid of operational compromise and exit-scam (CEO Zhaojun was detained by Chinese police in May 2023; key access was apparently never recovered or transferred). Multi-tx, multi-chain, single-actor (whoever held the keys). Post-mortem: Multichain official statement (Jul 2023, then "team is unable to continue offering services" in Sept 2023); Rekt News "Multichain — REKT"; SlowMist and PeckShield analyses.

### Timeline

- Pre-deploy: Multichain (Anyswap predecessor) launches in 2020. Architecture is an MPC (Multi-Party Computation) signer set; in principle, no single party holds a complete private key.
- Vulnerability introduced: Operational. Over time, Multichain's MPC distribution degenerated into one-CEO-controls-the-keys, contrary to the public architecture diagrams.
- Audit-coverage pre-exploit: Bridge contracts had been audited multiple times [verify auditors]. Audits did not assess MPC-distribution status.
- Attack window: Discoverable from May 2023 (CEO Zhaojun's detention by Chinese authorities, reported by Multichain team in mid-July, several weeks after the fact). During that window, the bridge continued operating with degraded signing infrastructure.
- Exploit txs: Coordinated drain on July 6, 2023, on Fantom and BSC bridges. ~$126M moved out of bridge wallets. Smaller follow-on outflows over subsequent days.
- Post-mortem: Multichain announces in mid-July that CEO had been detained, MPC servers were under his sole physical control, and the team cannot recover the keys. Service shuts down in September.

### Root cause (technical)

The Multichain bridge contracts are themselves correctly written (to the public's knowledge). The withdrawal flow is:
1. User locks tokens on chain A → emit event with deposit ID.
2. Off-chain MPC signer set (5+ nodes) sees event, runs an MPC sign protocol to produce a single signature attesting "user can withdraw on chain B."
3. Anyone submits that signature + receipt to the chain-B Multichain contract; contract verifies signature against MPC public key and dispenses tokens.

The on-chain verification on chain B is correct. The compromise is that:
- The MPC threshold was supposed to be ≥3-of-5 distributed nodes.
- In practice, multiple MPC nodes ran on infrastructure controlled solely by CEO Zhaojun.
- When Zhaojun was detained, his physical control of the MPC servers (and his exclusive access to administrative credentials) meant the team could neither rotate the signers, freeze the bridge, nor access the keys.
- A separate party (whoever ended up with effective access to those servers — speculation includes the CEO's relatives, who reportedly tried to retrieve assets, or Chinese authorities) generated valid signatures and drained the bridge.

Pseudocode of the on-chain verification (correctly written):

```solidity
// AnyswapV6Router.sol — withdrawal-equivalent
function anySwapIn(bytes32 txs, address token, address to, uint256 amount, uint256 fromChainID) external onlyMPC {
    require(token != address(0));
    IUnderlying(token).withdraw(to, amount);
    emit LogAnySwapIn(txs, token, to, amount, fromChainID, cID());
}
```

`onlyMPC` checks `msg.sender == mpcAddress` (or signature-based equivalent). The role is conceptually a single privileged signer-of-signers; off-chain MPC produces signatures via the threshold protocol, on-chain it presents as one address. This pattern saves gas and is common, but it relies entirely on the off-chain MPC being honestly distributed.

The bug is therefore *not* in the contract. It is in the assumption that MPC-distribution claims map to actual operational decentralization. There is no on-chain way to verify "are the 5 MPC nodes really run by 5 independent operators on 5 different machines?"

### Attack flow

1. **(May 2023)** CEO Zhaojun detained. Effective custody of MPC servers transitions from "Zhaojun + Multichain ops" to "whoever has physical / remote access to Zhaojun's infrastructure."
2. **(May–July 2023)** Bridge continues operating publicly. Multichain team is internally aware Zhaojun is unreachable.
3. **(July 6, 2023)** Coordinated outflows from Fantom and BSC bridges. Funds moved to a small set of EOAs, then dispersed via swaps.
4. **(July 14, 2023)** Multichain confirms CEO situation publicly. Team declares inability to operate.
5. **(July–Sept 2023)** Smaller follow-on outflows continue. CEO's sister is reported to have attempted to recover funds independently.
6. **(September 2023)** Multichain announces service termination.

### Pre-exploit signals

- **Static signal:** Not applicable.
- **Audit signal:** Audits covered code, not operational MPC distribution.
- **Public speculation:** Significant. Researchers had been writing for years about "MPC bridges with single-CEO operational control." Bankless, Delphi Digital, and others had published critiques of cross-chain bridge governance models. Multichain specifically had been called out for opaque MPC-node-operator identities.
- **Bug bounty:** Not applicable to off-chain compromise.

The signal that was *publicly available*: long-running concern in the security community that MPC bridges' centralization claims were unverifiable. Specific to Multichain: the team's MPC-node operator list was not publicly disclosed, which itself is a red flag.

### What our harness would need

- **Static-analyzer output sufficiency:** Not applicable.
- **Required LLM-reasoning depth (for the auditable surface):**
  - Q1: "Does this protocol's privileged action gate (admin functions, withdrawal authority, upgrade authority) reduce on-chain to a single signing entity (`onlyOwner`, `onlyMPC`, etc.)?"
  - Q2: "If yes, what does the protocol claim about that entity's structure (MPC-N-of-M, multisig, etc.) and is that claim verifiable on-chain?"
  - Q3: "Is there any on-chain history of the privileged signer that would suggest single-controller behavior (gas funded from one source, deployed by one address, signs only from one IP cluster, etc.)?"
- **Required validation tier:** **off-chain attestation review** + **on-chain history aggregation**. Pure contract analysis misses this entirely.
- **Required cross-contract context:** Bridge contract + admin EOA + (if multisig) multisig + every signer's history.
- **Required temporal / economic state setup:** Continuous monitoring of the privileged signer's recent activity. Sudden silence, unusual outflows, or operator-side announcements (CEO detention) should trigger alerts.

### Lessons for Silica

- **Lead specialist:** *bridge* / *governance* — same as Ronin, with operational severity factor.
- **Heuristic to add to library:** `governance.unverified-distribution-claim` — flag any contract whose privileged role is filled by a single on-chain address that is *claimed* off-chain to be a multi-party signer. The flag should require either (a) on-chain proof of multi-party signing — e.g., the contract uses an N-of-M threshold-recovery scheme with each signer's address public — or (b) accept the centralization risk and price it accordingly. Companion: `bridge.privileged-signer-activity-monitor` — alert on prolonged silence (no signing activity from a normally-active signer) or anomalous patterns.
- **Bench-case shape:** Static analysis of Multichain's `onlyMPC` modifier shows the MPC address is a single EOA. Output: "centralization risk: privileged role consolidated to one address." This is the kind of *risk-flag-without-exploit-simulation* that Silica should be willing to emit.
- **Detection-difficulty class:** **very hard** for predicting the exit-scam timing; **easy** for flagging the structural centralization risk that made the exit-scam possible.
- **Could Cecuro plausibly catch this today?** Not the exploit. *Yes* the structural condition. The harness should refuse to bless any bridge as low-risk if the privileged role is a single on-chain address with unverifiable off-chain claim of distribution. This is ultimately an *honest-marketing* heuristic: Multichain's MPC claim was unverifiable, and a serious harness should require either verifiable distribution or honest acknowledgment of single-controller risk.

The cross-case lesson here, paired with Ronin: the most expensive bridge losses in DeFi history were *not* Solidity bugs. They were operational failures where the on-chain code was correct and the trust assumption around the privileged signer was wrong. Silica's roadmap should include a "governance / authority structural-audit" mode that delivers a continuous risk score on every protocol's privileged-role custody. The legal / commercial framing matters: the harness shouldn't claim to "predict" exit-scams but it can credibly score *centralization risk* and let users / capital allocators price it accordingly.

A second cross-case lesson: the time-from-disclosure-to-exploit for Multichain was several weeks (CEO detained May → exploit July), during which the bridge was visibly operating with a degraded signer. A continuous monitor that tracked privileged-signer activity rate and alerted on anomalies could have warned users to bridge funds out before July 6. This is a product class — "smart-contract risk telemetry" — that complements pre-deploy audit. Silica's positioning would be stronger if it explicitly addressed both pre-deploy (audit harness) and post-deploy (telemetry) phases.
