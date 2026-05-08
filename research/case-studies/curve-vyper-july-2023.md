## Curve Finance — Vyper Compiler Bug (July 30, 2023)

**At a glance:** Ethereum mainnet, multiple Curve pools (alETH/ETH, msETH/ETH, pETH/ETH, sETH/ETH, CRV/ETH). ~$73M drained across pools in ~24 hours, of which ~$52M recovered (some via white-hat / MEV-rescue). Bug class: malfunctioning reentrancy lock in Vyper compiler versions 0.2.15, 0.2.16, 0.3.0 — `@nonreentrant` decorator did not actually enforce mutex on certain code paths. Multi-tx, multi-actor (several attackers exploited in parallel after first disclosure). Post-mortem: Curve official statement; Vyper team statement; Rekt News "Curve Finance — REKT"; ChainSecurity, Dedaub, OtterSec analyses; Vyper GitHub issue thread.

### Timeline

- Pre-deploy (Vyper): Vyper 0.2.15 released ~Aug 2021. The reentrancy-lock storage-slot collision bug was introduced in this version.
- Pre-deploy (Curve): Affected pools were deployed with Vyper 0.2.15/0.2.16/0.3.0 over 2021–2022. Some are years old and well-trusted.
- Vulnerability introduced: At Vyper-version time. Source-level Vyper code looks correct (uses `@nonreentrant("lock")`). The compiler emits the wrong storage-slot key for the lock, so two functions ostensibly sharing the same lock are actually reading different slots. Reentrancy is not prevented.
- Audit-coverage pre-exploit: Curve pools have been audited multiple times over their lifetime (Trail of Bits, MixBytes, Quantstamp [verify]). Compiler-level bugs are typically out of audit scope; auditors trust the compiler.
- Attack window: ~2 years between bug introduction and exploitation.
- Exploit txs: First exploit tx around block 17806000 [verify exact block]; cascade across alETH/ETH, msETH/ETH, pETH/ETH pools, then CRV/ETH.
- Post-mortem: Vyper publishes patched releases; Curve coordinates with white-hats including searcher c0ffeebabe.eth (who frontran one exploit and returned funds).

### Root cause (technical)

Vyper's `@nonreentrant("lock_name")` decorator is intended to prevent reentrancy across functions sharing the same lock name. The compiler is supposed to:
1. Allocate a storage slot for each unique lock name.
2. Insert mutex check + set + unset around each decorated function body.

In affected versions, the compiler had a slot-allocation bug where the *same lock name* used in different functions did not consistently resolve to the same storage slot. Two functions decorated with `@nonreentrant("lock")` could end up reading/writing different storage slots, with the result that calling one didn't acquire the lock seen by the other.

The Curve `add_liquidity` and `remove_liquidity` paths (and `exchange`) in affected pools had the compiler emit:
- `add_liquidity`: lock at storage slot S1
- `remove_liquidity`: lock at storage slot S2  ← *different slot, same source-level name*

So `remove_liquidity` could be reentered into `add_liquidity` (or vice versa) via a callback during a token transfer or ETH receive, *despite both being decorated with the same `@nonreentrant("lock")` source-level annotation*.

In Curve pools that involve ETH, the pool sends ETH to the user via `raw_call` or `send`, which can trigger a fallback function on the recipient's contract, which can then reenter into the pool with the AMM's accounting in an inconsistent state.

Pseudocode of the affected Curve pool function (`pETH/ETH` flavor):

```vyper
# Vyper source (0.2.15)
@external
@payable
@nonreentrant('lock')
def add_liquidity(amounts: uint256[N_COINS], min_mint_amount: uint256) -> uint256:
    # ... compute mint amount, transfer underlying tokens in
    self.balances[i] += amounts[i]   # state update
    # ... mint LP tokens to msg.sender
    return mint_amount

@external
@nonreentrant('lock')
def remove_liquidity(...) -> uint256[N_COINS]:
    # state update
    self.balances[i] -= ...
    # transfer underlying out — for the ETH pair, this is a raw_call
    raw_call(msg.sender, b"", value=eth_amount)  # ← yields control here
    # ... post-transfer accounting
    return amounts
```

If the `@nonreentrant('lock')` lock for these two functions resolves to *different* storage slots, then `raw_call`'s callback can invoke `add_liquidity` (or `exchange`) on the same pool while the AMM's invariant is mid-update.

The exploit is then a classic AMM-imbalance attack: while inside `remove_liquidity`, the attacker reenters and trades against the pool whose balance accounting reflects only part of the in-progress remove. The attacker's reentrant trade gets a too-favorable price; the pool's invariant snaps back to a worse state for honest LPs.

### Attack flow (representative — pETH/ETH pool, ~$11M)

