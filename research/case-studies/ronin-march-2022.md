## Ronin Bridge (March 23, 2022)

**At a glance:** Ronin sidechain (Axie Infinity). ~$625M lost (173,600 ETH + 25.5M USDC). Two withdrawal txs from the bridge contract on Mar 23, signed by 5-of-9 validators all under attacker control. Bug class: signer key compromise via spear-phishing + Sky Mavis-Axie-DAO trust delegation that left 4 of the 9 keys controlled by Sky Mavis without the DAO realizing it. No on-chain code bug. Multi-tx, single attacker organization (later attributed to Lazarus Group / DPRK by US Treasury OFAC). Post-mortem: Sky Mavis "Community Alert" (Mar 29, 2022) and "Back to Building" (Apr 2022); CertiK and Mandiant analyses; US OFAC notice attributing to Lazarus.

### Timeline

- Pre-deploy: Ronin launches as an Axie-purpose sidechain in early 2021 with a 9-validator PoA design. Withdrawals from the bridge require 5-of-9 validator signatures.
- Vulnerability introduced: November 2021. Sky Mavis requests Axie DAO permission for Sky Mavis to *sign on behalf of* Axie DAO due to user load. The permission is granted and **never rescinded after the load subsided**. From Nov 2021 onward, Sky Mavis controls 5 of 9 validator keys (4 Sky Mavis + 1 Axie DAO delegated).
- Audit-coverage pre-exploit: Sky Mavis's bridge contracts had been audited [verify auditor]. The audit covered code; *operational* security (signer-key custody, delegation governance) was out of scope.
- Attack window: ~4 months between trust-delegation and exploit.
- Exploit txs: Two large withdrawals from the Ronin bridge on Mar 23. The drain was not detected for 6 days; on Mar 29 a user reported failed withdrawals, surfacing the breach.
- Post-mortem: Sky Mavis raises $150M emergency funding (a16z, Binance, others). All user funds eventually restored from corporate balance sheet + recovered fragments.

### Root cause (technical)

There is no on-chain code bug. The Ronin bridge contract requires 5-of-9 signatures from a fixed validator set; the verification logic is correct. The exploit is the signing-key-custody story.

The signer-key compromise reportedly occurred via:
1. **Spear-phishing.** A senior Sky Mavis engineer received a fake job offer (LinkedIn + PDF) from what appeared to be a recruiter. The PDF contained a payload that established remote access on the engineer's machine.
2. **Lateral movement.** Attackers used the foothold to access internal Sky Mavis infrastructure including the validator-node hosting environment.
3. **Key extraction.** Four Sky Mavis-operated validator nodes had their signing keys extracted.
4. **Axie DAO key.** The fifth required key was obtainable because of the trust delegation: Sky Mavis's RPC node could sign on Axie DAO's behalf for *any* user-load transaction. Attackers found the path that allowed signing arbitrary *withdrawal* messages, not just user-load ones, by going through the same RPC.

With 5 keys, the attackers crafted two withdrawals that drained the bridge.

Pseudocode of the bridge contract's withdrawal verification (correct as written):

```solidity
// RoninBridge.sol — withdrawal flow
function tryUnlockedERC20(WithdrawalReceipt memory _receipt, Signature[] memory _sigs) external {
    bytes32 hash = receiptHash(_receipt);
    uint256 weight = 0;
    for (uint256 i = 0; i < _sigs.length; i++) {
        address signer = ECDSA.recover(hash, _sigs[i]);
        require(_isValidator(signer), "non-validator signature");
        weight += validatorWeights[signer];
    }
    require(weight >= QUORUM, "insufficient weight"); // QUORUM = 5
    // Transfer
    IERC20(_receipt.token).transfer(_receipt.to, _receipt.amount);
}
```

The contract is correct. The compromise is upstream.

### Attack flow

1. **(Late 2021)** Spear-phishing campaign delivers payload to Sky Mavis engineer.
2. **(Q1 2022)** Persistence + lateral movement establishes access to four Sky Mavis-controlled validator nodes.
3. **(Q1 2022)** Attacker discovers / abuses the Axie DAO sign-delegation path through the Sky Mavis RPC.
4. **March 23, 2022:**
   1. Attacker constructs withdrawal-receipt struct: { token: ETH, to: attacker, amount: 173600 ETH }.
   2. Computes the hash, signs with 5 keys.
   3. Submits to bridge contract.
   4. Repeats for USDC.
