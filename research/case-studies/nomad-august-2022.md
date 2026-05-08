## Nomad Bridge (August 1, 2022)

**At a glance:** Multi-chain (Ethereum, Moonbeam, Avalanche, Evmos). ~$190M drained in roughly four hours by ~300 distinct addresses (the "decentralized robbery"). Initial exploit tx: `0xa5fe9d044e4f3e5aa5bc4c0709333cd2190cba0f4e7f16bcf73f49f83e4a5460` [verify exact lead tx]; the transaction was then copy-pasted by hundreds of MEV-aware bystanders. Bug class: missing committed-root validation, default-value (zero hash) accepted as valid Merkle root. Single-tx-per-extraction; trivially-replayable; multi-actor opportunistic. Post-mortem: Nomad team Discord/Medium "Nomad Token Bridge Incident" (Aug 2022); samczsun thread; Rekt News "Nomad — REKT"; PeckShield analysis; OtterSec writeup.

### Timeline

- Pre-deploy: Nomad launches optimistic-bridge architecture (replicates Optimism's fraud-proof model for cross-chain messaging) in 2021–early 2022.
- Vulnerability introduced: April 21, 2022 — initialization commit to `Replica.sol` sets `confirmedAt[0x00] = 1`. The intent was a sentinel; the effect was that any message whose Merkle proof verifies against an empty/zeroed root is auto-accepted. This was an "upgrade as part of routine work" change, not a fresh feature.
- Audit-coverage pre-exploit: Quantstamp audit (early 2022) covered the prior version. The init change post-dated the audit.
- Attack window: ~3 months between init commit and exploit.
- Exploit tx: First extraction at block 15259101 [verify]; cascade lasted ~4 hours before Nomad paused.
- Post-mortem: Nomad freezes contracts, launches recovery-wallet program, ~20% recovered via white-hat returns.

### Root cause (technical)

Nomad's bridge uses an optimistic verification: messages on the source chain are committed to a Merkle root, which is posted to the destination chain by an "Updater." After a fraud window, the root is "confirmed" and any message under that root can be processed.

The destination contract `Replica.sol` stores accepted roots in `confirmedAt[bytes32 root] => uint256 timestamp`. Messages call `process(bytes message)`. Inside `process`, the contract reconstructs the Merkle leaf and checks:

```solidity
function acceptableRoot(bytes32 root) public view returns (bool) {
    uint256 confirmedAt = confirmedAt[root];
    if (confirmedAt == 0) return false;
    // root must be confirmed and within optimistic window
    return block.timestamp > confirmedAt;
}

function process(bytes memory _message) public returns (bool) {
    // 1. Compute leaf and look up root the leaf belongs to
    bytes32 leaf = keccak256(_message);
    bytes32 messageRoot = inboundMessage[leaf]; // ← key bug: defaults to 0x00
    require(acceptableRoot(messageRoot), "!proven");
    // 2. Mark processed and execute
    inboundMessage[leaf] = MESSAGE_STATUS_PROCESSED;
    _doRecipient(_message);
    return true;
}
```

The init script set `confirmedAt[0x0000…0000] = 1`. So `acceptableRoot(0x00) == (block.timestamp > 1) == true`.

Now consider any unprocessed message: `inboundMessage[leaf] == 0x00` because it has never been recorded. `messageRoot` reads `0x00`. `acceptableRoot(0x00) == true`. The message processes.

The implication: every message anyone could construct that Nomad's destination contract had not yet seen would be auto-validated as "proven." There was no signature, no nonce, no per-source-chain check. The harness on the inbound side simply asked "is the root marked as confirmed?" and root-of-zero was confirmed.

The fact that `inboundMessage[leaf]` defaulted to 0x00 (the zero value of a `bytes32`) and 0x00 was accidentally pre-confirmed turned the entire bridge into a free withdrawal counter.

### Attack flow

1. **Attacker constructs a message** that says "withdraw 100 WBTC to attacker address." This is just calldata — no real source-chain event behind it. The leaf is `keccak256(message)`.
2. **Attacker calls `Replica.process(message)`** on the destination chain.
3. **Inside `process`**: `messageRoot = inboundMessage[leaf]` returns `0x00` (default). `acceptableRoot(0x00) = true`. Check passes.
4. **`_doRecipient`** dispatches the message to `BridgeRouter`, which reads "transfer 100 WBTC" and sends it from Nomad's reserves to the attacker.
5. **Other observers see the tx** in mempool / on-chain, copy the calldata, modify the recipient field, and broadcast their own variant. ~300 distinct addresses participated.
6. **Each variant succeeds** because each has a distinct leaf (different recipient → different keccak), so `inboundMessage[leaf]` is independently 0x00 for each.

The exploit is *trivially replayable* because:
- No signature (Nomad's optimistic model deliberately removes per-message signatures, relying on the root-confirmation step)
- No nonce binding to a source-chain event
- No challenge period in practice for the empty root (it was confirmed at deploy time)

### Pre-exploit signals

- **Static signal:** Slither's `uninitialized-state` and `mapping-defaults` rules don't trip on this. The init function is correctly written; the *value* it sets is the bug.
- **Audit signal:** Quantstamp's audit pre-dated the init change. There is no public record of an audit explicitly reviewing the post-init contract state.
- **Public speculation:** None. The bug had been live for 3 months. Some MEV searchers presumably had Nomad in their watch lists, but no public note.
- **Bug bounty:** Nomad ran an Immunefi bounty up to $1M [verify]. Submission database shows no relevant pre-exploit submission.

The signal that *should have been caught*: any review of "what does the contract storage look like immediately after deploy + init?" would have noticed `confirmedAt[0x00] = 1`. This is a state-snapshot review, not a code review. A harness that diffs storage against expected post-deploy state would have flagged the entry.

### What our harness would need

- **Static-analyzer output sufficiency:** Insufficient. Slither doesn't model post-init storage state. Mythril could symbolically explore `process` with `inboundMessage[leaf] = 0` and find the path, but it'd require a property like "for all msg, process(msg) ⇒ msg was actually committed to a real root." That property is the missing audit input.
- **Required LLM-reasoning depth:**
  - Q1: "What is the value of every storage slot after `initialize()` runs? Specifically, is any sentinel value in a confirmation/whitelist/accepted-set mapping that aliases to the zero key?"
  - Q2: "Does any verification function read a mapping and compare against a constant (e.g., `> 0`)? What happens when the key is the zero key?"
  - Q3: "Can an attacker supply input whose lookup key is the zero key (or the default value of the mapping's key type)?"
- **Required validation tier:** **fork-execution-state-asserted**. Fork at post-init block, call `process()` with arbitrary calldata, assert tokens transferred to attacker.
- **Required cross-contract context:** Replica + BridgeRouter + ERC-20 reserve contracts. Single-chain.
- **Required temporal / economic state setup:** Any block after init. No specific economic context needed (the bridge had >$190M in WBTC, USDC, etc. continuously available).

### Lessons for Silica

- **Lead specialist:** *bridge* (primary), *signature/auth* (second-chair — though Nomad has no signatures, the equivalent is "verification authority").
- **Heuristic to add to library:** `bridge.zero-default-confirmation` — for any cross-chain bridge or message-passing contract, enumerate every confirmation/whitelist/accepted mapping. For each, check that the zero-key (and zero-value) does not correspond to an accepted state. Companion: `init.storage-diff-snapshot` — after running `initialize()` in a sandbox, diff actual storage vs expected; flag any sentinel values that map a zero key to a "valid" state.
- **Bench-case shape:** Fork at block 15259100. Construct arbitrary calldata. Call Replica.process. Assert ERC-20 transfer to attacker.
- **Detection-difficulty class:** **easy**. The bug is a one-line storage-init mistake. Any harness that ran a post-deploy storage-snapshot diff would have seen it. The reason it wasn't caught is that *nobody runs that diff* as part of a routine audit pipeline.
- **Could Cecuro plausibly catch this today?** Yes, with high confidence, *if* the bridge-class heuristic library is present. The general lesson — that initialize-state defects are an underserved category — is one of the cleanest justifications for an automated harness over ad-hoc audit. The audit didn't catch it because the bug was added between audit cuts. A continuous harness that re-runs on every contract upgrade would have caught it within hours of the init commit.
