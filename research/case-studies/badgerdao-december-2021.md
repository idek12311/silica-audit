## BadgerDAO (December 2, 2021)

**At a glance:** Ethereum mainnet. ~$120M in user funds drained via wallet-level approvals to a malicious contract. The on-chain "exploit" wasn't an EVM bug — it was a frontend supply-chain attack: malicious JavaScript injected into BadgerDAO's React app via a compromised Cloudflare Workers API key, which silently rewrote ERC-20 `approve()` transactions in users' wallets to grant unlimited allowance to attacker-controlled addresses. Bug class: frontend / API-key compromise / off-chain → on-chain handoff. Multi-tx, single attacker, many victims. Post-mortem: BadgerDAO official "Technical Post-Mortem of Recent Cyber Incident" (Dec 2021); Mandiant report; Rekt News "BadgerDAO — REKT".

### Timeline

- Pre-deploy: BadgerDAO is a Bitcoin-on-Ethereum strategies platform. Frontend is a React SPA. App fetches portfolio data via REST endpoints behind Cloudflare.
- Vulnerability introduced: An attacker created an unauthorized Cloudflare API key (later traced to compromised employee credentials, plausibly Sep 2021 or earlier [verify]). The key allowed creation/modification of Cloudflare Workers.
- Audit-coverage pre-exploit: Smart contracts had multiple audits (Quantstamp, Haechi, etc.). Frontend / supply chain was *out of scope*.
- Attack window: Months of intermittent injection. The attacker selectively activated the malicious worker for high-value users (those holding large bBTC/bWBTC balances) to avoid detection. Concentrated extraction Nov 21–Dec 2.
- Exploit: Many distinct user-signed transactions over weeks. Each victim approved a malicious contract for unlimited spend on their bBTC tokens; the attacker then drained from each in batch sweeps.
- Post-mortem: BadgerDAO halts contracts (smart contract had a pause), engages Mandiant, recovers/freezes a portion of funds.

### Root cause (technical)

There is no Solidity bug. The malicious mechanism is:

1. **Compromised Cloudflare API key.** Attacker accesses the Cloudflare account managing `badger.finance` and similar properties.
2. **Inject Cloudflare Worker** that intercepts JS responses and rewrites a snippet of the React app's wallet-interaction code. The injection is subtle: it monkey-patches the `web3.eth.sendTransaction` (or ethers.js equivalent) so that when the user is about to call `approve(spender, amount)` on a Badger ERC-20 (e.g., bBTC), the `spender` is replaced with the attacker's address and `amount` with `2^256 - 1` (max uint).
3. **The injection is targeted.** Only certain user wallets / IPs trigger the malicious worker; for most users, the app behaves normally.
4. **The user signs in MetaMask.** The wallet UI displays the *modified* transaction, which to a casual user looks like a normal Badger interaction. MetaMask shows the spender address, but most users don't verify it character-for-character.
5. **Once approved, the attacker calls `transferFrom(victim, attacker, balance)`** at leisure, draining the user's wrapped-BTC tokens.

The on-chain artifact: a `safeApprove`-style approval to attacker contract `0x1fcdb04d0c5364fbd92c73ca8af9baa72c269107` (or similar) [verify exact address]. There is nothing wrong with the Badger contracts themselves.

Pseudo-snippet of the malicious worker behavior (reverse-engineered from forensic analyses):

```javascript
// Cloudflare Worker injected near a known JS chunk
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(req) {
  const resp = await fetch(req);
  const url = new URL(req.url);
  if (url.pathname.includes('app.bundle.js')) {
    let body = await resp.text();
    // Inject hook that intercepts ethereum tx requests
    body = body.replace(
      /window.ethereum.request/g,
      `(async (args) => {
        if (args.method === 'eth_sendTransaction') {
          const tx = args.params[0];
          if (looksLikeApprove(tx.data) && targetUser()) {
            tx.data = rewriteApproveSpenderAndAmount(tx.data);
          }
        }
        return originalRequest(args);
      })`
    );
    return new Response(body, resp);
  }
  return resp;
}
```

### Attack flow

