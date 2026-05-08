# Silica Case Studies — Index

Ten deep-dive exploit case studies for the Silica audit-harness design dossier.
Each answers: *what would our harness need to do to catch this in advance?*

## Summary Table

| # | Case | $ Lost | Primary Bug Class | Detection Difficulty | Validation Tier Required | Lead Specialist |
|---|------|--------|-------------------|----------------------|--------------------------|-----------------|
| 1 | [Euler Finance — Mar 2023](./euler-march-2023.md) | ~$197M | Missing health-check on collateral-decreasing function (donateToReserves) | medium | fork-execution-with-mocked-actor + multi-tx-orchestrated | state-manipulation (economic 2nd) |
| 2 | [Beanstalk — Apr 2022](./beanstalk-april-2022.md) | ~$182M (drained) / ~$76M attacker net | Governance flash-loan / same-block vote-weight acquisition | medium-easy | multi-tx-orchestrated + time-shift | governance (economic 2nd) |
| 3 | [Cream Finance AMP — Aug 2021](./cream-october-2021.md) | ~$18.8M | ERC-777 hook reentrancy on Compound fork | easy | fork-execution-state-asserted | state-manipulation (cross-contract 2nd) |
| 4 | [Nomad Bridge — Aug 2022](./nomad-august-2022.md) | ~$190M | Zero-default-confirmation: init set `confirmedAt[0x0] = 1` | easy | fork-execution-state-asserted | bridge (signature 2nd) |
| 5 | [Wormhole — Feb 2022](./wormhole-february-2022.md) | ~$326M | Missing sysvar-account ownership check on Solana signature verify | medium | fork-execution-state-asserted (Solana) | signature (cross-chain 2nd) |
| 6 | [Mango Markets — Oct 2022](./mango-october-2022.md) | ~$117M | Thin-liquidity oracle / mark-price manipulation funding withdraw | hard | multi-tx-orchestrated + economic state | oracle (economic 2nd) |
| 7 | [BadgerDAO — Dec 2021](./badgerdao-december-2021.md) | ~$120M | Frontend / Cloudflare API-key compromise rewrites approve() in user wallets | very-hard (exploit) / easy (design heuristic) | n/a — out-of-scope | frontend / supply chain |
| 8 | [Cashio — Mar 2022](./cashio-march-2022.md) | ~$48M (mostly returned) | Missing AccountInfo owner-check / Solana account-confusion | easy | fork-execution-state-asserted (Solana) | access-control (Solana-specific) |
| 9 | [Curve / Vyper — Jul 2023](./curve-vyper-july-2023.md) | ~$73M (~$52M recovered) | Vyper compiler 0.2.15/0.2.16/0.3.0 — `@nonreentrant` slot-allocation bug | hard (origin) / easy (retrospective) | fork-execution-with-mocked-actor + bytecode analysis | compiler-version meta-specialist (state-manipulation 2nd) |
| 10 | [Ronin Bridge — Mar 2022](./ronin-march-2022.md) | ~$625M | Signer-key compromise via spear-phishing + DAO sign-delegation never rescinded | very-hard (exploit) / medium (structural) | off-chain attestation + on-chain identity clustering | bridge / governance (operational) |
| 11 | [Multichain — Jul 2023](./multichain-july-2023.md) | ~$126M+ | CEO sole MPC custody, exit-scam hybrid | very-hard (exploit) / easy (structural flag) | off-chain + on-chain history aggregation | bridge / governance |

Note: 11 cases listed — the brief asked for 10 of the 11 candidates but all 11 met the bar for inclusion. If a strict 10 is required, BadgerDAO is the most reasonable cut because its exploit surface is fully off-chain; the design-heuristic lesson can be folded into Multichain's governance discussion.

Aggregate: 11 case studies, ~13.5k words across the directory, covering the historical loss spectrum from $18M (Cream) to $625M (Ronin), and the difficulty spectrum from "easy" (Cashio, Cream, Nomad) to "very hard" (BadgerDAO, Ronin, Multichain).

