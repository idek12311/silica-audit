# Smart-Contract Bug Taxonomy (Silica Audit Harness)

**Purpose.** A dense, reusable catalog of smart-contract bug classes used by the Silica audit harness to (a) route findings into detector pipelines, (b) configure heuristic and LLM-reasoning detectors, (c) generate validation tests at the right rung of the PoC ladder, and (d) cluster historical exploits for pattern mining. Each entry is self-contained: definition, canonical real-world example, native-tooling signal, PoC validation rung, false-positive shapes, look-alikes, remediation, and detection heuristic seeds.

**VM scope shorthand.** EVM = Ethereum-style EVM chains (incl. L2s). SVM = Solana VM. Move = Sui/Aptos Move. "universal" = appears on all major VMs.

**Validation tier ladder (used in every entry).**
1. compile-only
2. fork-execution-no-revert
3. fork-execution-state-asserted
4. fork-execution-with-mocked-actor
5. multi-tx-orchestrated
6. multi-fork-coordinated
7. mempool-replay
8. time-shifted
9. invariant-fuzz-counterexample
10. formal-proof

---

## 1. Access control & authorization

### AC-MISSING-OWNER-CHECK-001

**Category:** Access control & authorization
**SWC mapping:** SWC-105 (unprotected ether withdrawal) / SWC-106 (unprotected SELFDESTRUCT)
**VM scope:** EVM

**Definition:**
A privileged function that mutates global state, transfers funds, or upgrades code does not assert `msg.sender` is the owner / admin / role-holder. Anyone can call it. The bug is one missing modifier, not a misconfigured one.

**Canonical example:**
Parity Multisig Wallet (July 2017, second incident): the library's `initWallet` (which set the owners) had no `onlyOwner` guard and was directly callable on the library contract; an attacker called `initWallet`, became owner, then called `kill()` and `selfdestruct`-ed the library, freezing ~513,774 ETH across all wallets that delegated to it. (See post-mortem: https://www.parity.io/blog/security-alert-2/.)

```solidity
// Vulnerable: no access modifier; anyone can take ownership of the library
function initWallet(address[] calldata _owners, uint _required, uint _daylimit) public {
    initMultiowned(_owners, _required);
    initDaylimit(_daylimit);
}

function kill(address _to) public { // also unguarded
    selfdestruct(_to);
}
```

**Native detection signal:**
Slither: `suicidal`, `arbitrary-send-eth`, `unprotected-upgrade`. Mythril: `MissingProtectionForEtherWithdrawal`. Pattern-style.

**PoC validation strategy:**
fork-execution-state-asserted. Deploy to a local fork, call the public function from a non-owner EOA, assert state mutation succeeded (e.g., owner became attacker; balance transferred).

**False positive shapes:**
1. Function is `internal` or `private` and only called by a guarded `external` wrapper — no external attack surface.
2. Function is gated by a `modifier` whose body calls a getter that returns a hard-coded role check — Slither sometimes mis-flags these.
3. Constructor-only logic mistaken for runtime path.

**Look-alikes:**
AC-INITIALIZER-RACE-002 — looks the same (no modifier) but is specifically the proxy `initialize()` pattern with different lifecycle implications.

**Remediation patterns:**
Apply OpenZeppelin `Ownable` + `onlyOwner`, or `AccessControl` with named roles. For multi-sig admin paths, route through a Gnosis Safe or `TimelockController`.

**Heuristic seeds:**
- Function mutates `owner`, calls `selfdestruct`, or transfers ETH/ERC-20 from contract balance, AND has no `require(msg.sender == ...)` and no recognized auth modifier.
- Function name matches `/^(set|init|upgrade|withdraw|kill|destroy|migrate|sweep)/i` and visibility is `public|external` and no auth modifier.
- Function calls `_authorizeUpgrade` directly without override, or `_authorizeUpgrade` is empty.

---

### AC-INITIALIZER-RACE-002

**Category:** Access control & authorization
**SWC mapping:** SWC-118 (incorrect constructor name) — adjacent
**VM scope:** EVM (proxy pattern)

**Definition:**
A logic contract behind a proxy is deployed but its `initialize()` is not atomically called in the same transaction as the proxy deployment, OR the implementation contract is left uninitialized so that an attacker can call `initialize` on the implementation directly and then exploit a `selfdestruct`/upgrade path on the implementation, bricking all proxies.

**Canonical example:**
Wormhole bridge (uninitialized implementation) advisory; Parity Multisig second hack is the same root cause on a different proxy model. Public OpenZeppelin advisory on uninitialized UUPS implementations: https://blog.openzeppelin.com/uupsupgradeable-vulnerability-post-mortem.

```solidity
contract LogicV1 is UUPSUpgradeable, OwnableUpgradeable {
    function initialize() public initializer {
        __Ownable_init();
    }
    // Inherited _authorizeUpgrade calls onlyOwner, but the IMPLEMENTATION
    // is never initialized, so msg.sender becomes owner of the implementation,
    // upgrades it to a malicious contract that selfdestructs.
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
```

**Native detection signal:**
Slither: `unprotected-upgrade`. OpenZeppelin Upgrades plugin warns at deploy time. LLM-reasoning required to confirm whether `_disableInitializers()` is called in the implementation's constructor.

**PoC validation strategy:**
fork-execution-state-asserted. Call `initialize()` on the implementation address (not the proxy) from an attacker EOA, assert ownership transferred, then call `upgradeTo(maliciousImpl)` and assert proxies are bricked or funds drained.

**False positive shapes:**
1. Constructor of the implementation calls `_disableInitializers()`.
2. Logic contract is not behind a proxy at all.
3. `initialize` is `internal` and only callable through a factory that atomic-deploys + calls.

**Look-alikes:**
AC-MISSING-OWNER-CHECK-001 (the surface looks identical) and PROXY-STORAGE-COLLISION (both proxy bugs but different layer).

**Remediation patterns:**
Constructor of every UUPS implementation calls `_disableInitializers()`. Use OpenZeppelin Upgrades Hardhat/Foundry plugin which enforces this at deploy.

**Heuristic seeds:**
- Contract inherits `Initializable` but constructor is empty.
- `initialize` modifier present and `_authorizeUpgrade` exists, but no `_disableInitializers()` call in any constructor.
- Deployment script does not atomically `deploy + call initialize` in same tx.

---

### AC-ROLE-CONFUSION-DEFAULT-ADMIN-003

**Category:** Access control & authorization
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
Using OpenZeppelin `AccessControl` with `DEFAULT_ADMIN_ROLE` left at deployer, or admin of a privileged role is the role itself, allowing role members to grant the role to anyone, breaking the principle of least privilege.

**Canonical example:**
Multiple lower-tier DeFi protocols; the bug class is documented in OZ's docs. The general pattern: deployer keeps `DEFAULT_ADMIN_ROLE` indefinitely and a phishing/key-compromise grants attacker every role.

```solidity
// Vulnerable: deployer is permanent root admin; no timelock, no renounce
contract Vault is AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER");
    constructor() { _grantRole(DEFAULT_ADMIN_ROLE, msg.sender); }
}
```

**Native detection signal:**
LLM-reasoning required (semantic — "should the deployer be root admin forever?"). Slither does not flag.

**PoC validation strategy:**
compile-only + fork-execution-state-asserted. Show a single key compromise path that yields full role takeover.

**False positive shapes:**
1. Admin role is held by a `TimelockController` or multisig with a publicly-documented signer set.
2. `renounceRole` is called in the constructor immediately after configuration.
3. `DEFAULT_ADMIN_ROLE` is set to `address(0)` after deployment (truly burned).

**Look-alikes:**
AC-MISSING-OWNER-CHECK-001 (different mechanism — there a check is missing; here the check exists but the keys are over-privileged).

**Remediation patterns:**
Use `AccessControlDefaultAdminRules` (OZ 4.9+) which adds delay + acceptance handshake. Or transfer `DEFAULT_ADMIN_ROLE` to a `TimelockController` post-deployment.

**Heuristic seeds:**
- `_grantRole(DEFAULT_ADMIN_ROLE, msg.sender)` in constructor with no subsequent transfer.
- `getRoleAdmin(X) == X` pattern.
- No `TimelockController` or `Safe` referenced anywhere in deployment scripts.

---

### AC-TX-ORIGIN-AUTH-004

**Category:** Access control & authorization
**SWC mapping:** SWC-115
**VM scope:** EVM

**Definition:**
Authorization gated on `tx.origin` rather than `msg.sender` allows a malicious contract that the user innocently calls to inherit user authority and drain funds. `tx.origin` is the externally-owned account at the start of the call chain, not the immediate caller.

**Canonical example:**
Documented since 2018. No major exploit by name, but consistently flagged in audits. Vyper/Solidity docs explicitly warn against it.

```solidity
function withdraw(address to) external {
    require(tx.origin == owner); // BUG: phishable
    payable(to).transfer(address(this).balance);
}
```

**Native detection signal:**
Slither: `tx-origin`. Mythril: `TxOrigin`. Solhint: `avoid-tx-origin`. Pattern-style, very high precision.

**PoC validation strategy:**
multi-tx-orchestrated. Build attacker contract that the victim calls; attacker contract calls back into the vulnerable function; assert funds drained.

**False positive shapes:**
1. `tx.origin` used only for analytics / event logging, not auth.
2. Used in combination with `tx.origin == msg.sender` to detect a re-entry from a contract — even this is a smell but not an auth bypass.

**Look-alikes:**
None — this pattern is unambiguous.

**Remediation patterns:**
Always use `msg.sender` for authorization. If you need to verify "this came from an EOA", that test is itself broken post-EIP-3074/7702 — drop it.

**Heuristic seeds:**
- Any `require(tx.origin == ...)` or `if (tx.origin != ...)` revert path.
- `msg.sender == tx.origin` used as a "no contract" check.

---

### AC-DELEGATECALL-TO-USER-INPUT-005

**Category:** Access control & authorization
**SWC mapping:** SWC-112
**VM scope:** EVM

**Definition:**
Contract `delegatecall`s into an address derived from user input, allowing the caller to execute arbitrary code in the contract's storage context — full takeover.

**Canonical example:**
Parity Multisig (first incident, July 2017) — `execute()` allowed arbitrary delegatecall, leading to ~150K ETH theft. Audius governance hijack (July 2022, ~$6M) was a related pattern: a delegatecall into a function whose selector collided with `initialize`.

```solidity
function proxy(address impl, bytes calldata data) external {
    (bool ok, ) = impl.delegatecall(data); // BUG: any caller, any target
    require(ok);
}
```

**Native detection signal:**
Slither: `controlled-delegatecall`, `delegatecall-loop`. Mythril: `DelegateCall`.

**PoC validation strategy:**
fork-execution-state-asserted. Deploy attacker impl that overwrites slot 0 (owner); attacker calls `proxy(attackerImpl, takeoverCalldata)`; assert owner changed.

**False positive shapes:**
1. `delegatecall` target is an immutable address set in constructor and never user-controllable.
2. Target is bounded by an allowlist (`require(approved[impl])`).

**Look-alikes:**
PROXY-STORAGE-COLLISION-001 — both involve delegatecall, but here the bug is the target choice; there it's storage layout drift.

**Remediation patterns:**
Restrict `delegatecall` targets to a hard-coded address or an admin-managed allowlist. Prefer `call` if you don't need shared storage.

**Heuristic seeds:**
- `delegatecall` invoked on a parameter-derived address with no allowlist.
- Function calls `delegatecall` and the function is `external`/`public`.

---

## 2. Reentrancy & state-update ordering

### REENT-CLASSIC-CHECKS-EFFECTS-006

**Category:** Reentrancy & state-update ordering
**SWC mapping:** SWC-107
**VM scope:** EVM

**Definition:**
External call (ETH transfer, ERC-20 hook, ERC-721 `onERC721Received`, ERC-777 hook) is made before the contract's own state is updated. Reentrant call observes pre-update state and double-spends.

**Canonical example:**
The DAO (June 2016, ~$60M, led to Ethereum hard fork). Vulnerable pattern:

```solidity
function withdraw() public {
    uint bal = balances[msg.sender];
    (bool ok,) = msg.sender.call{value: bal}(""); // external call BEFORE update
    require(ok);
    balances[msg.sender] = 0;                     // update too late
}
```

**Native detection signal:**
Slither: `reentrancy-eth`, `reentrancy-no-eth`, `reentrancy-benign`, `reentrancy-events`. Mythril: `ExternalCalls`. Echidna invariant: "balances sum equals contract balance".

**PoC validation strategy:**
multi-tx-orchestrated (single transaction with reentrant attacker contract). Attacker contract's `receive()` calls back into `withdraw`. Assert attacker withdrew more than initial balance.

**False positive shapes:**
1. Effects-then-interactions — state already zeroed before call.
2. Call target is a hard-coded WETH or known-non-reentrant contract (still risky but lower severity).
3. `nonReentrant` modifier present.

**Look-alikes:**
REENT-READ-ONLY-007 (same surface, different semantic — read state from another contract, not write).

**Remediation patterns:**
Checks-Effects-Interactions ordering. OZ `ReentrancyGuard` (`nonReentrant`). Solmate `ReentrancyGuard` (transient-storage variant on EVM 1153 chains).

**Heuristic seeds:**
- An `external call` (`.call`, `.transfer`, `.send`, ERC-20 `transferFrom` to user-controlled address) precedes a state write to a mapping keyed by `msg.sender`.
- Function lacks `nonReentrant` modifier and emits state change after a call.
- Receiver is `payable(msg.sender)` — high prior for reentrancy if no guard.

---

### REENT-READ-ONLY-007

**Category:** Reentrancy & state-update ordering
**SWC mapping:** N/A (newer pattern)
**VM scope:** EVM

**Definition:**
External contract observes a victim contract mid-execution while the victim's state is temporarily inconsistent, and acts on the stale view. Even though the victim has a `nonReentrant` guard, an *external* contract reading from it (via a view function during a reentrant ERC-777/ERC-721 callback) sees inconsistent state.

**Canonical example:**
Curve Finance read-only reentrancy (multiple incidents 2022–2023). ChainSecurity disclosure: https://chainsecurity.com/curve-lp-oracle-manipulation-post-mortem/. Sentiment Protocol exploit (April 2023, ~$1M) used Balancer pool read-only reentrancy.

```solidity
// Curve-style: get_virtual_price reads pool state mid-callback
function totalAssets() public view returns (uint) {
    return pool.get_virtual_price() * lpBalance / 1e18; // BUG: mid-callback view
}
```

**Native detection signal:**
LLM-reasoning required. Slither does not have a dedicated detector for this. Pattern: `nonReentrant`-protected function in pool A, callback in token B, view function `get_virtual_price` does NOT have its own reentrancy guard.

**PoC validation strategy:**
multi-tx-orchestrated. Trigger pool action that calls into an ERC-777/ERC-721 hook; from the hook, query the pool's virtual_price/totalAssets; show the value is mathematically inconsistent vs. pre/post.

**False positive shapes:**
1. View function gates on the same `nonReentrant` flag (Curve eventually added this).
2. Victim contract has no callback path at all (no ERC-777, no ERC-721).
3. Reader uses TWAP not spot.

**Look-alikes:**
REENT-CLASSIC-006 (write-side); ORACLE-SPOT-PRICE-014 (also reads stale pool state but without callback mechanism).