1. **(Months prior)** Attacker compromises BadgerDAO ops credentials → adds Cloudflare API key.
2. **(Sept–Nov 2021)** Attacker periodically activates the malicious worker. High-value targets see modified `approve()` payloads.
3. **(Per victim)** User opens app, navigates to "Deposit" or similar. App generates an `approve(...)` for the relevant Badger vault. Worker rewrites spender = attacker, amount = max.
4. **User signs in MetaMask.** Approval mined.
5. **(Hours to weeks later)** Attacker batches `transferFrom(victim, attacker, balance)` across many victims. Funds bridged to non-cooperative chains / Tornado.
6. **Dec 2 — peak day.** Roughly 200 unique victims drained.
7. **BadgerDAO triggers pause** on all vaults via Gnosis multisig once large outflows are noticed.

### Pre-exploit signals

- **Static signal:** Not applicable — no contract bug.
- **Audit signal:** Frontend was not audited. The smart contracts were sound.
- **Public speculation:** Some users reported "weird MetaMask popups" in BadgerDAO Discord weeks prior. These reports were not aggressively triaged. With hindsight, they were the canary.
- **Bug bounty:** The Immunefi bounty was for smart contracts; frontend was out of scope.

The signal that *was visible*: user reports of malformed approval transactions. A robust security operation cross-references user-reported anomalies against actual on-chain approvals to detect frontend supply-chain attacks. BadgerDAO did not have this discipline at the time.

### What our harness would need

This case study is an *outlier*: the exploit is fundamentally outside the smart-contract surface that an audit harness like Silica targets. We include it to clarify the scope-boundary.

- **Static-analyzer output sufficiency:** Not applicable (no contract bug).
- **Required LLM-reasoning depth:** Not applicable for the contract surface. For the *operational surface*, a harness would have to reason about: (1) how the protocol's frontend is delivered (CDN, subresource integrity, code-signing); (2) whether deployed contracts' state-mutating user actions can be initiated by the frontend with high blast radius (i.e., max-uint approvals); (3) whether the contract design assumes the frontend is honest.
- **Required validation tier:** None on-chain. The relevant verification is *operational*: does the protocol operator have SOC-2-grade access controls on Cloudflare/AWS/Vercel? Does the frontend ship with subresource integrity (SRI) hashes? Are deploy keys hardware-backed?
- **Required cross-contract context:** None.
- **Required temporal / economic state setup:** None.

### Lessons for Silica

- **Lead specialist:** *frontend / supply chain* — a category that is *not* part of typical smart-contract audit-harness scope. Silica's value here is to *flag the design assumption* that an arbitrary frontend can request unbounded approvals.
- **Heuristic to add to library:** `erc20.unbounded-approval-from-frontend` — flag any protocol whose user-flow includes `approve(spender, max_uint)` without justification, and recommend approval-permit-with-deadline patterns, EIP-2612 permit flows, or amount-equal-to-deposit approvals. This is a *design heuristic*, not an exploit-detection heuristic.
- **Bench-case shape:** Static analysis of a protocol's deployed UI bundle: detect any web3 `approve()` calls with `MaxUint256` literal. Output: rate-limit/permit recommendation.
- **Detection-difficulty class:** **very hard** for the actual exploit; **easy** for the design-pattern heuristic that would have reduced blast radius.
- **Could Cecuro plausibly catch this today?** No, in the literal sense — the exploit is off-chain and Silica is on-chain. But Silica *can* push the design heuristic ("avoid unbounded approvals as a default UX") which would have reduced the blast radius from "user's entire balance" to "user's most recent deposit." This is the kind of policy recommendation a serious audit harness should be willing to make. Recommend marking BadgerDAO-class attacks as **out-of-scope-but-design-actionable**: flag the unbounded-approval pattern in any audit, with a note that frontend supply-chain compromise is an out-of-band threat the protocol must defend against operationally.

The deeper lesson for Silica's product positioning: a meaningful share of crypto's largest losses are not contract bugs. The platform should be honest with customers about which attack classes are in scope and which require complementary defenses (SOC2, infosec, monitoring, frontend hardening). Selling "we'll catch your bugs" without that disclaimer is misleading. BadgerDAO is the canonical case to cite.