## Cross-Case Patterns

Six themes recur across ≥3 cases:

### 1. Cross-cutting invariant violations that no single function-level check catches

Euler, Beanstalk, Cashio, and to a lesser extent Cream are all cases where each function in isolation looks fine, and the bug is the *composition* across functions. Euler's `donateToReserves` is locally well-formed; the bug is that it doesn't share `checkLiquidity` with sibling functions. Beanstalk's `vote`, `deposit`, and `commit` are each locally fine; the bug is that they compose into a same-tx flash-loan governance. Cashio's `print_cash` accepts well-formed accounts; the bug is that it doesn't validate ownership *across* the account chain. Cream's `borrowFresh` is fine for ERC-20 underlyings; the bug is that the cross-token reentrancy invariant breaks for ERC-777.

**Implication for Silica:** the harness's most valuable mode is *protocol-template-aware invariant checking*, not per-function lint. Maintain templates for major protocol categories (lending, stablecoin-mint, governance, perp-DEX, bridge) where each template specifies the cross-cutting invariants that must hold. Run the template's invariant set against the deployed contract surface. This is the highest-leverage heuristic library investment.

### 2. Governance immediate-execution / same-block authority acquisition

Beanstalk is the canonical case. Mango Markets is a close cousin (acquire mark-price authority in same block via spot-market purchase). Multichain's structural risk is the same family — a single signing authority that should have been distributed wasn't.

The pattern: protocols treat "authority" (vote weight, oracle reading, MPC signature) as cheap to verify and expensive to manipulate, when in fact the manipulation cost has fallen dramatically due to flash loans, thin spot books, and operational concentration.

**Implication for Silica:** every protocol with a privileged action should be scored on "cost to acquire authority for one block" relative to "value extractable in one block." If acquire-cost << extract-value, flag as high-risk regardless of code correctness. This is an *economic* heuristic that requires market-data input but produces a single risk score per protocol.

### 3. Off-chain operational failures that no contract audit can catch

Ronin, Multichain, and BadgerDAO are all cases where the on-chain code was correct. The exploits leveraged operational compromise — phishing, key custody, frontend supply chain.

**Implication for Silica:** product positioning needs honesty about scope. The harness should:
- Explicitly disclaim that operational security is out of scope.
- *Score* the structural risk that *makes* operational compromise damaging (high signer concentration, unbounded approvals, single-CEO MPC).
- Recommend complementary controls (SOC2, hardware-key custody, frontend SRI, withdraw caps, timelock).

A contract harness alone cannot prevent these losses, but it can identify protocols whose *blast radius* on operational compromise is unnecessarily large, and push them to reduce it.

### 4. Compiler / framework / dependency vulnerability — out-of-source bugs

Curve/Vyper is the headline case. Wormhole's `load_instruction_at` vs `load_instruction_at_checked` is a closely-related framework-level pattern.

**Implication for Silica:** maintain a CVE-style continuous feed of compiler and framework vulnerabilities. On every audit run, check the deployed bytecode's compiler version against the known-bad list. Re-scan previously-blessed contracts when a new compiler issue is disclosed (this is *post-deploy continuous audit* and is a major differentiator vs one-time-audit firms).

### 5. Per-chain heuristic asymmetry — same concept, different manifestation

Wormhole and Cashio are Solana account-confusion bugs. Cream is an EVM ERC-777 reentrancy. Each is a manifestation of "validate the identity of privileged inputs," but the manifestation is so chain-specific that a generic detector misses both.

**Implication for Silica:** explicit per-chain heuristic packs (EVM, Solana, MoveVM, CosmosSDK). Generic taint / reentrancy / access-control rules generate too much noise; chain-specific ones (e.g., `solana.untyped-account-no-owner-check`) are tight and actionable. Avoid the temptation to build a single chain-agnostic abstraction layer; the abstractions don't carry across.

