# Off-Chain Perimeter Playbook — v0

> Cecuro audits on-chain code only. Silica's hybrid differentiation comes from also auditing the protocol's off-chain attack surface — the part where a $50M loss happens via a wallet-drainer frontend or a leaked deployer key, not a Solidity bug.

This document defines the per-surface recon procedures, detection signals, validation requirements, and authorization scope for each off-chain target.

## Authorization is gating

Every off-chain agent run requires a valid `scope_artifact_id` declaring:
- Target asset (domain, IP range, GitHub org, container registry, frontend bundle URL)
- Permitted depth (read-only fingerprint vs active probing vs validated exploit)
- Time window
- Authorized signer

Off-chain agents refuse to run without an active scope. Out-of-scope findings are emitted with `status: "informational"` and no exploit validation.

## Surface 1 — Frontend wallet-call swap

**Threat:** Attacker injects code into the protocol's frontend that modifies wallet-tx params before the user signs (e.g., changes recipient address or amount). User sees the protocol UI, signs the malicious tx, funds drain.

**Real-world:** BadgerDAO Dec 2021 (Cloudflare Workers script injected by API token compromise; ~$130M).

**Detection procedure:**
1. Crawl the frontend (production + staging if in scope).
2. Identify all wallet-call construction sites: `writeContract`, `useContractWrite`, `signMessage`, `useSignTypedData`, `wagmi.simulateContract`, custom ethers/web3 patterns.
3. Trace data flow from URL params, localStorage, fetched API responses, environment variables, and dynamic imports to those wallet-call sites.
4. Flag any flow that allows uncontrolled input to reach a wallet-call parameter.

**Tools:**
- Browser automation: Playwright with custom DOM-walker
- AST analysis on built JS bundle: source-maps + LLM agent reading minified code
- Static taint: custom Semgrep rules for known framework patterns (wagmi, ethers, web3-react)
- Network capture: capture all outbound API calls during user flows

**Validation rung:** R-INFO for "potential injection point detected." R3-equivalent for "synthetic injection demonstrated" (proven by injecting into a sandboxed clone of the frontend; never against production).

**False positives:**
- Server-side-rendered tx params (params come from a trusted backend, not user input)
- Strict CSP that blocks `unsafe-inline` and `unsafe-eval`
- Subresource integrity hashes on all loaded JS

## Surface 2 — Subdomain takeover

**Threat:** Attacker takes control of a deprovisioned cloud resource pointed at by a dangling DNS record. Uses the subdomain to host wallet-drainer phishing.

**Real-world:** Several DeFi protocols 2022–2025 (specific cases under NDA in many post-mortems).

**Detection procedure:**
1. Enumerate all subdomains of the protocol's primary domains.
2. For each, resolve DNS records and identify dangling pointers (CNAME → deprovisioned S3 bucket / Heroku app / etc).
3. Cross-reference takeover indicators against Project Discovery's `subdomain-takeover` template pack.

**Tools:**
- subfinder, amass, dnsx for enum
- httpx for HTTP fingerprint
- nuclei `subdomain-takeover` templates
- Custom checks for crypto-specific TLDs and registrars

**Validation rung:** R-INFO ("dangling pointer detected"). Active validation (provisioning the dangling resource) is restricted: usually requires explicit auth, defaults to evidence-only.

## Surface 3 — RPC node exposure

**Threat:** Protocol runs an internal Geth/Erigon/Solana RPC for bots, indexers, ops. Inadvertent exposure of admin RPC methods (`personal_*`, `admin_*`, `txpool_*`, debug/trace) leaks privileged capabilities.

**Detection procedure:**
1. Scan known IP ranges for the protocol's infra (or scope-listed targets).
2. Fingerprint RPC services (port 8545 / 8546 default; Solana 8899).
3. Enumerate exposed methods via `rpc_modules` or method-by-method probing.
4. Flag any high-risk method.

**Tools:**
- nmap with custom JSON-RPC fingerprinter
- Custom probe-list for ETH RPC and Solana RPC

**Validation rung:** R3-equivalent: prove the method is exposed, demonstrate one read-only effect.