5. **March 29, 2022:** Failed user withdrawals surface the breach.

### Pre-exploit signals

- **Static signal:** Not applicable.
- **Audit signal:** Not applicable to operational keys.
- **Public speculation:** None public on the specific delegation. Internal Sky Mavis discussions about the November sign-delegation occurred; whether they should have been flagged externally is a governance-transparency question.
- **Bug bounty:** Not applicable.

The signal that *should have been visible*: an *on-chain governance audit* would have shown that 4 of 9 validators' addresses are owned by clearly-Sky-Mavis EOAs, plus a 5th flagged as Axie DAO but signing through Sky Mavis infrastructure. A harness that scored "validator decentralization" by looking at on-chain identity attribution and recent signing co-occurrence would have flagged Ronin as having ~5 effective controllers, not 9.

### What our harness would need

- **Static-analyzer output sufficiency:** Not applicable.
- **Required LLM-reasoning depth (for the auditable surface):**
  - Q1: "How is the authority for privileged actions (e.g., bridge withdrawal) distributed? List all signers / multisig members and their on-chain identity."
  - Q2: "For each signer, can on-chain history attribute it to a known org (Sky Mavis EOAs, Axie DAO Gnosis, etc.)? Is the effective number of independent organizations less than the nominal quorum requires?"
  - Q3: "Are there delegation patterns (signer-X signs for signer-Y) visible in transaction logs?"
- **Required validation tier:** **off-chain attestation review** + **on-chain identity clustering**. This is fundamentally a *governance audit*, not a contract audit. The harness must consume on-chain history and emit a "signer concentration" risk score.
- **Required cross-contract context:** Bridge contract + multisig + every signer's on-chain history.
- **Required temporal / economic state setup:** Continuous monitoring; the risk score must update as the validator set evolves.

### Lessons for Silica

- **Lead specialist:** *bridge* / *governance* — but the live specialist for this case is operational (signer custody / spear-phishing resilience), which is outside contract audit scope.
- **Heuristic to add to library:** `governance.signer-concentration` — for any multisig / validator-set-controlled critical action, cluster signers by on-chain identity (shared deployment txs, shared funding source, shared activity patterns) and flag if effective independent control < quorum requirement. Companion: `governance.delegated-signing-discovery` — flag any signing pattern where signer-X consistently submits transactions on behalf of signer-Y (suggests off-chain delegation).
- **Bench-case shape:** Static analysis of Ronin's validator addresses + their on-chain history. Output: "5 of 9 cluster to Sky Mavis." Threshold for flag: effective independent control < quorum.
- **Detection-difficulty class:** **very hard** for the actual exploit (off-chain spear-phishing); **medium** for the *structural risk* (signer concentration could have been flagged by a careful on-chain analyst).
- **Could Cecuro plausibly catch this today?** No, in the literal exploit-detection sense. *Yes* if the product is reframed to include "governance health checks" — which Cecuro should consider doing. The Ronin case is the canonical reason that bridge-and-validator audits should include "governance decentralization" as a continuously-scored field, not just a one-time review.

This case is the strongest argument that Silica's contract-audit-harness positioning needs an explicit complement — a continuous *governance-monitoring* product. The two together address ~80% of historical bridge losses (the on-chain bugs covered by Silica's contract analysis; the off-chain custody concentrated by governance-monitoring scoring). A standalone contract harness will miss this entire class of loss.

A subtler point: the trust-delegation *was on-chain visible* if you knew to look. Axie DAO's authorization of Sky Mavis's signing was a public Discord/Snapshot vote. A harness that ingested those off-chain governance artifacts and cross-referenced them with on-chain authority changes would have flagged Sky Mavis's effective control level. This expands the "harness" idea beyond pure-bytecode analysis into governance-text-and-signal aggregation — a meaningful product extension worth considering for v2.