**Remediation patterns:**
View functions on AMM pools must guard with the same reentrancy lock (Curve's `_check_reentrancy` post-fix). Consumers of pool views should sanity-check against TWAP.

**Heuristic seeds:**
- View function returns derived state from a contract that has callback hooks (ERC-777, ERC-721).
- `get_virtual_price`, `totalAssets`, `pricePerShare` called without same-tx guard.

---

### REENT-CROSS-FUNCTION-008

**Category:** Reentrancy & state-update ordering
**SWC mapping:** SWC-107
**VM scope:** EVM

**Definition:**
Function A guards against reentry into A, but during A's external call, attacker reenters function B, which mutates state that A was about to read. Single-function `nonReentrant` is insufficient.

**Canonical example:**
Lendf.Me (April 2020, $25M) — imBTC token had ERC-777 callback; attacker called `withdraw()` from within ERC-777 `tokensToSend` hook to drain via a different code path that read pre-update collateral state.

```solidity
function deposit(uint amount) external nonReentrant { ... }
function withdraw(uint amount) external { // not guarded against deposit reentry
    require(collateral[msg.sender] >= amount);
    token.transfer(msg.sender, amount); // ERC-777 hook reenters deposit
    collateral[msg.sender] -= amount;
}
```

**Native detection signal:**
Slither: `reentrancy-no-eth` (sometimes catches). LLM-reasoning required for confirming cross-function exposure.

**PoC validation strategy:**
multi-tx-orchestrated. Attacker contract implements `tokensToSend`, calls `withdraw`, in the hook calls `deposit`, exits, balances inconsistent.

**False positive shapes:**
1. All mutating functions share a single `nonReentrant` guard.
2. ERC-20 token verified to have no callback (USDC, DAI).

**Look-alikes:**
REENT-CLASSIC-006 (single function); REENT-READ-ONLY-007 (no cross-function write).

**Remediation patterns:**
Apply `nonReentrant` to all mutating functions on the same contract; consider a global lock keyed on `(this, slot)`.

**Heuristic seeds:**
- Multiple mutating externals share state but only some have `nonReentrant`.
- Token interactions involve known callback-bearing standards (ERC-777, ERC-1155 batch hooks, ERC-721 `safeTransferFrom`).

---

## 3. Arithmetic / precision / rounding

### ARITH-PRECISION-LOSS-DEPOSIT-009

**Category:** Arithmetic / precision / rounding
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
ERC-4626 vault or AMM pool's first depositor can mint near-zero shares for the next depositor by donating assets directly to the contract before they deposit. This is a precision attack, not an arithmetic overflow.

**Canonical example:**
ERC-4626 inflation attack — documented widely; reproduced against many forks of Compound v2 / Yearn v1 vault math. OpenZeppelin's mitigation discussion: https://blog.openzeppelin.com/a-novel-defense-against-erc4626-inflation-attacks.

```solidity
// shares = assets * totalSupply / totalAssets, with totalSupply == 1 wei
// and totalAssets inflated by direct transfer ⇒ second depositor gets 0 shares
function deposit(uint assets) external returns (uint shares) {
    shares = totalSupply == 0 ? assets : assets * totalSupply / totalAssets();
    _mint(msg.sender, shares);
    asset.transferFrom(msg.sender, address(this), assets);
}
```

**Native detection signal:**
Echidna invariant: "deposit followed by withdraw should yield ≥ original assets minus fee". LLM-reasoning required to flag at static time.

**PoC validation strategy:**
fork-execution-state-asserted. Attacker mints 1 share via 1 wei deposit; transfers 100e18 directly; victim deposits 99e18 and gets 0 shares; attacker withdraws everything.

**False positive shapes:**
1. Vault uses OZ 4.8+ ERC-4626 with virtual shares/assets offset.
2. Vault mints "dead shares" to address(0) at deployment.
3. Vault has minimum-deposit floor that exceeds attack threshold.

**Look-alikes:**
ARITH-DIVISION-BEFORE-MULTIPLICATION-010 (a precision bug, but mathematical, not adversarial).

**Remediation patterns:**
OZ ERC-4626 virtual offset (`_decimalsOffset`). Or seed the vault with permanent dead shares at deploy.

**Heuristic seeds:**
- ERC-4626 vault implementation does NOT inherit OZ 4.8+ or does not override `_decimalsOffset`.
- `convertToShares` / `convertToAssets` uses `mulDiv` without virtual offset.
- No initial dead-share seeding in constructor or deploy script.

---

### ARITH-DIVISION-BEFORE-MULTIPLICATION-010

**Category:** Arithmetic / precision / rounding
**SWC mapping:** SWC-101 (adjacent — overflow/precision)
**VM scope:** EVM, Solana, Move

**Definition:**
Division performed before multiplication truncates intermediate result and loses precision; downstream user pays or receives a slightly-wrong amount. Compounds at scale or in fee math.

**Canonical example:**
Numerous; e.g., Uranium Finance migration math (April 2021, $50M) had a related precision-shift bug introducing free buys. Generally documented as "always multiply before divide".

```solidity
// BUG: integer truncation
uint fee = amount / 10000 * feeBps;       // wrong
// FIX
uint fee = amount * feeBps / 10000;       // right
```

**Native detection signal:**
Slither: `divide-before-multiply`. High precision detector.

**PoC validation strategy:**
compile-only + fork-execution-state-asserted with concrete numeric assertion (e.g., expected 333 wei, observed 0).

**False positive shapes:**
1. The dividend is provably divisible (compile-time constants).
2. The "loss" is intentional (rounding down for safety in vault accounting).

**Look-alikes:**
ARITH-PRECISION-LOSS-009 (which exploits rounding adversarially); ARITH-OVERFLOW-011 (different — full overflow, not truncation).

**Remediation patterns:**
Always `(a * b) / c` order. Use OZ `Math.mulDiv` for safe high-precision multiply-then-divide. For vaults, use `mulDivRoundingUp` deliberately.

**Heuristic seeds:**
- AST node `BinaryOp(/, _, _)` followed by `BinaryOp(*, _, _)` on the same lineage.
- Fee or interest formula with division as the leading operation.

---

### ARITH-OVERFLOW-UNCHECKED-011

**Category:** Arithmetic / precision / rounding
**SWC mapping:** SWC-101
**VM scope:** EVM, Solana, Move

**Definition:**
Pre-Solidity-0.8 integer overflow/underflow without SafeMath, OR post-0.8 use of `unchecked { }` block where the assumption "this can't overflow" is wrong. On Solana, `wrapping_*` or `as` casts produce silent wraps.

**Canonical example:**
BeautyChain (April 2018, $900M+ market-cap wipe) — `batchTransfer(_receivers, _value)` had `uint amount = uint(_receivers.length) * _value` overflow. Pre-0.8 era exemplar.

```solidity
function batchTransfer(address[] memory _to, uint _value) public {
    uint amount = _to.length * _value; // overflow ⇒ amount = 0
    require(balances[msg.sender] >= amount);
    balances[msg.sender] -= amount;
    for (uint i = 0; i < _to.length; i++) balances[_to[i]] += _value; // mints!
}
```

**Native detection signal:**
Slither: `arbitrary-send-erc20` adjacent; specific overflow detection in pre-0.8 code via Mythril `IntegerOverflow`. For 0.8+ unchecked blocks: LLM-reasoning required.

**PoC validation strategy:**
fork-execution-state-asserted. Provide concrete inputs that overflow; assert post-state diverges from intended math.

**False positive shapes:**
1. Use of `unchecked` for a gas optimization where bounds are statically provable (e.g., `++i` in a loop with known bound).
2. SafeMath/SafeCast used everywhere.
3. Typed bound check immediately above the unchecked block.

**Look-alikes:**
ARITH-CAST-NARROWING-012 (truncation cast vs. wrap).

**Remediation patterns:**
Solidity ≥ 0.8 default checks. Use `unchecked` only with a comment justifying provable bounds. On Rust/Solana use `checked_add/sub/mul`.

**Heuristic seeds:**
- Solidity pragma < 0.8 with arithmetic on user input not guarded by SafeMath.
- `unchecked { }` block contains user-input-derived expression.
- Rust `as u64` cast on a value originating from instruction data.

---

### ARITH-CAST-NARROWING-012

**Category:** Arithmetic / precision / rounding
**SWC mapping:** SWC-101 (adjacent)
**VM scope:** EVM, Solana

**Definition:**
Down-casting (`uint256 → uint128`, `int256 → int128`) silently truncates upper bits when the value exceeds the target range, leading to silently corrupted accounting. On Rust, `value as u32` on a u64 is the same bug.

**Canonical example:**
Compound Finance comp distribution bug (Sept 2021, ~$80M — distributed COMP via a misconfig that effectively misused index math). More directly: many DEXes have downcast bugs in tick math (Uniswap v3 hand-rolled clones).

```solidity
function setReserves(uint256 r) external {
    reserves = uint112(r); // BUG: silent narrowing
}
```

**Native detection signal:**
Slither: no first-class detector; some downcast linting in `solhint`. Mythril: `IntegerOverflow` partial.

**PoC validation strategy:**
fork-execution-state-asserted. Pass r = 2^113; assert reserves stored differs from input.

**False positive shapes:**
1. Cast preceded by `require(r <= type(uint112).max)`.
2. Use of OZ `SafeCast.toUint112` which reverts on overflow.

**Look-alikes:**
ARITH-OVERFLOW-011 (different — wrap vs. truncate, but related family).

**Remediation patterns:**
OZ `SafeCast`. On Rust, `u128::try_from(u256_val)`.

**Heuristic seeds:**
- AST cast to uint{N} with N < 256 with no prior bound check.
- `as u32`/`as u64` in Rust without `try_from`.

---

### ARITH-FIXED-POINT-EXP-LOG-013

**Category:** Arithmetic / precision / rounding
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
Hand-rolled fixed-point math (Taylor series exp/log, Babylonian sqrt with too few iterations, signed Q64.96 arithmetic) yields off-by-rounding results that compound under flash-loan-scale inputs and let attackers extract value.

**Canonical example:**
Onyx Protocol (Sept 2023, ~$2.1M) had related Compound-fork rounding issue. Mochi Inu / Orange Finance edge-case sqrt rounding. Also see Euler Finance (March 2023, $197M) — donation+rounding-amplification.

```solidity
function rpow(uint x, uint n, uint base) internal pure returns (uint z) {
    // hand-rolled exponentiation; off-by-one on n=0 or x=0 edge cases
}
```

**Native detection signal:**
LLM-reasoning required. Echidna fuzz invariants (e.g., monotonicity of `pow`).

**PoC validation strategy:**
invariant-fuzz-counterexample. Echidna campaign on the fixed-point lib testing identities (`exp(0)==1`, `log(1)==0`, `sqrt(x*x)==x`).

**False positive shapes:**
1. Library is well-known (PRBMath, ABDKMath64x64, Solmate FixedPointMathLib) and audited.
2. Function is only called with input bounded by code-level checks.

**Look-alikes:**
ARITH-PRECISION-LOSS-009 (vault inflation), ARITH-DIVISION-010 (mul/div ordering).

**Remediation patterns:**
Use audited libraries (PRBMath, ABDK, Solmate FixedPointMathLib). Document precision contract on every fixed-point function.

**Heuristic seeds:**
- Hand-coded `exp`/`log`/`sqrt`/`pow` not from a known library.
- Loop with `mulDiv` and a magic constant (Taylor coefficients).

---

## 4. Oracle / price-feed manipulation

### ORACLE-SPOT-PRICE-MANIPULATION-014

**Category:** Oracle / price-feed manipulation
**SWC mapping:** N/A
**VM scope:** EVM, Solana

**Definition:**
Pricing collateral or rewards using the *current* spot reserves of an AMM pool (`getReserves` on Uniswap v2, `slot0` on Uniswap v3) lets a single-block attacker swap to skew the price, transact, swap back. With flash loans this is essentially free.

**Canonical example:**
Cream Finance (Oct 2021, ~$130M) — used spot AMM as collateral oracle. Harvest Finance (Oct 2020, $24M) — Curve pool spot price. bZx (Feb 2020, ~$1M) — early flash-loan-spot canonical.

```solidity
function getPrice(address token) external view returns (uint) {
    (uint r0, uint r1, ) = pair.getReserves(); // BUG: spot
    return r1 * 1e18 / r0;
}
```

**Native detection signal:**
Slither: no direct detector. LLM-reasoning required (semantic — "is this price fed to a financial decision?").

**PoC validation strategy:**
multi-tx-orchestrated + flash-loan-funded (rung 5/6). Flash-loan, swap to skew pool, call victim, swap back, repay loan, profit.

**False positive shapes:**
1. Price is read for off-chain UI only (no on-chain consumer).
2. Reserves read are *consulted* but cross-checked against TWAP/Chainlink.
3. Price is from a price-stable asset pair only (still risky but lower severity).

**Look-alikes:**
ORACLE-STALE-CHAINLINK-015 (different oracle source, same blast radius); ORACLE-INSUFFICIENT-TWAP-016 (TWAP too short).

**Remediation patterns:**
Uniswap v3 TWAP with ≥30-min window AND a Chainlink cross-check. For Curve, use `get_virtual_price()` and bound it; do not use spot.

**Heuristic seeds:**
- Call to `getReserves()`/`slot0()`/`token0Price` consumed by a function that mints, lends, or transfers value.
- Price source missing temporal averaging.
- No second oracle cross-check.

---

### ORACLE-STALE-CHAINLINK-015

**Category:** Oracle / price-feed manipulation
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
Reading Chainlink `latestAnswer()` (deprecated) or not validating `latestRoundData()` returns — specifically not checking `updatedAt` against a max staleness window or `answeredInRound >= roundId` — accepts an outdated price (e.g., a frozen feed during a chain halt) as authoritative.

**Canonical example:**
Synthetix sKRW frontrun incident (June 2019) — stale price feed exploited for ~$1B notional (largely socialized, not fully extracted, but illustrative). More recently: multiple lending platforms accepted frozen feeds during the LUNA depeg.

```solidity
function getPrice() external view returns (uint) {
    (, int answer,,,) = feed.latestRoundData(); // BUG: no staleness/round check
    return uint(answer);
}
```

**Native detection signal:**
Slither: no first-class detector. Heuristics from auditors. LLM-reasoning helpful for asserting domain context.

**PoC validation strategy:**
fork-execution-state-asserted. Mock the feed to return a stale `updatedAt`; assert the consumer accepts the stale price.

**False positive shapes:**
1. Code checks `block.timestamp - updatedAt < HEARTBEAT`.
2. Code checks `answeredInRound >= roundId`.
3. Feed is on a chain with documented zero-downtime SLA and the consumer does not need staleness checks (rare).

**Look-alikes:**
ORACLE-SPOT-014 (different source), ORACLE-NEGATIVE-PRICE-017 (different validation gap).

**Remediation patterns:**
Always validate full Chainlink return tuple. Reference Chainlink's "Recommended best practices" doc. For L2s, also check the L2 sequencer uptime feed.

**Heuristic seeds:**
- `latestAnswer()` deprecated call.
- `latestRoundData()` destructure that ignores `updatedAt` or `answeredInRound`.
- Missing `block.timestamp - updatedAt` check.
- Missing L2 sequencer-uptime check on Optimism/Arbitrum.

---

### ORACLE-INSUFFICIENT-TWAP-016

**Category:** Oracle / price-feed manipulation
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
TWAP window too short (≤ a few minutes) to resist single-block or short-burst manipulation by a well-funded actor with flash-loan amplification. Effectively spot pricing with a narrow smoothing.

**Canonical example:**
Inverse Finance (April 2022, $15.6M) — Inverse used a 30-minute Keep3r-derived TWAP that an attacker manipulated by skewing Sushi pool reserves over multiple blocks. Similar to Mango Markets (Oct 2022, $114M) but on a different mechanism.

```solidity
uint public constant TWAP_PERIOD = 600; // 10 min — too short for low-liquidity pair
```

**Native detection signal:**
LLM-reasoning required.

**PoC validation strategy:**
time-shifted + multi-tx-orchestrated. Manipulate pool over the TWAP window, demonstrate consumer accepts skewed price.

**False positive shapes:**
1. Window ≥ 30 min and pair has deep liquidity.
2. TWAP cross-checked with Chainlink.

**Look-alikes:**
ORACLE-SPOT-014 (the limit case of zero TWAP).

**Remediation patterns:**
≥ 30-min TWAP window for major pairs; longer for low-liquidity. Hardcode minimum-liquidity floor before trusting any TWAP. Cross-check.

**Heuristic seeds:**
- Uniswap v3 `observe(secondsAgos)` with `secondsAgos[0] < 1800`.
- TWAP-only path with no fallback / cross-check.

---

### ORACLE-NEGATIVE-PRICE-017

**Category:** Oracle / price-feed manipulation
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
Oracle returns a signed `int` answer; consumer casts it to `uint` without checking sign, allowing a (theoretically possible — has happened with WTI oil futures Apr 2020) negative price to wrap to a huge positive.

**Canonical example:**
The April 2020 negative WTI futures event broke several traditional and crypto-adjacent feeds; documented in Chainlink post-mortems. Pattern flagged in numerous audits since.

```solidity
(, int answer,,,) = feed.latestRoundData();
uint price = uint(answer); // BUG: negative wraps to huge positive
```

**Native detection signal:**
Slither: no detector. Pattern-match easy. Solhint plugin available.

**PoC validation strategy:**
compile-only with mocked feed returning `-1`. Assert consumer mints/lends absurd amount.

**False positive shapes:**
1. `require(answer > 0)` immediately after.
2. Asset truly cannot have negative price (stablecoin to USD).

**Look-alikes:**
ORACLE-STALE-015 (different validation gap).

**Remediation patterns:**
`require(answer > 0)`. Use OZ `SafeCast.toUint256(int256)`.

**Heuristic seeds:**
- `int answer` consumed by `uint(answer)` cast with no positivity check.

---

## 5. Flash-loan-amplified attacks

### FLASH-GOVERNANCE-VOTE-BUYING-018

**Category:** Flash-loan-amplified attacks
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
Governance contract uses balance-of-token-at-call-time (not a snapshot) to count votes; attacker flash-loans tokens, votes, repays. Or more subtly, a delegation/checkpoint check can be passed within a single block.

**Canonical example:**
Beanstalk Farms (April 2022, $182M) — attacker flash-loaned BEAN+3CRV LP, used it to pass an emergency proposal that drained the protocol in the same transaction. Post-mortem: https://halborn.com/blog/post/explained-the-beanstalk-hack-april-2022.

```solidity
function vote(uint proposalId, bool support) external {
    uint weight = governanceToken.balanceOf(msg.sender); // BUG: not snapshot
    proposals[proposalId].votes[support] += weight;
}
```

**Native detection signal:**
LLM-reasoning required. Heuristic on missing `getPastVotes` / Compound `getPriorVotes`.

**PoC validation strategy:**
multi-tx-orchestrated. Flash-loan, vote, execute, repay — all in one tx (or in two when `execute()` is unblocked).

**False positive shapes:**
1. `ERC20Votes` snapshotting / `getPastVotes` used.
2. Proposal has a timelock between propose and execute that exceeds flash-loan tenure.
3. Vote weight derived from staked-and-locked token.

**Look-alikes:**
FLASH-AMM-ARB-019 (different end-state); GOV-EMERGENCY-EXECUTION-026.

**Remediation patterns:**
Always snapshot voting power at proposal-creation block (`ERC20Votes.getPastVotes`). Enforce a non-zero timelock between vote-end and execution.

**Heuristic seeds:**
- `vote()` reads `balanceOf` (not `getPastVotes`).
- No `Timelock` between proposal queue and execute.
- Quorum based on current `totalSupply` not historical snapshot.

---

### FLASH-LIQUIDATION-FRONTRUN-019

**Category:** Flash-loan-amplified attacks
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
A position that's near-liquidatable can be made liquidatable by an attacker who flash-loans capital, manipulates an oracle (often spot-AMM), liquidates, restores oracle, profits. Combines flash + oracle.

**Canonical example:**
Cream Finance (Oct 2021, $130M) and bZx (Feb 2020) are both in this family. Mango Markets (Oct 2022, $114M) is the most pure example: attacker oracle-pumped MNGO via spot, borrowed against inflated collateral.

```solidity
// Lending market reads spot price; flash loan funds the swap that moves it
function liquidate(address user) external { ... priceOracle.getPrice(token) ... }
```

**Native detection signal:**
LLM-reasoning required.

**PoC validation strategy:**
multi-tx-orchestrated + flash-loan funded. Single tx: borrow, swap to manipulate, liquidate, swap back, repay.

**False positive shapes:**
1. Oracle is robust TWAP+Chainlink.
2. Liquidation has min-keep window past oracle update.

**Look-alikes:**
ORACLE-SPOT-014 — the *root cause*; this entry is the *exploit shape*.

**Remediation patterns:**
Use TWAP+Chainlink. Add liquidation cooldown / circuit breaker on price-move > N%.

**Heuristic seeds:**
- Liquidation path consumes a price source that's also DEX-spot-derived.
- No circuit breaker on rapid price move.

---

## 6. Governance & proposal exploitation

### GOV-PROPOSAL-PAYLOAD-INJECTION-020

**Category:** Governance & proposal exploitation
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
A proposal's executable payload is constructed from data fields that the proposer can modify between submission and execution (or the queue stores references resolved at execution time), allowing the proposer to bait-and-switch what voters think they approved.

**Canonical example:**
Tornado Cash governance takeover (May 2023, ~$1M effective control of governance) — attacker submitted a proposal whose `description` and on-chain logic looked benign but used `selfdestruct` + redeploy at the same address to swap in malicious code via CREATE2 between propose and execute.

```solidity
function propose(address target, bytes calldata data) external returns (uint id) {
    proposals[id] = Proposal(target, data); // BUG: target's code can change
}
function execute(uint id) external { proposals[id].target.call(proposals[id].data); }
```

**Native detection signal:**
LLM-reasoning required. Heuristic: detect `extcodehash` not pinned at propose-time.

**PoC validation strategy:**
multi-tx-orchestrated + time-shifted. Deploy benign target, submit proposal, vote, between vote-end and execute, `selfdestruct` and redeploy malicious at same address (CREATE2), execute.

**False positive shapes:**
1. Proposal pins `target.codehash` at propose-time and re-checks at execute-time.
2. Proposal payload is fully inline bytecode, not a target+selector.
3. Target is known to be a non-redeployable singleton (Compound Comptroller).

**Look-alikes:**
PROXY-IMPLEMENTATION-SWAP-031 (similar but proxy-specific).

**Remediation patterns:**
Pin and re-check `target.codehash` between propose and execute. Disallow targets in CREATE2 deployer factories. Use Tornado-fork's post-fix approach.

**Heuristic seeds:**
- Governor stores `(target, data)` and executes later without codehash pin.
- Target address sourced from a CREATE2 factory.

---

### GOV-EMERGENCY-EXECUTION-021

**Category:** Governance & proposal exploitation
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
An emergency-execute / fast-track path bypasses the normal timelock, gated only by a quorum that a flash-loan-funded attacker can clear. The path exists "for emergencies" but is the soft spot.

**Canonical example:**
Beanstalk (above, April 2022) — used the emergency-commit path that bypassed the normal 7-day governance window once a high-quorum vote passed.

```solidity
function emergencyExecute(uint id) external {
    require(votes[id].for >= EMERGENCY_QUORUM); // BUG: no timelock
    proposals[id].execute();
}
```

**Native detection signal:**
LLM-reasoning required.

**PoC validation strategy:**
multi-tx-orchestrated + flash-loan-funded.

**False positive shapes:**
1. Emergency path requires multisig signature in addition to quorum.
2. Emergency quorum is set higher than total flash-loan-able supply.

**Look-alikes:**
FLASH-GOVERNANCE-018.

**Remediation patterns:**
Even emergency execution must have a non-zero timelock; alternatively, require off-chain multisig signoff.

**Heuristic seeds:**
- Function name contains "emergency" / "fast" and bypasses Timelock.
- Branch in execute-path that skips queue-delay.

---

## 7. Proxy / upgradeability

### PROXY-STORAGE-COLLISION-022

**Category:** Proxy / upgradeability
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
A new implementation behind a proxy declares storage variables in a different slot order (or inserts a variable in the middle of the inherited chain), so reading slot N returns a different semantic value than the prior implementation wrote. Funds, owners, paused flags become corrupted.

**Canonical example:**
Audius (July 2022, ~$6M) had a proxy storage / initializer interplay. Older OpenZeppelin v3→v4 migration guidance includes warnings, e.g. https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable.

```solidity
// V1: slot 0 = owner, slot 1 = paused
contract V1 { address owner; bool paused; }
// V2: introduces version field at slot 0, shifts owner ⇒ owner reads from former paused slot
contract V2 { uint version; address owner; bool paused; }
```

**Native detection signal:**
OZ Upgrades plugin checks layout at deploy time. Slither: `unprotected-upgrade` adjacent. LLM-reasoning otherwise.

**PoC validation strategy:**
fork-execution-state-asserted. Deploy V1, set state, upgrade to V2, assert reads return wrong values.

**False positive shapes:**
1. New variables appended only at the end of the storage layout.
2. Use of EIP-1967 reserved slots for proxy bookkeeping (these can't collide if respected).
3. OZ Upgrades plugin used and passes layout check.

**Look-alikes:**
AC-INITIALIZER-RACE-002 (both proxy bugs but distinct mechanisms).

**Remediation patterns:**
OZ Upgrades plugin. Reserve `__gap` slots in upgradeable base contracts. Always append new state variables.

**Heuristic seeds:**
- Implementation contract inserts a new state variable above existing ones.
- Inherited base lacks `uint256[N] private __gap`.
- No OZ Upgrades plugin or `validate-upgrade` step in deploy script.

---

### PROXY-FUNCTION-SELECTOR-CLASH-023

**Category:** Proxy / upgradeability
**SWC mapping:** N/A
**VM scope:** EVM (Diamond / multi-facet pattern)

**Definition:**
Two functions across a Diamond proxy's facets share the same 4-byte selector (collision) — the dispatcher routes to the wrong facet. Same can happen with proxy admin functions clashing with implementation functions.

**Canonical example:**
General class — Nick Mudge's diamond standard EIP-2535 lays out the risk. OpenZeppelin Transparent Proxy avoids this for admin functions by switching dispatch on `msg.sender == admin`.

```solidity
function burn(uint128 from, uint128 to) external { ... }     // selector A
function someOther(uint256 id) external { ... }              // selector A (collision)
```

**Native detection signal:**
EIP-2535 reference impls have a registry check. Slither: no direct detector, but `function-init-state-variables` partial.

**PoC validation strategy:**
compile-only + state-asserted. Show two facet adds with same selector; observe second clobbers first or revert (depending on impl).

**False positive shapes:**
1. Diamond uses Louper or similar that prevents adding clashing selectors.
2. Manual selector audit in deploy script.

**Look-alikes:**
PROXY-STORAGE-022.

**Remediation patterns:**
Selector registry + collision check at facet-add time. Use Transparent Proxy pattern for upgrades-only admin.

**Heuristic seeds:**
- Diamond cut / facet-add path doesn't enforce selector uniqueness.
- Two facets export 4-byte selectors that overlap (compute at deploy).

---

### PROXY-IMPLEMENTATION-SELFDESTRUCT-024

**Category:** Proxy / upgradeability
**SWC mapping:** SWC-106
**VM scope:** EVM

**Definition:**
Implementation behind a UUPS proxy contains `selfdestruct` reachable from a caller path; if anyone reaches it, the implementation is gone, and all proxies pointing at it become non-functional or upgradeable to nothing.

**Canonical example:**
Same root as Parity Multisig second hack (above) — `kill()` on the library with no auth.

**Native detection signal:**
Slither: `suicidal`. Pattern-style.

**PoC validation strategy:**
fork-execution-state-asserted.

**False positive shapes:**
1. `selfdestruct` only reachable through a multisig-gated proposal.
2. Implementation has `_disableInitializers()` and constructor-only setup that prevents reaching kill path.

**Look-alikes:**
AC-MISSING-OWNER-001, AC-INITIALIZER-RACE-002.

**Remediation patterns:**
Remove `selfdestruct` entirely from upgradeable implementations. If upgrade is needed, use the proxy's own upgrade flow.

**Heuristic seeds:**
- Implementation inherits `Initializable` AND contains `selfdestruct`.

---

## 8. Cross-contract / composition

### CROSS-DONATION-INFLATION-025

**Category:** Cross-contract / composition
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
Contract trusts its own `address(this).balance` or `IERC20(token).balanceOf(address(this))` as canonical accounting. An attacker donates directly (`selfdestruct` → ETH; `transfer` → tokens); the contract's math now thinks more value exists than has been accounted for via the deposit path.

**Canonical example:**
Compound v2's accrued-interest math has a related case. Many ERC-4626 inflation attacks (entry 009) are this. Visor Finance (Dec 2021, $8M) had a related accounting trust bug.

```solidity
function totalAssets() public view returns (uint) {
    return asset.balanceOf(address(this)); // BUG: untracked donations
}
```

**Native detection signal:**
LLM-reasoning required.

**PoC validation strategy:**
fork-execution-state-asserted. Donate directly, observe accounting drift, exploit the consumer.

**False positive shapes:**
1. Internal accounting variable `_internalBalance` updated on every entry/exit; balanceOf used only for sanity.
2. Donations explicitly accepted with a `donate()` function.

**Look-alikes:**
ARITH-PRECISION-LOSS-009 (specific instance with first-deposit attack).

**Remediation patterns:**
Maintain explicit `_totalAssets` storage; do not derive from `balanceOf`. Skim/sweep donations to a treasury.

**Heuristic seeds:**
- Function returns `IERC20(asset).balanceOf(address(this))` and is consumed by share math.
- No `_internalBalance` / `totalAssets` storage variable.

---

### CROSS-MISSING-RETURN-CHECK-026

**Category:** Cross-contract / composition
**SWC mapping:** SWC-104
**VM scope:** EVM

**Definition:**
External call's success bool is ignored; or a non-standard ERC-20 (USDT) returns no bool but the contract tries to decode one, causing silent failures or revert mismatches. Includes ignoring `IERC20.transfer` return value (some tokens return `false` on insufficient balance).

**Canonical example:**
Many older protocols vs USDT/BNB. Documented widely. Pattern still appears in 2024 audits.

```solidity
token.transfer(user, amount); // BUG: ignored return; token may have returned false
```

**Native detection signal:**
Slither: `unchecked-transfer`, `unused-return`. Pattern-style.

**PoC validation strategy:**
fork-execution-state-asserted with mocked non-standard token.

**False positive shapes:**
1. Use of OZ `SafeERC20.safeTransfer`.
2. Token is a known well-behaved token; even so, defensive coding is preferred.

**Look-alikes:**
None — clean pattern.

**Remediation patterns:**
OZ `SafeERC20`. Solmate `SafeTransferLib`.

**Heuristic seeds:**
- `IERC20.transfer` / `transferFrom` / `approve` invoked without return-value check.

---

### CROSS-CALLBACK-TRUST-027

**Category:** Cross-contract / composition
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
Flash-loan or AMM callback (`uniswapV3SwapCallback`, `IERC3156FlashBorrower.onFlashLoan`) doesn't verify the caller is the expected pool/lender, so anyone can invoke the callback directly with attacker-controlled parameters and cause the contract to act as if a legitimate flash-loan/swap is in progress.

**Canonical example:**
Generic — noted in Uniswap v3 integration guides. Multiple smaller hacks: Punk Protocol (Aug 2021, $3M), Zeed Finance (May 2022).

```solidity
function uniswapV3SwapCallback(int256 a0, int256 a1, bytes calldata data) external {
    // BUG: no msg.sender check ⇒ any caller can simulate a swap
    IERC20(token).transferFrom(payer, msg.sender, amount);
}
```

**Native detection signal:**
LLM-reasoning required. Slither: no first-class detector.

**PoC validation strategy:**
fork-execution-state-asserted. Attacker calls callback directly with crafted args; assert state mutation.

**False positive shapes:**
1. Callback verifies `msg.sender == expectedPool`.
2. Callback verifies `keccak256(callbackData)` matches a hash registered by the prior call.

**Look-alikes:**
REENT-CROSS-FUNCTION-008.

**Remediation patterns:**
Check `msg.sender` against expected pool, computed via `PoolAddress.computeAddress` (Uniswap v3 pattern).

**Heuristic seeds:**
- Function name matches `/Callback$/` and has no `msg.sender` check.
- Callback path moves user funds.

---

## 9. Bridge / cross-chain

### BRIDGE-MERKLE-ROOT-FORGERY-028

**Category:** Bridge / cross-chain
**SWC mapping:** N/A
**VM scope:** EVM, universal

**Definition:**
Bridge accepts a Merkle proof for a withdrawal/mint without verifying the root was committed by a trusted source — or accepts proofs against a root that was set with insufficient signature verification. Effectively forges deposits on the destination chain.

**Canonical example:**
Wormhole bridge (Feb 2022, $326M) — `verify_signatures` accepted an attacker-supplied account that bypassed signature checks (Solana side); the message was then accepted as legitimate on the EVM side. Post-mortem: https://wormholecrypto.medium.com/wormhole-incident-report-02-02-22-ad9b8f21eec6.

```rust
// Solana program (sketched): forged signature_set bypassed verify path
pub fn post_vaa(ctx: Context<PostVAA>, ...) -> Result<()> {
    // BUG: signature_set account not verified to be produced by signature_verify
    require_keys_eq!(ctx.accounts.signature_set.guardian_set, ...)?;
}
```

**Native detection signal:**
LLM-reasoning required. Anchor account-constraint linters partial.

**PoC validation strategy:**
multi-fork-coordinated. Forge a message on chain A; submit proof on chain B; assert mint.

**False positive shapes:**
1. Light-client / zk-proof verification covers the entire signature set.
2. Off-chain attestation pinned via threshold-multisig with on-chain signature recovery.

**Look-alikes:**
SOLANA-MISSING-SIGNER-038 (signer bypass on Solana side directly).

**Remediation patterns:**
Threshold signature with on-chain recovery for every guardian. Anchor `Signer` / `has_one` constraints. Light-client verification where feasible.

**Heuristic seeds:**
- Cross-chain message verifier doesn't iterate all required signers.
- `signature_set` / `guardian_set` accounts not pinned to a verified signer-recovery program.

---

### BRIDGE-REPLAY-PROTECTION-MISSING-029

**Category:** Bridge / cross-chain
**SWC mapping:** N/A
**VM scope:** EVM, universal

**Definition:**
Bridge's destination-chain contract does not track a nonce / message-id of already-processed messages, allowing the same valid attestation to be replayed for repeated mints/withdrawals.

**Canonical example:**
Qubit Bridge (Jan 2022, $80M) — a deposit-without-actual-deposit flaw rooted in a missing check, with replay-adjacent characteristics. Nomad Bridge (Aug 2022, $190M) — initial root committed as zero, allowing every message to be "valid" without proper proof.

**Native detection signal:**
LLM-reasoning required.

**PoC validation strategy:**
multi-fork-coordinated. Submit one valid message twice; assert two mints.

**False positive shapes:**
1. Mapping `processed[messageHash] = true` and revert on duplicate.
2. Sequential nonce that monotonically increases.

**Look-alikes:**
BRIDGE-MERKLE-FORGERY-028 (different root cause); SIG-REPLAY-039.

**Remediation patterns:**
Persist `processed[messageId]`. Use chain-id + nonce in domain separator.

**Heuristic seeds:**
- Bridge handler accepts `messageId` and does not check or write a `processed` mapping.
- No domain separator including `chainId`.

---

### BRIDGE-ASYMMETRIC-DECIMALS-030

**Category:** Bridge / cross-chain
**SWC mapping:** N/A
**VM scope:** EVM, universal

**Definition:**
Token decimals differ across chains (USDC has 6 on Ethereum/Arbitrum, but a fork chain sometimes uses 18); bridge's mint logic doesn't scale, so user deposits 1 USDC and receives 10^12 USDC on the destination.

**Canonical example:**
Multichain (formerly Anyswap) had a related class of issues across forks with non-uniform token decimals. Documented in many bridge audits.

**Native detection signal:**
LLM-reasoning required.

**PoC validation strategy:**
multi-fork-coordinated.

**False positive shapes:**
1. Bridge fetches `decimals()` on each side and scales.
2. Hard mapping of `(chainId, asset) → decimals` in bridge config.

**Look-alikes:**
ARITH-CAST-NARROWING-012.

**Remediation patterns:**
Decimal-scaling table per (chain, asset). Reject if mismatch unexpected.

**Heuristic seeds:**
- Bridge mint takes `amount` raw with no decimal-scaling step.

---

## 10. MEV / front-running / sandwich

### MEV-SANDWICH-NO-SLIPPAGE-031

**Category:** MEV / front-running / sandwich
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
User-facing swap function does not enforce a `minAmountOut` / deadline, or accepts ones derived on-chain from current pool state — searcher front-runs with a buy, victim swap executes at degraded rate, searcher sells.

**Canonical example:**
Generic searcher activity, not a single named hack. Documented in Flashbots research, e.g., https://writings.flashbots.net/order-flow-auctions-and-front-running.

```solidity
function swap(uint amountIn) external { // BUG: no minAmountOut, no deadline
    pool.swap(amountIn, 0, block.timestamp + 3600, msg.sender);
}
```

**Native detection signal:**
Slither: `incorrect-equality`, but no first-class detector. LLM-reasoning.

**PoC validation strategy:**
mempool-replay. Sim attacker tx ahead, victim tx, attacker tx after.

**False positive shapes:**
1. Function takes `minAmountOut` and `deadline` from caller.
2. Swap executed via private mempool / Flashbots Protect.

**Look-alikes:**
ORACLE-SPOT-014.

**Remediation patterns:**
Always require user-supplied `minAmountOut` and `deadline`. Recommend private RPC.

**Heuristic seeds:**
- Function calls a swap router but accepts no `min*Out` or `deadline`.

---

### MEV-PERMIT-FRONTRUN-032

**Category:** MEV / front-running / sandwich
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
User submits an off-chain `permit` signature; attacker observes mempool, front-runs the user's combined `permit + action` tx with just the `permit` part, gas-griefing the user (their tx reverts because the nonce already advanced) or causing UX issues. Also: third party can submit only the `permit`, leaving the user with an unwanted approval.

**Canonical example:**
Documented in EIP-2612 discussions; appeared in audit findings of multiple stablecoins. Permit2 (Uniswap) added mitigations.

**Native detection signal:**
LLM-reasoning.

**PoC validation strategy:**
mempool-replay.

**False positive shapes:**
1. Code wraps `permit` in `try/catch` and proceeds even if it reverts (recommended pattern).
2. Use of Permit2 with allowance + signature transfer.

**Look-alikes:**
SIG-REPLAY-039 (replay variant of same primitive).

**Remediation patterns:**
`try permit() catch {}` pattern. Migrate to Permit2.

**Heuristic seeds:**
- Function calls `IERC20Permit.permit` directly without try/catch wrapper.

---

## 11. Signature / cryptography misuse

### SIG-MALLEABILITY-ECDSA-033

**Category:** Signature / cryptography misuse
**SWC mapping:** SWC-117
**VM scope:** EVM

**Definition:**
ECDSA signatures are inherently malleable: for any valid `(r, s, v)`, `(r, -s mod n, v')` is also valid. Hashing the raw signature (rather than the signed payload) and using that hash as a uniqueness key allows a replay with the malleated form.

**Canonical example:**
Documented in EIP-2098 / OZ ECDSA library evolution. Not a single named hack but appears as findings repeatedly.

```solidity
bytes32 sigHash = keccak256(abi.encodePacked(r, s, v));
require(!used[sigHash]); used[sigHash] = true; // BUG: malleable
```

**Native detection signal:**
Slither: `weak-prng` adjacent. Use of low-level `ecrecover` directly is a code smell.

**PoC validation strategy:**
compile-only. Generate the malleated form and submit.

**False positive shapes:**
1. Use of OZ `ECDSA.recover` (post-4.7 enforces low-s).
2. Uniqueness key is hash of payload, not signature.

**Look-alikes:**
SIG-REPLAY-039 (related family).

**Remediation patterns:**
OZ `ECDSA` library with low-s enforcement. Hash payload, not signature, for uniqueness keys.

**Heuristic seeds:**
- Direct `ecrecover` usage without low-s check.
- `keccak256(abi.encodePacked(r, s, v))` used as nonce key.

---

### SIG-EIP712-DOMAIN-CONFUSION-034

**Category:** Signature / cryptography misuse
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
EIP-712 domain separator omits or hardcodes `chainId`, allowing signatures to be replayed across chains (e.g., Ethereum mainnet → BSC fork → Arbitrum), or domain separator computed at construction (not recomputed when chain forks).

**Canonical example:**
Multiple post-Merge EIP-712 audits flagged forks (PoW Ethereum chain after merge). General class — see https://eips.ethereum.org/EIPS/eip-712 commentary.

**Native detection signal:**
LLM-reasoning.

**PoC validation strategy:**
multi-fork-coordinated.

**False positive shapes:**
1. Domain separator recomputed each call when `block.chainid` changes.
2. OZ `EIP712Upgradeable._domainSeparatorV4()` used.

**Look-alikes:**
BRIDGE-REPLAY-029.

**Remediation patterns:**
OZ `EIP712`. Recompute on chainid change. Always include `chainId` and `verifyingContract`.

**Heuristic seeds:**
- Domain separator constant (cached) and chain-fork not handled.
- Missing `chainId` in `EIP712Domain` struct.

---

### SIG-REPLAY-CROSS-FUNCTION-035

**Category:** Signature / cryptography misuse
**SWC mapping:** N/A
**VM scope:** EVM, universal

**Definition:**
Two functions share signature-verification logic on the same payload format; a signature meant for function A is replayable on function B because the payload-digest doesn't include a function-domain tag.

**Canonical example:**
Numerous L2 / Optimism Bridge findings (early). General class.

**Native detection signal:**
LLM-reasoning.

**PoC validation strategy:**
fork-execution-state-asserted.

**False positive shapes:**
1. Each signed payload includes a unique `bytes32 typeHash`.
2. Functions use disjoint nonce spaces.

**Look-alikes:**
SIG-MALLEABILITY-033.

**Remediation patterns:**
EIP-712 typed-data signing per function. Include unique `bytes4 selector` or `bytes32 typeHash`.

**Heuristic seeds:**
- Multiple `verifySignature(payload, sig)` paths sharing one verifier without function-tag.

---

## 12. Token-standard misuse (ERC-20/721/1155/4626)

### TOKEN-FEE-ON-TRANSFER-036

**Category:** Token-standard misuse
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
Contract assumes `transferFrom(user, self, X)` increases its balance by exactly `X`. Some tokens (SafeMoon, deflationary tokens, some rebasing) take a fee, so the actual delta is < X. Downstream accounting is silently wrong.

**Canonical example:**
Inverse Finance had related issues; Visor Finance (Dec 2021); generally common.

```solidity
asset.transferFrom(user, address(this), amount);
shares = amount * totalSupply / totalAssets(); // BUG: amount overstated
```

**Native detection signal:**
LLM-reasoning. Echidna invariant: pre/post balance delta equals input amount.

**PoC validation strategy:**
fork-execution-state-asserted with mocked fee-on-transfer token.

**False positive shapes:**
1. Allowlisted asset set with no fee-on-transfer tokens.
2. Code measures `balanceOf(self)` before/after and uses delta.

**Look-alikes:**
CROSS-DONATION-INFLATION-025.

**Remediation patterns:**
Always measure delta. Deny non-standard tokens via allowlist.

**Heuristic seeds:**
- `transferFrom(...)` followed by use of input `amount` for share math without delta measurement.

---

### TOKEN-ERC721-RECIPIENT-CALLBACK-037

**Category:** Token-standard misuse
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
ERC-721 `safeTransferFrom` invokes `onERC721Received` on the recipient. If the recipient is a contract that the protocol then re-enters or queries, state can be inconsistent. Adjacent to REENT-007 but specific to NFT mint paths.

**Canonical example:**
HypeBears / multiple NFT mint hacks. Mooncats / Loot — pattern documented.

**Native detection signal:**
Slither: reentrancy detectors partial.

**PoC validation strategy:**
fork-execution-state-asserted.

**False positive shapes:**
1. `nonReentrant` on the path that invokes safeTransferFrom.
2. Caller bypasses with `transferFrom` (non-safe), but that has its own UX problems.

**Look-alikes:**
REENT-CROSS-FUNCTION-008.

**Remediation patterns:**
`nonReentrant` on mint paths. Update state before `_safeMint`.

**Heuristic seeds:**
- `_safeMint` followed by state change.

---

### TOKEN-ERC1155-BATCH-OVERFLOW-038

**Category:** Token-standard misuse
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
ERC-1155 batch operations iterate over arrays of (id, amount); mismatched array lengths or unchecked accumulator can underflow when one id appears multiple times in the same batch.

**Canonical example:**
General audit class. Documented in OZ ERC-1155 implementation evolution.

**Native detection signal:**
Slither: `unused-return` partial.

**PoC validation strategy:**
fork-execution-state-asserted.

**False positive shapes:**
1. OZ canonical implementation used.
2. Lengths verified equal.

**Look-alikes:**
ARITH-OVERFLOW-011.

**Remediation patterns:**
OZ ERC-1155.

**Heuristic seeds:**
- Hand-rolled `_safeBatchTransferFrom` not from OZ.

---

### TOKEN-ERC4626-DONATION-039

**Category:** Token-standard misuse
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
ERC-4626 vault uses `asset.balanceOf(this)` for `totalAssets()`; donating assets directly inflates the share-price. Equivalent to entries 009 and 025 — included as a token-standard-specific entry because auditors should detect at the standard's surface.

**Canonical example:**
ERC-4626 inflation attack (entry 009).

**Native detection signal:**
LLM-reasoning.

**PoC validation strategy:**
fork-execution-state-asserted.

**False positive shapes:**
1. Virtual-offset `_decimalsOffset > 0`.
2. Internal `_totalAssets` storage variable.

**Look-alikes:**
ARITH-PRECISION-LOSS-009; CROSS-DONATION-INFLATION-025.

**Remediation patterns:**
OZ 4.8+ ERC-4626 with virtual offset; or seed dead shares.

**Heuristic seeds:**
- ERC-4626 implementation derives `totalAssets` from `balanceOf`.

---

## 13. DoS / griefing

### DOS-UNBOUNDED-LOOP-040

**Category:** DoS / griefing
**SWC mapping:** SWC-128
**VM scope:** EVM, universal

**Definition:**
Function iterates over user-controlled or unbounded array; gas grows linearly until the function exceeds block gas limit and becomes uncallable, locking funds or admin paths.

**Canonical example:**
GovernMental (2016, 1100 ETH locked) — distribution loop hit gas limit.

```solidity
function withdrawAll() external {
    for (uint i = 0; i < users.length; i++) { // BUG: unbounded
        payable(users[i]).transfer(owed[users[i]]);
    }
}
```

**Native detection signal:**
Slither: `costly-loop`. Mythril: `LoopGasLimit`.

**PoC validation strategy:**
fork-execution-no-revert (or revert-with-OOG).

**False positive shapes:**
1. Loop bound is constant <= 100.
2. Pull-payment pattern (each user withdraws own).

**Look-alikes:**
DOS-EXTERNAL-CALL-REVERT-041.

**Remediation patterns:**
Pull-payment. Pagination with `from/to` cursors.

**Heuristic seeds:**
- Loop `for (i; i < array.length; ...)` over a non-constant array in an external function.

---

### DOS-EXTERNAL-CALL-REVERT-041

**Category:** DoS / griefing
**SWC mapping:** SWC-113
**VM scope:** EVM

**Definition:**
Loop or function reverts entirely when one external call reverts (recipient has no `receive()`, or transfer to a contract that always reverts), DoSing the whole batch / queue.

**Canonical example:**
King of the Ether (2016) — auction's `transfer` to previous king's contract reverted, blocking new bids.

**Native detection signal:**
Slither: `calls-loop`. Pattern.

**PoC validation strategy:**
fork-execution-state-asserted.

**False positive shapes:**
1. Use of low-level `call` with bool tolerance.
2. Pull-payment.

**Look-alikes:**
DOS-UNBOUNDED-040.

**Remediation patterns:**
Pull-payment. Tolerate failures with try/catch and log-and-continue.

**Heuristic seeds:**
- `transfer`/`send`/`call` inside a loop over user list with no failure handling.

---

### DOS-BLOCK-GAS-GRIEF-042

**Category:** DoS / griefing
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
Attacker-controlled array growth (via cheap permissionless add) makes a critical function exceed block gas limit. Different from 040 in that the array growth is adversarial.

**Canonical example:**
Ethermint validator slashing list edge cases. Generic class.

**Native detection signal:**
LLM-reasoning.

**PoC validation strategy:**
fork-execution-no-revert with adversarial growth setup.

**False positive shapes:**
1. Add path is permissioned.
2. Bounded by per-block cap.

**Look-alikes:**
DOS-UNBOUNDED-040.

**Remediation patterns:**
Cap array size. Charge per-add fee.

**Heuristic seeds:**
- Permissionless `addEntry` path; later iteration over those entries.

---

## 14. Storage layout / slot collision

### STORAGE-PACKED-MISALIGN-043

**Category:** Storage layout / slot collision
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
Solidity packs adjacent storage variables into a single slot when they fit. A change to types or order silently shifts packing, breaking proxy upgrades or cross-version deserialization. Adjacent to PROXY-STORAGE-022 but applies to non-proxy library boundary too.

**Canonical example:**
Nomad bridge re-init pattern (Aug 2022, $190M) had a related class (zero-hash trusted root). Many smaller bugs.

**Native detection signal:**
OZ Upgrades plugin. Slither: `slither --print storage-layout`.

**PoC validation strategy:**
compile-only diff between versions.

**False positive shapes:**
1. Layout snapshot in repo committed and CI-checked.
2. New variables only appended.

**Look-alikes:**
PROXY-STORAGE-022.

**Remediation patterns:**
Layout snapshot in CI. `__gap` reservations.

**Heuristic seeds:**
- Repo lacks committed `storage-layout.json`.
- New version inserts variable mid-list.

---

### STORAGE-MAPPING-COLLISION-044

**Category:** Storage layout / slot collision
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
Two distinct mappings can collide if their slots are computed from user-controlled keys without proper namespacing — extremely rare for standard Solidity but possible in hand-coded assembly storage layouts.

**Canonical example:**
Generic class. Specific exploits rare; appears in low-level Yul code.

**Native detection signal:**
Slither: limited. Manual review.

**PoC validation strategy:**
compile-only.

**False positive shapes:**
1. Standard Solidity mapping types only.
2. Each mapping has distinct base slot.

**Look-alikes:**
STORAGE-PACKED-043.

**Remediation patterns:**
Avoid raw `sstore`/`sload`. Use Solidity mappings.

**Heuristic seeds:**
- `sstore` / `sload` in inline assembly with attacker-influenced slot.

---

## 15. Solana-specific

### SOLANA-MISSING-SIGNER-045

**Category:** Solana-specific
**SWC mapping:** N/A
**VM scope:** SVM

**Definition:**
Solana program does not assert that an account passed as a "signer" actually has `is_signer = true`. Anchor's `Signer<'info>` enforces this at deserialization; native programs without Anchor must check `account.is_signer` manually. Without it, anyone can pass in any pubkey and it's accepted as the authority.

**Canonical example:**
Wormhole (Feb 2022, $326M) — at root, the Solana side accepted a `signature_set` produced by a path that did not properly verify signers; a forged "verified" set was accepted because the verification step's signer check was weak. Post-mortem above.

```rust
// BUG: native program (no Anchor) doesn't check is_signer
pub fn process(accounts: &[AccountInfo]) -> ProgramResult {
    let authority = next_account_info(...)?;
    // missing: if !authority.is_signer { return Err(...); }
    update_state(authority.key);
    Ok(())
}
```

**Native detection signal:**
Anchor lints; manual review for native programs. `solana-lints` (Sealevel Attacks) has dedicated checks.

**PoC validation strategy:**
fork-execution-state-asserted (using Solana localnet / Bankrun). Submit instruction with non-signer pretending to be authority; assert state changed.

**False positive shapes:**
1. Anchor `Signer<'info>` constraint present.
2. Manual `if !account.is_signer { return Err... }` check.

**Look-alikes:**
SOLANA-PDA-MISSING-046; BRIDGE-MERKLE-FORGERY-028.

**Remediation patterns:**
Anchor `Signer<'info>` or `has_one = authority` with `Signer` on the referenced account. Native: explicit `is_signer` check.

**Heuristic seeds:**
- Native program: `next_account_info` with subsequent use as authority but no `is_signer` check.
- Anchor `Account<'info, X>` used where `Signer<'info>` is required.

---

### SOLANA-PDA-MISSING-VERIFICATION-046

**Category:** Solana-specific
**SWC mapping:** N/A
**VM scope:** SVM

**Definition:**
Program-Derived Address account is passed by the client; program does not verify that the PDA was derived from the expected seeds + program id. Attacker passes any account they own (or a different-program-owned account that happens to have the right size) as the "PDA".

**Canonical example:**
Cashio (Mar 2022, $50M) — accepted a fake `MintInfo` PDA that wasn't actually derived from Cashio's collateral mint; minted unbacked CASHIO. Post-mortem: https://medium.com/@cashio/cashio-incident-26b10a55b970.

```rust
// BUG: vault account passed in but not seed-checked against program id
pub fn redeem(ctx: Context<Redeem>, ...) -> Result<()> {
    let vault = &ctx.accounts.vault; // not constrained by seeds
    transfer(vault, user, amount);
}
```

**Native detection signal:**
Anchor: `seeds = [...]` constraint present? `solana-lints` / Sealevel Attacks: `account-not-validated`.

**PoC validation strategy:**
fork-execution-state-asserted on localnet. Submit a malicious account at the position; assert acceptance.

**False positive shapes:**
1. Anchor `seeds = [...] , bump = vault.bump` present.
2. Native: `Pubkey::create_program_address(...)` verification.

**Look-alikes:**
SOLANA-MISSING-OWNER-047; SOLANA-TYPE-COSPLAY-049.

**Remediation patterns:**
Anchor seeds-based account constraints. Native: explicit `create_program_address` check.

**Heuristic seeds:**
- Anchor `Account<'info, X>` without `seeds = [...]`.
- Native deserialization of an account whose pubkey isn't derived in-handler.

---

### SOLANA-MISSING-OWNER-CHECK-047

**Category:** Solana-specific
**SWC mapping:** N/A
**VM scope:** SVM

**Definition:**
Solana account's `owner` field is the program that owns the account's data. If the program doesn't verify the account is owned by *its own* program id (or the expected SPL token program for token accounts), an attacker can pass an account whose layout matches but is owned by a malicious program — feeding controlled data.

**Canonical example:**
Multiple Sealevel Attacks examples; documented in Coral-xyz/sealevel-attacks repo: https://github.com/coral-xyz/sealevel-attacks. Mango Markets (Oct 2022, $114M) had an oracle-side root, but several smaller hacks of this exact class.

```rust
// BUG: account is read but owner not checked
let token_account = SplTokenAccount::unpack(&account.data.borrow())?;
// Should: if account.owner != &spl_token::id() { return Err... }
```

**Native detection signal:**
Anchor `Account<'info, X>` enforces deserialization owner check. Native code: easily missed.

**PoC validation strategy:**
fork-execution-state-asserted.

**False positive shapes:**
1. Anchor account types (auto-checked).
2. Explicit `assert!(account.owner == &expected_program_id)`.

**Look-alikes:**
SOLANA-PDA-046, SOLANA-TYPE-COSPLAY-049.

**Remediation patterns:**
Anchor types. Or `assert_owner` helper.

**Heuristic seeds:**
- `Account::unpack` / manual deserialization with no `owner` check above it.

---

### SOLANA-ARBITRARY-CPI-048

**Category:** Solana-specific
**SWC mapping:** N/A
**VM scope:** SVM

**Definition:**
Program performs a CPI (cross-program invocation) using a target program id passed in by the caller. Attacker substitutes a malicious program that mimics the SPL token interface but logs/steals state.

**Canonical example:**
Sealevel Attacks "arbitrary CPI" example. Several DeFi-on-Solana hacks have used this pattern.

```rust
// BUG: token_program is whatever the client supplies
solana_program::program::invoke(
    &spl_token::instruction::transfer(token_program.key, ...)?,
    &[token_program.clone(), ...],
)?;
```

**Native detection signal:**
Anchor: `Program<'info, Token>` enforces the program id. Manual in native.

**PoC validation strategy:**
fork-execution-state-asserted. Pass attacker program; assert call routes to attacker.

**False positive shapes:**
1. Anchor typed `Program<'info, Token>`.
2. Explicit pubkey check before CPI.

**Look-alikes:**
SOLANA-MISSING-OWNER-047.

**Remediation patterns:**
Anchor `Program<'info, ...>`. Or explicit `if token_program.key != &spl_token::id() { return Err... }`.

**Heuristic seeds:**
- `invoke`/`invoke_signed` with `token_program` accepted from instruction context, no key check.

---

### SOLANA-TYPE-COSPLAY-049

**Category:** Solana-specific
**SWC mapping:** N/A
**VM scope:** SVM

**Definition:**
Two account types from the same program have similar/identical byte layouts; without a discriminator (Anchor adds 8-byte discriminator automatically; native code often does not), an attacker passes account X where the program expects Y. Type-confusion bug at the data layer.

**Canonical example:**
Documented in Anchor's design rationale and Sealevel Attacks. Several smaller exploits.

```rust
// BUG: native program treats raw bytes as Vault but caller passed UserState
let vault = Vault::try_from_slice(&account.data.borrow())?;
```

**Native detection signal:**
Anchor `#[account]` adds discriminator automatically. Native: manual.

**PoC validation strategy:**
fork-execution-state-asserted.

**False positive shapes:**
1. Anchor account types.
2. Explicit discriminator at a known offset.

**Look-alikes:**
SOLANA-MISSING-OWNER-047; SOLANA-PDA-046.

**Remediation patterns:**
Anchor `#[account]`. Or 8-byte discriminator.

**Heuristic seeds:**
- Native deserialization with no discriminator and program has multiple account types of similar size.

---

### SOLANA-SYSVAR-SPOOFING-050

**Category:** Solana-specific
**SWC mapping:** N/A
**VM scope:** SVM

**Definition:**
Program reads sysvar (e.g., `Clock`, `Rent`, `Instructions`) from an account passed by the caller, but does not verify the account is the actual canonical sysvar pubkey. Attacker substitutes a fake sysvar account with crafted data.

**Canonical example:**
Sealevel Attacks "sysvar account checks" example. Has appeared in low-level Solana DeFi audits.

```rust
// BUG: Clock account is deserialized but not verified
let clock = Clock::from_account_info(clock_account)?; // not checked against Clock::id()
```

**Native detection signal:**
Anchor `Sysvar<'info, Clock>` enforces. Native: manual.

**PoC validation strategy:**
fork-execution-state-asserted.

**False positive shapes:**
1. Anchor `Sysvar<'info, T>` constraint.
2. Use of `Clock::get()` syscall (no account passed).

**Look-alikes:**
SOLANA-MISSING-OWNER-047.

**Remediation patterns:**
Use `Clock::get()` syscall. Or pin the account address.

**Heuristic seeds:**
- `from_account_info` on a Clock/Rent account from instruction context with no `assert_eq!(account.key, &sysvar::clock::id())`.

---

### SOLANA-CLOSE-AUTHORITY-051

**Category:** Solana-specific
**SWC mapping:** N/A
**VM scope:** SVM

**Definition:**
Account-close instruction transfers lamports out and zeroes data, but if the program later treats a "closed" account as if it were live (without re-checking), or if the close path doesn't zero discriminator, a re-init attack is possible.

**Canonical example:**
Sealevel Attacks "closing accounts" + "reinit" examples. Exploit-style bug appeared in early Solana DeFi.

**Native detection signal:**
LLM-reasoning + Anchor `close = receiver` constraint usage.

**PoC validation strategy:**
fork-execution-state-asserted.

**False positive shapes:**
1. Anchor `close = receiver` (auto-zeroes discriminator).
2. Manual `account.data = [0; N]` on close.

**Look-alikes:**
SOLANA-TYPE-COSPLAY-049 (related — closed account looks like a different live account).

**Remediation patterns:**
Anchor `close`. Manually zero discriminator and transfer all lamports.

**Heuristic seeds:**
- Manual close path that doesn't zero data.
- Re-init path that doesn't check account is empty.

---

## 16. Move-specific

### MOVE-RESOURCE-LEAK-052

**Category:** Move-specific
**SWC mapping:** N/A
**VM scope:** Move (Sui/Aptos)

**Definition:**
Move resources have linear-type semantics — every value must be moved, stored, or destroyed. A resource accidentally created and not properly stored or destroyed can deadlock a transaction (compile-time error in pure code) or, in dynamic-fields scenarios on Sui, get orphaned in shared object fields and lock value.

**Canonical example:**
Adjacent to Move audit findings on Sui/Aptos. Sui's dynamic-fields documentation: https://docs.sui.io/concepts/dynamic-fields.

```move
// On Sui: a coin removed from balance but not deposited anywhere ⇒ tx aborts
public fun bad_split(coin: &mut Coin<SUI>) {
    let _half: Coin<SUI> = coin::split(coin, 100); // never used; Move aborts
}
```

**Native detection signal:**
Move compiler enforces; the bug appears at the design boundary (resource flows through too-many handlers).

**PoC validation strategy:**
compile-only / fork-execution-no-revert (compile failure is the bug for static cases; runtime stuck-resource for dynamic).

**False positive shapes:**
1. Resource explicitly stored or transferred.
2. Resource has `drop` ability and is intentionally dropped.

**Look-alikes:**
MOVE-CAPABILITY-MISUSE-053.

**Remediation patterns:**
Track resource flow per function. Use `drop` ability sparingly. Sui: ensure dynamic fields have well-defined removal paths.

**Heuristic seeds:**
- Function returns a resource that callers don't store or pass on.
- Dynamic field added with no removal path.

---

### MOVE-CAPABILITY-MISUSE-053

**Category:** Move-specific
**SWC mapping:** N/A
**VM scope:** Move (Sui/Aptos)

**Definition:**
Capability resources (e.g., `MintCap<T>`, `AdminCap`) grant authority to mint, burn, or admin. If a `Cap` is `key + store` and stored in a publicly-readable shared object, or if it's accidentally `drop`-able, the capability can be extracted or duplicated.

**Canonical example:**
Sui Move examples. Aptos `coin` framework's MintCap design is a reference for the right pattern.

```move
// BUG: MintCap stored in a shared object owned by no one specific
struct AdminCap has key, store, copy, drop { } // copy+drop is the bug
```

**Native detection signal:**
LLM-reasoning + Move ability checker.

**PoC validation strategy:**
fork-execution-state-asserted on Sui/Aptos testnet.

**False positive shapes:**
1. `Cap` has only `key` ability (or `key, store`) and is held by an explicit owner address.
2. Capability is consumed (destroyed) on use.

**Look-alikes:**
AC-MISSING-OWNER-001 (the EVM analog).

**Remediation patterns:**
Capability resources should NOT have `copy` or `drop`. Hold in `Account<address>` storage, not shared.

**Heuristic seeds:**
- `struct *Cap has ... copy` or `... drop`.
- Cap stored in shared object.

---

### MOVE-GENERIC-TYPE-CONFUSION-054

**Category:** Move-specific
**SWC mapping:** N/A
**VM scope:** Move

**Definition:**
Generic functions parameterized by type `T` that don't constrain `T` adequately can be invoked with attacker-defined types whose `phantom` markers or witness patterns confuse downstream code into treating one currency as another.

**Canonical example:**
Aptos `coin` framework's witness pattern is the standard mitigation; the bug class is documented in Move's type-system literature.

```move
// BUG: anyone can call with their own T marker
public fun deposit<T>(c: Coin<T>) { /* trusts T's identity */ }
```

**Native detection signal:**
LLM-reasoning + Move type checker.

**PoC validation strategy:**
compile-only with attacker module.

**False positive shapes:**
1. Function uses witness pattern (`fun init(witness: T, ...)`).
2. Module-internal use of T only.

**Look-alikes:**
SOLANA-TYPE-COSPLAY-049 (different VM, similar shape).

**Remediation patterns:**
Witness pattern. `phantom T` markers with origin checks.

**Heuristic seeds:**
- Public generic function `<T>` accepting `Coin<T>` with no witness/origin check.

---

## 17. Compiler / toolchain bugs

### COMPILER-VYPER-REENTRANCY-LOCK-055

**Category:** Compiler / toolchain bugs
**SWC mapping:** N/A
**VM scope:** EVM (Vyper)

**Definition:**
Vyper compiler versions 0.2.15, 0.2.16, and 0.3.0 had a malformed reentrancy-lock implementation: the `@nonreentrant` decorator's storage slot computation collided across functions sharing a key, so a function "protected" by `@nonreentrant("lock")` could be reentered via another function with the same key. This is a *compiler* bug, not a user-code bug.

**Canonical example:**
Curve Finance / Vyper exploit (July 2023, ~$73M across multiple Curve pools — alETH/msETH/pETH/CRV-ETH). Post-mortem: https://blog.curvemonitor.com/posts/vyper-exploit/. Affected pools were compiled with Vyper 0.2.15/16/0.3.0.

```python
# Vyper 0.2.15 — both functions claim same lock; storage slot collides
@external
@nonreentrant("lock")
def add_liquidity(...): ...

@external
@nonreentrant("lock")  # Vyper bug: not actually mutually-exclusive
def remove_liquidity(...): ...
```

**Native detection signal:**
Pragma-based detector. Slither: detector for vulnerable Vyper versions has been published. Trail of Bits Crytic-compile flags vulnerable pragmas.

**PoC validation strategy:**
fork-execution-state-asserted on a fork of mainnet at the affected block. Replay or simulate the exploit transaction.

**False positive shapes:**
1. Vyper version is patched (≥ 0.3.1 with the lock fix).
2. Code uses no `@nonreentrant` decorator (because there is no concurrent state to protect).

**Look-alikes:**
REENT-CLASSIC-006 — but root cause is the compiler, not the user.

**Remediation patterns:**
Upgrade Vyper. Migrate to known-good versions (≥ 0.3.7+). Verify against publicly tracked version list.

**Heuristic seeds:**
- Vyper pragma in `[0.2.15, 0.2.16, 0.3.0]`.
- Multiple `@nonreentrant` functions sharing the same key string.

---

### COMPILER-SOLC-BUGS-056

**Category:** Compiler / toolchain bugs
**SWC mapping:** N/A
**VM scope:** EVM

**Definition:**
Specific solc versions have known correctness bugs (e.g., `abicoder v2` storage-array bugs in 0.5.x; `IR pipeline` bugs in 0.8.13 yielding miscompiled overflow checks; signed-integer comparison bugs in early 0.6.x). Auditors must check pragma against the published bug list.

**Canonical example:**
Solidity team maintains the bug list at https://github.com/ethereum/solidity/blob/develop/docs/bugs.json. Notable: 0.5.0–0.5.16 abi.encodePacked tail issues; 0.8.13–0.8.14 yul-optimizer storage write removal; 0.8.15 has the `inlineAssembly` bug.

**Native detection signal:**
`crytic-compile` / `solc --check` against bugs.json. Slither prints version warnings.

**PoC validation strategy:**
compile-only with old-version replication.

**False positive shapes:**
1. Pragma is on the safe list (recent + tracked).
2. Code paths don't trigger the affected feature.

**Look-alikes:**
COMPILER-VYPER-055.

**Remediation patterns:**
Upgrade solc. CI gate against `bugs.json`.

**Heuristic seeds:**
- Pragma intersects with the published bug list.

---

## 18. Frontend / off-chain compromise

### FRONTEND-DEPENDENCY-INJECTION-057

**Category:** Frontend / off-chain compromise
**SWC mapping:** N/A
**VM scope:** universal (off-chain)

**Definition:**
Build-time supply-chain attack: a JS/TS dependency is compromised (npm typosquat, hijacked maintainer, post-install script) and the build pipeline pulls malicious code that swaps recipient addresses in dApp transactions before signing.

**Canonical example:**
Ledger Connect Kit (Dec 2023, ~$600K). A malicious version of `@ledgerhq/connect-kit-loader` was published after a former employee's NPM token was compromised; injected wallet-drainer JS into every dApp that loaded the kit. Post-mortem: https://www.ledger.com/blog/a-letter-from-ledger-chairman-ceo-pascal-gauthier-regarding-ledger-connect-kit.

```javascript
// Malicious patch in the loaded package
window.ethereum.request = new Proxy(window.ethereum.request, {
    apply(target, _, [args]) {
        if (args.method === 'eth_sendTransaction') args.params[0].to = ATTACKER;
        return Reflect.apply(target, _, [args]);
    }
});
```

**Native detection signal:**
Off-chain. SBOM checks. Sigstore. `npm audit signatures`.

**PoC validation strategy:**
fork-execution-state-asserted (browser-side replay of the malicious bundle against a mainnet fork).

**False positive shapes:**
1. Dependencies pinned by integrity hash (`package-lock.json` integrity checks enforced).
2. Subresource integrity (SRI) on CDN-loaded scripts.

**Look-alikes:**
FRONTEND-XSS-058.

**Remediation patterns:**
Pin by integrity hash. Sigstore-signed releases. SRI tags. Use Permit2 with full transaction simulation in-wallet (Rabby, Frame).

**Heuristic seeds:**
- CDN-loaded library without `integrity=` SRI.
- npm dependency lacks `provenance` metadata.

---

### FRONTEND-XSS-RECIPIENT-SWAP-058

**Category:** Frontend / off-chain compromise
**SWC mapping:** N/A
**VM scope:** universal (off-chain)

**Definition:**
Cross-site scripting in a dApp UI lets an attacker inject script that swaps the `to` address in a pending transaction, or modifies the EIP-712 typed-data shown to the user vs. the data actually submitted. User signs what they see; signs malicious payload.

**Canonical example:**
SushiSwap front-end smart-contract approval UI redirect (April 2023, ~$3.3M) — a permissioned function `processRoute` was exploited via approvals; while the root was on-chain, the front-end concealed the risk. More directly XSS: BadgerDAO (Dec 2021, $120M) — Cloudflare-injected JS substituted approval recipient.

**Native detection signal:**
Off-chain. CSP audit. SRI. WAF rules on input sanitization.

**PoC validation strategy:**
browser-replay + fork-execution-state-asserted (assert signed payload differs from displayed payload).

**False positive shapes:**
1. Strict CSP with no `unsafe-inline`/`unsafe-eval`.
2. Hardware wallet that displays full calldata (Ledger clear-signing).

**Look-alikes:**
FRONTEND-DEPENDENCY-057.

**Remediation patterns:**
Strict CSP. Wallet-side calldata display. Hardware wallet enforcement on high-value paths.

**Heuristic seeds:**
- CSP missing or includes `unsafe-inline`.
- No SRI on third-party JS.

---

## Bug class frequency (estimated 2022–2025 lost-$ ranking)

Drawing on Rekt News leaderboard, Chainalysis Crypto Crime Report 2023/2024, Immunefi Crypto Losses reports, and SlowMist Hacked archive — order is by aggregated USD losses across 2022–2025.

| Rank | Class (taxonomy ID) | Approx. cumulative loss | Notable incidents |
|------|---------------------|-------------------------|-------------------|
| 1 | BRIDGE-MERKLE-FORGERY-028 / BRIDGE-REPLAY-029 | >$2.5B | Ronin (Mar 2022, $625M, validator-key compromise — adjacent), Wormhole ($326M), Nomad ($190M), BNB Bridge (Oct 2022, $570M), Harmony Horizon (Jun 2022, $100M), Multichain (Jul 2023, $130M) |
| 2 | ORACLE-SPOT-014 / FLASH-LIQUIDATION-019 | >$1.0B | Mango Markets ($114M), Cream ($130M), Inverse ($15.6M), Beanstalk ($182M, governance+oracle blend), Euler ($197M) |
| 3 | AC-MISSING-OWNER-001 / AC-INITIALIZER-002 / AC-DELEGATECALL-005 | >$700M | Parity ($300M+ frozen), Audius ($6M), various smaller. Includes private-key compromise category by some accounts (Ronin, Harmony — though those are key-mgmt not contract bugs) |
| 4 | REENT-CLASSIC-006 / REENT-READ-ONLY-007 / REENT-CROSS-008 | >$300M | Curve/Vyper July 2023 ($73M, classified under compiler too), Lendf.Me ($25M), Sentiment ($1M), Fei/Rari ($80M, Apr 2022) |
| 5 | COMPILER-VYPER-055 (subset of reentrancy) | ~$73M | Curve July 2023 alone |
| 6 | SOLANA family (045–051) | >$200M | Wormhole (also bridge), Cashio ($50M), Mango (oracle root + Solana program path), Crema Finance (Jul 2022, $9M) |
| 7 | GOV-PROPOSAL-020 / GOV-EMERGENCY-021 / FLASH-GOV-018 | >$200M | Beanstalk ($182M), Tornado Gov takeover, MakerDAO (smaller incidents) |
| 8 | TOKEN-FEE-TRANSFER-036 / TOKEN-4626-DONATION-039 | $50–100M | Inverse, Visor, multiple ERC-4626 vault forks |
| 9 | FRONTEND-DEPENDENCY-057 / FRONTEND-XSS-058 | >$100M | BadgerDAO ($120M), Ledger Connect Kit ($600K — small but sets precedent) |
| 10 | ARITH family (009–013) | $100–200M | BeautyChain ($900M nominal but mostly market-cap), various precision exploits at small scale |
| 11 | PROXY family (022–024) | $50–100M | Various smaller, plus the underlying mechanism in Parity |
| 12 | CROSS family (025–027) | $50–100M | Sentiment ($1M; root in 007), Visor |
| 13 | MEV (031–032) | hard to attribute, "extracted" rather than "stolen" — estimated $500M+ in cumulative LP/swap loss across 2022–2025 |
| 14 | SIG family (033–035) | <$50M | Rare named incidents; appears as audit findings |
| 15 | DOS family (040–042) | <$50M | Mostly "stuck-funds" rather than "stolen" |
| 16 | STORAGE family (043–044) | <$50M | Subset of proxy bugs |
| 17 | MOVE family (052–054) | <$10M | Newer ecosystem; few major incidents |

Caveat: rankings shift sharply if private-key compromises (Ronin, Harmony, Atomic Wallet) are included, but those are operational failures, not contract-level bug classes.

---

## Detection difficulty mapping

For each class: **static-tool-only** = Slither/Mythril/Aderyn/Semgrep alone; **LLM-augmented** = LLM with file-level context and standard reasoning prompts.

| ID | Class | Static-tool-only | LLM-augmented |
|----|-------|-----------------|---------------|
| AC-MISSING-OWNER-001 | missing access modifier | easy | easy |
| AC-INITIALIZER-RACE-002 | uninitialized impl | medium | easy |
| AC-ROLE-CONFUSION-003 | over-privileged role | hard | medium |
| AC-TX-ORIGIN-004 | tx.origin auth | easy | easy |
| AC-DELEGATECALL-005 | controlled delegatecall | easy | easy |
| REENT-CLASSIC-006 | classic reentrancy | easy | easy |
| REENT-READ-ONLY-007 | read-only reentrancy | very-hard | hard |
| REENT-CROSS-008 | cross-function reentrancy | medium | medium |
| ARITH-PRECISION-009 | ERC-4626 inflation | hard | medium |
| ARITH-DIV-010 | divide-before-multiply | easy | easy |
| ARITH-OVERFLOW-011 | overflow / unchecked | easy (pre-0.8) / hard (post) | medium |
| ARITH-CAST-012 | narrowing cast | medium | medium |
| ARITH-FIXED-POINT-013 | rolled-your-own fp math | hard | hard |
| ORACLE-SPOT-014 | spot-price as oracle | hard | medium |
| ORACLE-STALE-015 | stale Chainlink | medium | easy |
| ORACLE-TWAP-016 | short TWAP window | hard | medium |
| ORACLE-NEGATIVE-017 | negative price cast | medium | easy |
| FLASH-GOV-018 | flash-loan governance | hard | medium |
| FLASH-LIQ-019 | flash-loan liquidation | hard | hard |
| GOV-PAYLOAD-020 | proposal payload swap | very-hard | hard |
| GOV-EMERGENCY-021 | emergency-execute bypass | hard | medium |
| PROXY-STORAGE-022 | proxy storage collision | medium (with plugin) | hard |
| PROXY-SELECTOR-023 | diamond selector clash | medium | medium |
| PROXY-SD-024 | impl selfdestruct | easy | easy |
| CROSS-DONATION-025 | balanceOf trust | hard | medium |
| CROSS-RETURN-026 | unchecked transfer | easy | easy |
| CROSS-CALLBACK-027 | callback caller trust | medium | medium |
| BRIDGE-MERKLE-028 | bridge-root forgery | very-hard | hard |
| BRIDGE-REPLAY-029 | bridge replay | hard | medium |
| BRIDGE-DECIMALS-030 | asymmetric decimals | very-hard | hard |
| MEV-SLIPPAGE-031 | missing slippage | easy | easy |
| MEV-PERMIT-032 | permit frontrun | medium | medium |
| SIG-MALLEABILITY-033 | ECDSA malleability | medium | easy |
| SIG-EIP712-034 | domain confusion | hard | medium |
| SIG-REPLAY-035 | cross-function replay | very-hard | hard |
| TOKEN-FEE-036 | fee-on-transfer | medium | easy |
| TOKEN-721-CB-037 | ERC-721 callback | medium | medium |
| TOKEN-1155-038 | batch underflow | medium | medium |
| TOKEN-4626-039 | 4626 donation | medium | easy |
| DOS-LOOP-040 | unbounded loop | easy | easy |
| DOS-REVERT-041 | external revert dos | medium | easy |
| DOS-GRIEF-042 | adversarial array growth | hard | medium |
| STORAGE-PACKED-043 | packing misalign | medium | medium |
| STORAGE-MAPPING-044 | mapping collision | very-hard | hard |
| SOLANA-SIGNER-045 | missing is_signer | easy (Anchor lints) | easy |
| SOLANA-PDA-046 | PDA verification | medium | easy |
| SOLANA-OWNER-047 | missing owner check | medium | easy |
| SOLANA-CPI-048 | arbitrary CPI | medium | easy |
| SOLANA-COSPLAY-049 | type cosplay | hard | medium |
| SOLANA-SYSVAR-050 | sysvar spoofing | medium | easy |
| SOLANA-CLOSE-051 | close authority | hard | medium |
| MOVE-LEAK-052 | resource leak | easy (compile) | easy |
| MOVE-CAP-053 | capability misuse | medium | medium |
| MOVE-GENERIC-054 | generic-T confusion | hard | medium |
| COMPILER-VYPER-055 | Vyper reentrancy | easy (pragma) | easy |
| COMPILER-SOLC-056 | solc bugs | easy (pragma) | easy |
| FRONTEND-DEP-057 | dependency injection | hard (off-chain SCA) | hard |
| FRONTEND-XSS-058 | XSS recipient swap | hard (CSP audit) | medium |

**Aggregate observation:**
- 17 classes are **easy** for static tools (mostly access-control + pattern-match bugs).
- 21 classes are **medium** — require some inter-procedural reasoning that modern Slither/Aderyn can do with good detector tuning.
- 16 classes are **hard or very-hard** for static-only detection — these are where Silica's LLM-reasoning detectors and PoC harness deliver disproportionate value.
- The "very-hard for static, hard for LLM" cluster — read-only reentrancy, bridge logic forgery, governance payload swap, mapping collision, asymmetric decimals — accounts for the largest dollar losses in the 2022–2025 window. These are the highest-leverage targets for Silica's LLM-augmented detection plus invariant fuzzing pipeline.

---

*Document version 1.0. Maintainer: Silica audit harness team. Each entry's heuristic seeds become the basis for detector rule generation; the validation-tier annotation drives PoC harness rung selection at audit time.*