**Caveats:**
- Many protocols use cloud RPC providers (Alchemy, Infura, Helius) — those are out-of-scope.
- Internal RPC behind VPN is in-scope only if VPN access is granted.

## Surface 4 — CI/CD pipeline / deployer key leaks

**Threat:** Deployer private keys, infra credentials, third-party API keys leaked in:
- GitHub Actions logs
- Public Docker images on Docker Hub / GHCR
- Public commits in protocol's GitHub orgs
- Exposed `.env` files in build outputs

**Real-world:** Multiple protocol exploits attributable to leaked deployer keys (Multichain July 2023 — exit-scam variant; Slope wallet incident).

**Detection procedure:**
1. Scan all public GitHub repos under the protocol's GitHub org (and contributor accounts where in scope).
2. Run trufflehog + gitleaks on full git history.
3. Pull and unpack the protocol's public Docker images; scan layers for `.env`, `*.key`, `*.pem`, `id_rsa`, etc.
4. Scrape public GitHub Actions workflow logs for the protocol's repos (limited to public workflow output).
5. For each high-entropy match, derive on-chain address (if it's an Ethereum/Solana key) and cross-check on-chain activity.

**Tools:**
- trufflehog (verified mode for high signal)
- gitleaks
- Docker image layer extraction (skopeo, dive)
- Custom GHActions workflow log scraper
- Address-derivation verifier

**Validation rung:** R4-equivalent — derive address, observe whether it's been used; do NOT use the key.

**Authorization sensitivity:** scanning public repos is generally permissible without auth; deeper enumeration of org membership / private workflow logs is gated.

## Surface 5 — Multisig signer OSINT

**Threat:** Multisig (Gnosis Safe) signers are typically EOAs controlled by individuals. If the threshold is reachable via social engineering of N signers, the multisig is compromised.

**Detection procedure:**
1. Enumerate Safe signers from on-chain: `Safe.getOwners()` and threshold.
2. Resolve signer addresses to identities via ENS, Etherscan name tags, on-chain message signatures, and OSINT (Twitter, Telegram, LinkedIn).
3. Map signers' public surface: Twitter handles, Telegram username, LinkedIn profile, posted hardware setup.
4. Identify weakest-link signer(s) per threshold reachability.

**Tools:**
- Etherscan API + on-chain Safe contract reads
- ENS resolver
- OSINT: theHarvester, Maltego (commercial), custom Twitter/LinkedIn scrapers
- Crypto-OSINT-specific: search for prior on-chain identity leaks

**Validation rung:** R-INFO mostly. Active phishing trials are gated — only with explicit auth, sandboxed and scoped.

**Output:** signer-graph map + risk score per signer + threshold-reachability assessment.

## Surface 6 — Bridge validator backend

**Threat:** "Decentralized" bridges often run validators with HTTP APIs. The signing logic is on-chain but the trigger surface (API endpoints) is web-app-class.

**Real-world:** Ronin Bridge (March 2022, signer compromise), Multichain (July 2023, exit-scam hybrid).

**Detection procedure:** standard web-app pentesting tier ladder against the validator's API.

**Tools:** burp, zap, ffuf, sqlmap, custom signature-replay/auth tooling.

**Validation rung:** R3-equivalent.

## Surface 7 — Telegram/Discord admin compromise

**Threat:** Protocol's official Telegram/Discord admin account compromised → social-engineering surface to push wallet-drainer links to community.

**Detection procedure:**
1. Enumerate admin/mod accounts.
2. Cross-check admin usernames against known leak sets (HaveIBeenPwned, breach data).
3. Identify whether 2FA is enforced (often inferable from how account was set up).
4. Check for prior mod-account-takeover incidents.

**Tools:** OSINT, breach-data search.

**Validation rung:** R-INFO only. No active social engineering without explicit auth.

## Surface 8 — Build-tool / dependency supply chain

**Threat:** Malicious package published to npm/cargo/PyPI/etc., installed by the protocol's build pipeline. Code injects into the build output. Recent example: `ledgerhq/connect-kit` Dec 2023 — compromised npm package wallet-drained ~$600K.

**Detection procedure:**
1. Enumerate dependencies from `package.json`, `Cargo.toml`, `requirements.txt`, etc.
2. Cross-check against known-malicious package lists (Socket, Phylum).
3. Identify dependencies with low maintainer counts, recent ownership changes, typosquatting candidates.
4. Static analysis on dependency code itself (does it phone home? read filesystem? etc.).

**Tools:** Socket, Phylum, custom dependency-graph analyzer.

**Validation rung:** R3-equivalent for "package fetched + executed in sandbox; identified suspicious behavior."

## Combined off-chain audit deliverable

Off-chain findings flow through the same Finding schema as on-chain. The `subject.kind` for off-chain doesn't fit the VM enum; instead `logical_subject` carries the type:

```jsonc
{
  "subject": {
    "kind": "off-chain",                 // not in current VM enum; v1 schema extension
    "logical_subject": "frontend" | "rpc-endpoint" | "ci-pipeline" | "multisig-osint" | "supply-chain" | "bridge-validator-api",
    "primary_locator": {
      "kind": "url" | "domain" | "github-org" | "ip-range" | "package-name",
      "value": "..."
    }
  }
}
```

**Schema gap noted:** the v0 `Subject.kind` enum is VM-only. v1 needs to add `off-chain`, OR off-chain findings need a separate sibling schema. This is a v1 spec decision (logged in `design/schema-draft-v0.md` open items).

## Tooling stack

Layered:
- **Pure scan tools:** subfinder, amass, nmap, nuclei (HexStrike pattern)
- **Active probe tools:** burp, zap, ffuf
- **Crypto-specific:** Etherscan API, on-chain Safe reads, address-derivation
- **Browser automation:** Playwright + custom DOM agents
- **Secret scanners:** trufflehog, gitleaks
- **Supply-chain scanners:** Socket, Phylum, custom
- **OSINT:** custom tooling layered on common platforms

The MCP-as-tool-shim pattern (from `notes.md` §6) applies cleanly to off-chain tools — most are CLI wrappers. HexStrike's tool inventory covers ~70% of what we need; the remainder is crypto-specific.

## Authorization workflow

```
Client signs scope artifact:
  - assets[] (URLs, domains, IP ranges, GitHub orgs, package names)
  - depth_per_asset (passive | fingerprint | active-read | active-validate)
  - validity_window (default 30 days, max 90)
  - signed_by (legal authority)
  → scp_id stored in audit fixture

For every off-chain agent invocation:
  scope := load(scp_id)
  if not active(scope): refuse
  if target not in scope.assets: refuse
  if depth > scope.depth_per_asset: refuse
  emit telemetry(scp_id, action, target, depth)
  proceed
```

## Combined surface map per audit

A "perimeter audit" deliverable shows all surfaces audited:

| Surface | Status | Findings (count) | Highest severity |
|---|---|---|---|
| Frontend XSS / wallet-swap | passed | 0 | — |
| Subdomain takeover | passed | 1 | informational |
| RPC node exposure | passed | 0 | — |
| CI / deployer key | flagged | 1 | medium (leaked test key, no on-chain activity) |
| Multisig signer OSINT | flagged | 1 | informational (signer with high public profile) |
| Bridge validator backend | passed | 0 | — |
| Telegram/Discord admin | passed | 0 | — |
| Supply chain | passed | 0 | — |

This becomes part of the audit report alongside on-chain findings.

## Why this is a defensible niche

- Cecuro: on-chain only. Cannot do this without rebuilding their stack.
- Hacken/Halborn: do off-chain perimeter manually (humans, weeks, expensive).
- HexStrike: covers off-chain attack surface but doesn't have crypto-specific knowledge (multisig OSINT, signer-graph mapping, wallet-call taint analysis).

Silica positions: same audit, both surfaces, automated, hours not weeks.

## Open items

- Per-surface validation rung details (e.g., what's R3-equivalent for "leaked key with no on-chain activity"?)
- Disclosure flow for high-severity off-chain findings (immediate notification vs end-of-audit?)
- Active-probe rate limits (don't accidentally DoS the client's infra during recon)
- Standing-scope agreements (continuous monitoring of perimeter, opt-in)