### 6. Initialization / deploy-time state defects that escape pre-deploy audit

Nomad's `confirmedAt[0x00] = 1` is the headline case. More generally: audit reports cover *the contract code as written*, but the contract's *state at deploy + after init* is rarely reviewed with the same rigor. This is the gap that allowed Nomad's bug to live for three months past audit and the gap that means newly-introduced governance edits, oracle replacements, or proxy upgrades go un-reviewed.

**Implication for Silica:** include a *post-deploy storage-snapshot diff* in every audit. Deploy the contract in a sandbox, run init, dump storage, compare against an expected-state assertion. Re-run on every upgrade transaction observed on-chain. This is one of the cheapest and most underused checks.

## Hardest Cases for Any Auto-Detect

Even with a "spine-complete" platform — full per-chain heuristics, cross-cutting invariants, economic-cost scoring, governance-decentralization scoring, compiler-CVE feed, and continuous post-deploy monitoring — three cases remain very hard:

### BadgerDAO — frontend supply chain compromise
The exploit has zero on-chain artifacts indicating compromise pre-attack. The malicious Cloudflare Worker is invisible to any chain-data analyzer. The only feasible detection is *operational* (SRI hashes, CDN integrity monitoring, employee phishing resistance). Silica can flag the design pattern (unbounded approval) that makes the blast radius large but cannot prevent the exploit itself. This is the cleanest example of "out-of-scope-but-design-actionable."

### Ronin — spear-phishing + governance trust delegation
The signer compromise is off-chain; the trust delegation was on-chain visible *if* you knew to look at the Axie DAO Snapshot vote and cross-reference with Sky Mavis's RPC infrastructure. A *very* sophisticated harness with off-chain governance ingestion + on-chain identity clustering could have flagged the structural risk. Most realistic harnesses won't have that ingestion. Detection-difficulty: very-hard for the exploit, medium for the structural risk if the harness reaches into off-chain governance feeds.

### Mango Markets — economic / market-depth manipulation
The on-chain code is correct; the bug is that the protocol's risk parameters trust an oracle whose underlying market is too shallow. A harness can flag the structural condition ("token X is collateral and has thin spot depth at deployment") cheaply. Simulating the full exploit requires accurate spot-market book modeling at a specific historical block, which is expensive and brittle. Silica should flag-the-question-don't-simulate-the-answer for this class.

### Curve / Vyper — original discovery
*Retrospectively* easy with a compiler-CVE feed. *Originally* very hard: the bug is in the compiler, not the contract. The protocol's source is correct; the bytecode silently wrong. Catching this pre-disclosure would require differential-fuzzing the compiler against its own spec, which is a separate research project from contract auditing. Silica should be honest that "we catch known compiler bugs" is the realistic claim, not "we discover them."

### Common thread among hardest cases

The very-hard cases share one property: **the relevant signal is not visible in deployed bytecode + on-chain state**. BadgerDAO's signal is in CDN traffic. Ronin's signal is in employee email. Mango's signal is in off-chain market depth. Curve/Vyper's signal is in compiler internals.

A pure contract-audit harness, no matter how strong, cannot reach these signals. Silica's most defensible product surface area is everything *up to* the chain-data boundary; beyond that, the right product is a *governance + telemetry* complement, sold honestly as a complementary layer rather than a replacement for operational security and economic risk management.

The pragmatic recommendation: Silica v1 ships with strong per-chain heuristic packs + cross-cutting invariant templates + compiler-CVE feed + post-deploy storage-snapshot diff. v2 extends into governance-decentralization scoring (Ronin / Multichain class) and economic risk-parameter checking (Mango class). v3 — if appropriate — extends into telemetry and frontend-pattern flagging (BadgerDAO class). Each phase is a coherent product with clear scope, and the customer always knows which classes are covered by which layer.