1. **Attacker contract deposits a small position** as LP to the pETH/ETH pool (mints LP tokens).
2. **Attacker calls `remove_liquidity_one_coin(...)`** to withdraw ETH from the pool.
3. **Curve transfers ETH** to attacker via raw_call. Inside the attacker's fallback (still mid-`remove_liquidity_one_coin`), they call `add_liquidity(...)` on the *same* pool with a small pETH/ETH deposit.
4. **`add_liquidity`** sees a stale `self.balances` state (reflecting pre-transfer state), computes a price favorable to the attacker, mints them LP tokens at a discount.
5. **Control returns** to `remove_liquidity_one_coin` which finishes its bookkeeping.
6. **Attacker now redeems the over-minted LP tokens** for a disproportionate share of pool reserves.
7. **Repeat across pools.** Different attackers ran the same template against alETH/ETH, msETH/ETH, CRV/ETH within the next few hours.

### Pre-exploit signals

- **Static signal:** Slither doesn't analyze Vyper. Vyper-specific tooling is thin. The bug is in the *compiler*, not the source — neither audits of Curve nor audits of Vyper would have caught it without compiler-level testing.
- **Audit signal:** None on the Curve side (compilers are out of scope). Vyper had its own audits but the `@nonreentrant` slot allocation logic was not specifically property-tested.
- **Public speculation:** A few Vyper internal contributors had filed GitHub issues about reentrancy decorator inconsistencies in late 2022 / early 2023 [verify exact issue numbers]. These were open issues, not security disclosures. Reading the Vyper repo's open issues would have hinted that the decorator was not battle-tested.
- **Bug bounty:** Curve had an Immunefi program. Vyper had bounty coverage [verify amount]. No relevant pre-exploit submission.

The signal that *would have caught it* is differential testing: compile a corpus of `@nonreentrant`-decorated functions across Vyper versions, compare emitted bytecode for storage-slot consistency. This is a compiler-fuzzing exercise, not a contract-audit one.

### What our harness would need

- **Static-analyzer output sufficiency:** *Insufficient* at the Curve level. The Vyper source is correct; the bug is in the compiled bytecode. To catch this, the harness would need to verify bytecode-level reentrancy guards, not source-level annotations.
- **Required LLM-reasoning depth:**
  - Q1: "What compiler version produced the deployed bytecode? Does that version have known security defects?"
  - Q2: "For each function with a source-level reentrancy annotation, does the bytecode actually contain the expected mutex pattern (load slot, check, set, body, unset)?"
  - Q3: "Do all functions ostensibly sharing a lock name actually load and write the same storage slot for the lock?"
- **Required validation tier:** **fork-execution-with-mocked-actor** plus bytecode-level analysis. Specifically: deploy attacker contract with a fallback that calls `add_liquidity` on the pool. Call `remove_liquidity_one_coin`. Assert net profit > 0 from the round trip.
- **Required cross-contract context:** Curve pool + (mocked) attacker contract. Single-chain.
- **Required temporal / economic state setup:** Pre-exploit pool state with sufficient depth in the affected pool to make the imbalance profitable. The attack works only on pools with native-ETH transfers (ones that yield control via `raw_call`); pure-ERC-20 pools are not vulnerable.

### Lessons for Silica

- **Lead specialist:** *state-manipulation* (reentrancy) but with a *compiler-version-vulnerability* meta-specialist that should be checked first.
- **Heuristic to add to library:** `compiler.known-vulnerable-version` — maintain a curated list of compiler versions × known issues (Vyper 0.2.15/0.2.16/0.3.0 with reentrancy slot bug; Solidity 0.8.x ABI encoder issues; etc.) and flag any deployed contract whose compiler signature matches. Companion: `bytecode.reentrancy-lock-coherence` — for each function source-annotated as `@nonreentrant` (Vyper) or guarded by a `nonReentrant` modifier (Solidity), verify the bytecode actually loads/sets the same storage slot across all such functions.
- **Bench-case shape:** Forked mainnet at block 17805999 with pETH/ETH pool + attacker contract. Reenter via raw_call fallback. Assert profit.
- **Detection-difficulty class:** **hard** for the original-discovery case; **easy** retrospectively given the compiler-version blocklist.
- **Could Cecuro plausibly catch this today?** Yes for *new* Curve-style deployments — compiler-version blocklist is a well-known check now. *Conditionally* for pre-existing deployments — requires a continuous re-scan that flags previously-blessed contracts when a new compiler-vulnerability disclosure comes in. This is exactly the kind of thing a hosted continuous-audit harness should do that one-time-audit pipelines cannot.

The deeper lesson: compiler bugs are an underserved security surface. Audit reports routinely state "out of scope: compiler correctness" and that disclaimer was acceptable until Curve/Vyper proved otherwise. Silica's harness should *include* a compiler-vulnerability scanner as a first-pass check on every deployed contract, with versioned heuristics that update as new compiler bugs are disclosed. This is structurally similar to OS security advisories: keep a CVE-style feed of compiler issues and reflect them in the harness.
