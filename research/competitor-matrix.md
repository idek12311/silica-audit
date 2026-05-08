# Silica — Competitive Matrix: AI / Automated Smart-Contract Security

**Status:** Draft v1.0
**Author:** Silica research
**Date compiled:** 2026-05-08
**Method:** Web research from public sources (vendor sites, blogs, GitHub, arXiv, press wires).
Items marked **[unverified]** rely on a single source or a vendor self-claim that has not
been corroborated by an independent benchmark. Items marked **[?]** were not findable
within research time and should be confirmed before any positioning decision is made on them.

---

## 1. Scope

This document maps the 2026 landscape of automated and AI-assisted smart-contract
security tooling. The goal is to identify the white space Silica should occupy. We
include four broad categories:

1. **AI audit agents** — LLM-driven autonomous auditors (Cecuro, Olympix, Aderyn,
   Nethermind AuditAgent, Pessimistic, ChainGPT, Hacken AI, OpenZeppelin Defender,
   Octane, Almanax, Sherlock AI, CertiK AI Auditor).
2. **Human firms with internal AI tooling** — Trail of Bits, Spearbit/Cantina,
   Halborn, Quantstamp, Consensys Diligence.
3. **Audit marketplaces & contests** — Sherlock, Code4rena, Cantina, Immunefi.
4. **Continuous monitoring / SecOps** — Hypernative, Forta, ChainPatrol, Olympix
   Integrity, Tenderly, CertiK Skynet.
5. **Chain-specialist firms** — Sec3, OtterSec, Neodyme, Soteria (Solana); MoveBit,
   Numen, Verichains (Move).
6. **Open-source detector toolchains** — Slither, Mythril, Aderyn (OSS core),
   Halmos, hevm, Echidna, Medusa, Foundry.

---

## 2. Matrix

Columns:
- **Cap** = Primary capability
- **VM** = Virtual machine coverage (EVM / SVM / Move / Cairo / etc.)
- **Perimeter** = On-chain only / Off-chain too / Both
- **Cadence** = Continuous vs point-in-time
- **PoC?** = Auto-PoC generation (yes / partial / no)
- **OSS** = Open-source posture
- **Pricing** = Pricing model
- **Bench** = Public benchmark numbers
- **Customers / TVL** = Notable customers or TVL secured
- **Diff** = Strongest differentiation

### 2.1 AI audit agents

| Tool | Cap | VM | Perimeter | Cadence | PoC? | OSS | Pricing | Bench | Customers / TVL | Diff |
|---|---|---|---|---|---|---|---|---|---|---|
| Cecuro | LLM multi-agent auditor | EVM (claims "all blockchains" [unverified]) | On-chain (code) | Point-in-time + CI-pluggable [unverified] | Yes — claims executable PoCs | Closed | "90% cheaper than traditional" [unverified, no list price] | **87.7% recall on EVMBench detect** (101/120 high-sev across 40 cases) | Not disclosed [?] | Best-published EVMBench score in 2026 |
| Olympix | IR + symbolic + fuzzing + AI; mutation testing; CI/CD | EVM (Solidity) | On-chain (code) | Continuous (CI/CD) | Yes — "executable POCs" [vendor claim] | Closed | Enterprise [?] | "300% better detection vs OSS" [vendor claim, unverified] | Lumia ecosystem; Series A [unverified] | DevSecOps positioning + mutation-testing differentiator |
| Cyfrin Aderyn | Rust static analyzer | EVM (Solidity) | On-chain (code) | CI + IDE (VS Code) | No | **AGPL / OSS public good** | Free OSS; Cyfrin sells audits | 100+ detectors [vendor] | OSS — used inside Cyfrin's audit practice | Only Rust-based, IDE-integrated OSS Solidity SAST |
| Nethermind AuditAgent | Agentic LLM + symbolic + KB-backed | EVM | On-chain (code) | Point-in-time, repo-connected | Partial — flags + reasoning, not always executable [unverified] | Closed | Service [?] | **~30% avg recall vs human auditors across 29 audits** (some 50%) | Used on CMTAT for CMTA / UBS | Honest benchmarking; strong as "pair auditor" workflow |
| Pessimistic.io | Human audits + minor automation | EVM | On-chain (code) | Point-in-time | No | Closed | Per-engagement | None published | 400+ audits | Manual-first; speed of proposals |
| ChainGPT | LLM-only auditor, API+SDK | EVM, BNB, Berachain, Avalanche, Solana, more [vendor] | On-chain (code) | Point-in-time, two modes (Quick / Full) | No | Closed | Per-call/prompt fixed cost | None published | Self-serve devs | Cheapest API-priced auditor; multi-chain breadth via prompt |
| Hacken AI / Bouncer | AI tooling + 2-senior parallel review | EVM, SVM, Cosmos [vendor] | On-chain (code) + bug bounty | Point-in-time + bounty | Partial [?] | Closed | Per-engagement | None public | $180–430B secured [vendor]; 1,500+ projects | Combined audit + HackenProof bounty + portal |
| OpenZeppelin Defender (AI Code module) | AI vuln scan + monitor | EVM | Both — on-chain + monitor | Continuous **(sunsetting July 1, 2026)** | No | Closing → Relayer/Monitor open-sourced | SaaS, ending | None published | Wide DeFi base | OZ trust + standard library tie-in (but exiting) |
| Octane (Octane Security) | AI scanning in CI/CD; auto-fix | EVM | On-chain (code) | Continuous (CI/CD) | Partial — auto-fixes [vendor claim] | Closed | SaaS [?] | None published | Decent (case study); $6.75M seed | Auto-fix loop on top of detection |
| Almanax | "AI Security Engineer," CI/CD, supply chain | EVM + **Move (Aptos partnership)** | Both — code + supply chain | Continuous | Partial [?] | Closed | SaaS [?] | None published | [?] | Move-language coverage early; AppSec framing not Web3-native |
| Sherlock AI | AI auditor connected to GitHub | EVM | On-chain (code) | Continuous (PR-watch) | Yes — claims "real exploit paths" | Closed | Bundled with Sherlock contests | Self-claim: **"first AI to find $2.4M-impact bug on mainnet"** (May 2026) [vendor] | Sherlock contest customer base | Only AI auditor coupled to a coverage product (Shield) |
| CertiK AI Auditor / Skynet | AI vuln scan + 24/7 chain monitoring | EVM (primary), some SVM | Both | Continuous | No | Closed | Enterprise / per-audit | **88.6% cumulative exact-hit on 35 real 2026 incidents** (vendor self-eval) | Polygon, Binance, Aave [vendor] | Brand + Skynet monitoring + insurance (Chainproof-adjacent) |

### 2.2 Human firms with internal AI tooling

| Tool | Cap | VM | Perimeter | Cadence | PoC? | OSS | Pricing | Bench | Customers / TVL | Diff |
|---|---|---|---|---|---|---|---|---|---|---|
| Trail of Bits | Manual audits + Slither/Echidna/Medusa + AI-native team | EVM (deepest), some other | On-chain (code) + appsec | Point-in-time | Yes — they ship Foundry-compat PoCs | **Slither, Echidna, Medusa, Optik, Slither-MCP all OSS** | Per-engagement (high band) | Slither + Echidna are de-facto industry baselines; **Slither-MCP** released Nov 2025 | Compound, MakerDAO, Yearn, etc. (extensive) | OSS-leader-with-services posture; 200 bugs/week on right engagements (vendor) |
| Spearbit / Cantina | Network of elite researchers + competitions + AI security | EVM (primary) | Both — competitions span code + adjacent | Both — point-in-time audits + ongoing competitions | Yes (researcher-driven) | Closed platform | Per-competition / per-engagement | $25B+ TVL secured; 4,474 verified issues; 202 projects | Major DeFi names | Competition + private audit hybrid + "AI-native" branding |
| Halborn | Offensive-security firm | EVM, SVM, Cosmos, Move (case-by-case) | Both — code + pentest + appsec + social engineering | Point-in-time | Yes (manual/pentest-driven) | Closed | Premium per-engagement | $1T assets secured [vendor]; 600+ clients | Polygon, Avalanche, etc. | Treat audit as a pentest; broadest perimeter |
| Quantstamp | Manual + symbolic + Quantstamp AI Suite + formal verification (via Runtime Verification) | EVM, Solana, Flow, Cardano | Both — audit + Chainproof insurance + monitoring | Both | Partial [?] | Closed | Per-engagement | $200B+ secured; 1,100+ projects | Prysm, Teku, etc. | Insurance product (Chainproof) + formal proofs option |
| Consensys Diligence | Manual audits + (archived) MythX / Diligence Fuzzing | EVM (primary) | On-chain (code) | Point-in-time | Partial (Harvey fuzzer) | Mythril OSS; MythX archived; research ongoing (zkVM fuzzers) | Per-engagement | 200+ issues found via MythX; 10K+ analyses/month historic | MetaMask, Linea, etc. | Brand within Consensys; zkVM/Arguzz research direction (Usenix 2026) |

### 2.3 Audit marketplaces

| Tool | Cap | VM | Perimeter | Cadence | PoC? | OSS | Pricing | Bench | Customers / TVL | Diff |
|---|---|---|---|---|---|---|---|---|---|---|
| Sherlock | Audit contests + lead Watson + **financial coverage (Shield)** + bounty + Sherlock AI | EVM (primary) | On-chain (code) + post-deploy coverage | Both — fixed-window contests + Shield monitoring | Yes (researcher-driven, sometimes AI) | Closed | Prize-pool model; ~$20K–$200K+ scope | None as benchmark; case studies (Ripple/XRPL $550K contest, Apr 2026) | Wide DeFi book | **Audit + financial coverage on the same SKU**; no other entrant pays out on misses |
| Code4rena | Crowdsourced contests | EVM (primary) | On-chain (code) | Point-in-time, fixed window | Researcher-driven | Reports public | **Zero platform fee** (all to researchers); prize pool $20K–$200K+ | Aggregate report archive | 16,600+ researchers; 100+/contest avg | Largest researcher pool, no platform fee |
| Cantina (see 2.2) | (See above) | — | — | — | — | — | — | — | — | — |
| Immunefi | Bug bounty platform | EVM (primary), SVM, Cosmos, others | On-chain (mainly) | Continuous | Researcher-supplied | Vaults system on-chain | TVL-based bounty (~10% rule of thumb); $1K–$10M | $190B+ user funds protected; 330+ projects; biggest payouts in industry | ChainLink, MakerDAO, Wormhole, SushiSwap | Largest live-asset bounty marketplace; on-chain Vaults for proof-of-assets |

### 2.4 Continuous monitoring / SecOps

| Tool | Cap | VM | Perimeter | Cadence | PoC? | OSS | Pricing | Bench | Customers / TVL | Diff |
|---|---|---|---|---|---|---|---|---|---|---|
| Hypernative | Real-time threat detection + automated response | EVM + Solana + Sui + 60+ chains | Both — on-chain + offchain (web apps, price feeds, vuln DBs, governance) | Continuous | No | Closed | Enterprise SaaS [?] | **99.5% hack detection, <0.001% false positive, $2B saved, 2-min lead time** [vendor self-claim, well-cited] | Sui, 3Jane, wallets, exchanges | Pre-exploit lead time + offchain perimeter built-in |
| Forta | Decentralized detection-bot network | EVM (Ethereum, Polygon, BNB, Avalanche, Arbitrum, Optimism, Fantom) | On-chain | Continuous | No | Bots OSS/community | FORT staking; subscription tiers [?] | 1,700+ scan nodes, 650+ bots, 7,500+ subscribers (2022 disclosure) [unverified for 2026] | Wide ecosystem | Open detection-bot ecosystem; community-built signatures |
| ChainPatrol | Brand / phishing / impersonation defense | Wallet-level (chain-agnostic) | **Off-chain** — domains, social, brand | Continuous | No | Closed | Enterprise SaaS | 29,000+ Consensys-brand threats blocked (Jan–Oct 2024); blocks across 20+ wallets in <15 min | Arbitrum, Starknet, Curve, MetaMask, Phantom, Stellar, zkSync | Only Web3-focused offchain takedown + wallet-blocklist integration |
| Olympix Integrity | Continuous monitoring (offshoot of Olympix dev tools) | EVM | On-chain | Continuous | Tied to Olympix PoC engine | Closed | Enterprise [?] | None published | Olympix install base | Pairs deploy-time hardening with run-time monitoring under one vendor |
| Tenderly | Simulation + Virtual TestNets + alerts + Web3 Actions | EVM + L2s + rollups | Both (light) — on-chain monitoring + simulation | Continuous + dev workflow | No (focus is reproducibility, not exploit synthesis) | Closed | SaaS, multi-tier [?] | None as security benchmark | Wide dev-tool footprint | Unmatched debugging / simulation; closest to "DevOps for Web3" |
| CertiK Skynet | (See 2.1 row) | — | Both | Continuous | No | Closed | — | 88.6% AI-Auditor hit-rate self-eval | — | Brand + auditor + monitor + insurance |

### 2.5 Chain-specialist firms

| Tool | Cap | VM | Perimeter | Cadence | PoC? | OSS | Pricing | Bench | Customers / TVL | Diff |
|---|---|---|---|---|---|---|---|---|---|---|
| Sec3 (was Soteria) | X-Ray static SAST + WatchTower monitor + OwLLM (Web3 LLM) | **SVM (Solana)** | Both — code + WatchTower runtime | Both | Partial — WatchTower runtime, no exploit gen | **X-Ray toolchain CLI is OSS** | Tiered SaaS (X-Ray Premium); audit services | 50+ vuln classes [vendor]; 5-minute scan claim | Wide Solana customer base | Most complete Solana-native SAST + monitor + audits stack |
| OtterSec | Premium Solana / Move audits + formal verification | SVM, Move | On-chain (code) | Point-in-time | Yes (manual) | None | Premium per-engagement | $36.8B TVL secured; >$1B vulns patched | Solana Foundation, Wormhole, Jito | Tier-1 reputation in SVM/Move; formal-verification capability |
| Neodyme | Solana / high-stakes audits, research | SVM (primary), some EVM | On-chain (code) | Point-in-time | Yes (manual research-grade) | Public research case studies | Per-engagement [?] | "$2.6B-at-risk rounding bug" case-study [public] | Solana ecosystem | Research-led reputation, not productized |
| Soteria | Now Sec3 (see above) | — | — | — | — | — | — | — | — | — |
| MoveBit (BitsLab) | Move audits + Move Analyzer (VS Code plugins) + formal verification | **Move (Aptos & Sui)** | On-chain (code) | Both — audits + IDE | Partial | Move Analyzer plugins OSS | Per-engagement [?] | None public | Aptos / Sui ecosystem | First Move security firm; only one with native VS Code plugins for both Aptos and Sui |
| Numen Cyber | Web3 audits + smart-wallet + offchain TI + threat-detection-and-response | EVM, Move (CTF coverage) | Both | Both | Partial (manual-led) | Closed | Per-engagement [?] | None public | Singapore-based; APAC clients [?] | Hybrid Web2/Web3 incident response posture |
| Verichains | Audits + **Revela (open-source Move decompiler)** + cryptography review + key management + redteam | EVM, Move (Aptos), other | Both — code + appsec + key mgmt | Point-in-time | Partial (manual) | **Revela OSS** (Move decompiler) | Per-engagement | None public | $50B+ secured; BNB Chain, Klaytn, Wemix, Line, Axie, Ronin, Kyber | APAC leader; Move bytecode decompilation tooling unique |

### 2.6 Open-source detector toolchains

| Tool | Cap | VM | Perimeter | Cadence | PoC? | OSS | Pricing | Bench | Customers / TVL | Diff |
|---|---|---|---|---|---|---|---|---|---|---|
| Slither | Solidity/Vyper SAST | EVM | On-chain (code) | CI / IDE / MCP | No (detectors only) | **AGPLv3 OSS** (Trail of Bits) | Free | 80+ detector types; baseline tool in nearly all comparative benchmarks | Industry-wide | Industry-default SAST; Slither-MCP (Nov 2025) brings it to LLM agents |
| Mythril | Symbolic execution for EVM bytecode | EVM (any EVM-compatible: Hedera, Quorum, Vechain, Roostock, Tron) | On-chain (bytecode) | CLI / CI | No (paths only) | **OSS** (Consensys) | Free; MythX cloud archived | Used in academic benchmarks | OSS community | Bytecode-level (no source needed); broadest EVM-compatible reach |
| Aderyn (OSS core) | Rust SAST | EVM (Solidity) | On-chain (code) | CLI + VS Code | No | OSS (Cyfrin) | Free | 100+ detectors; releases through 2026 | Cyfrin internal + community | Faster-than-Python Rust toolchain; clean modern detector model |
| Halmos | Symbolic test runner — uses your existing Foundry tests as specs | EVM | On-chain (code) | CLI / CI | Counterexamples are de-facto PoCs | OSS (a16z) | Free | Stateful invariants since v0.3 (Oct 2025); flamegraph + lcov coverage | a16z portfolio + community | "Bring your own tests" symbolic verification; lowest friction onramp |
| hevm | Symbolic EVM execution + equivalence + symbolic unit testing | EVM | On-chain (code/bytecode) | CLI | Counterexample-driven | OSS (Argot/Ethereum Foundation) | Free | Recent Springer/USENIX paper; outperforms peers on competitive solving | OSS / research | Mature symbolic engine — used internally by other tools (Echidna stack) |
| Echidna | Property-based fuzzer | EVM | On-chain (code) | CLI / CI | Counterexamples are de-facto PoCs | OSS (Trail of Bits) | Free | Battle-tested across hundreds of audits; 168 prebuilt properties library | Industry-wide | Property-based, coverage-guided; longest track record |
| Medusa | Parallel coverage-guided mutational fuzzer | EVM | On-chain (code) | CLI / CI | Counterexamples | OSS (Trail of Bits, Go) | Free | "5–7x faster than Echidna" [vendor claim, 2026] | Increasingly the default at ToB | Parallel fuzzing; replacing Echidna as the new default |
| Foundry (forge / cast / anvil / chisel) | Dev framework + fuzz + invariant + coverage | EVM | On-chain (code) | CLI / CI | Counterexamples | OSS (Rust) | Free | De-facto Solidity dev/test toolchain | Effectively all serious Solidity projects | The substrate every other tool integrates with |

---

## 3. Per-entrant positioning notes (≤3 sentences each)

### 3.1 AI audit agents

**Cecuro.** Posts the strongest public 2026 EVMBench score (87.7% detect-recall, 101/120 high-sev across 40 real-world cases) — roughly 2x the best frontier-LLM zero-shot baseline. Marketing leans on a multi-agent architecture and "90% cheaper than traditional"; list pricing, named customers, and any non-EVM depth are not public.

**Olympix.** Positions as a DevSecOps platform — IR + custom detectors + symbolic execution + fuzzing + mutation testing + auto-PoCs in CI/CD — rather than as a one-shot auditor. Strongest mutation-testing story in EVM (claims to beat Slither and Vertigo-rs); pricing is enterprise and not public.

**Cyfrin Aderyn.** Rust-based OSS Solidity SAST shipped as a public good with 100+ detectors and a VS Code extension. Functions less as a competitor and more as raw substrate any platform (Silica included) could embed.

**Nethermind AuditAgent.** The most honest published benchmark in the AI-auditor space: ~30% average recall vs. human auditors across 29 real audits, peaking ~50%. Nethermind explicitly markets it as a *pair auditor*, not a replacement, with the CMTAT/UBS engagement (75 contracts, 5,999 LoC, 14 findings) as its anchor case study.

**Pessimistic.io.** Manual-first firm, 400+ audits, only minor automation. Functions as a baseline for "fast human audit" — fast proposals, week-to-month turnarounds, no AI play.

**ChainGPT.** Per-call/prompt-priced LLM auditor with two modes (Quick ≤30s, Full ≤2h) and an API/SDK. Multi-chain breadth comes from prompt flexibility rather than chain-specific tooling, so non-EVM depth is unverified.

**Hacken AI / Bouncer.** 1,500+ project audit firm bundled with the HackenProof bounty platform; differentiator is the bundle (audit + bounty + portal + HAI score), not the AI itself. AI tooling exists internally but is not the productized SKU.

**OpenZeppelin Defender (AI features).** **Sunsetting July 1, 2026**; new signups closed June 30, 2025. OZ is reallocating to open-source Relayer and Monitor — a respected brand vacating the integrated-platform position is itself white space.

**Octane.** Stealth-launched April 2025 with $6.75M led by Winklevoss Capital. Positions on auto-fix in CI/CD on top of detection; Decent is the only named public customer.

**Almanax.** Frames itself as an "AI Security Engineer" closer to AppSec than crypto-native audit, with a public Aptos Labs partnership for **Move** agents. Move coverage at the AI-auditor layer is rare and worth tracking.

**Sherlock AI.** GitHub-app AI auditor coupled to Sherlock's contest and Shield coverage products. May 2026 disclosure claims it was the first AI to find a $2.4M-impact critical bug on a live mainnet — the AI + contest + financial-coverage bundle is genuinely novel.

**CertiK AI Auditor / Skynet.** Incumbent brand + Skynet score + insurance-adjacent product (Chainproof) + manual reviews, now with an AI veneer. Self-eval claims 88.6% cumulative exact-hit on 35 real 2026 incidents — not externally reproduced.

### 3.2 Human firms with internal AI tooling

**Trail of Bits.** The OSS arsenal is the moat — Slither, Echidna, Medusa, Optik, Slither-MCP. The March 2026 "AI-native" post quantifies posture: 94 plugins, 201 skills, 84 specialized agents, 414+ reference files, ~200 bugs/week on the right engagements. **Slither-MCP** (Nov 2025) is the strategic shift: make their tools agent-callable rather than trying to become an agent themselves.

**Spearbit / Cantina.** Private Spearbit engagements + Cantina open competitions + Cantina MDR + bounties + "AI security." 5,000+ researchers, 4,474 verified issues, $25B+ TVL secured, $16.1M paid out. Explicitly anti-point-in-time, positioning as full-lifecycle.

**Halborn.** Treats every audit as a pentest, including web/mobile API coverage, social engineering, and phishing simulation. $1T assets secured, 600+ clients (Polygon, Avalanche) — broadest perimeter of any pure audit firm, closest to what an enterprise CISO recognizes as "real security."

**Quantstamp.** $200B+ secured, 1,100+ projects, blockchain-agnostic (EVM, Solana, Flow, Cardano). Differentiators are formal proofs via Runtime Verification and the **Chainproof** insurance product; AI Suite is enterprise-positioned but benchmark-light.

**Consensys Diligence.** MythX and Diligence Fuzzing are archived; Mythril remains OSS. Recent direction is research — "Arguzz: Testing zkVMs for Soundness and Completeness Bugs" at USENIX Security 2026 signals a pivot to zkVM fuzzing rather than a current product.

### 3.3 Marketplaces

**Sherlock.** Lead Watson + parallel researcher swarm, then **Sherlock Shield** financial coverage (e.g., $1M coverage + $100K bounty bundled with audit). Apr 2026 Ripple/XRPL contest had a $550K reward pool — financial coverage on the same SKU is unique in the marketplace category.

**Code4rena.** 16,600+ researchers, 100+ avg per contest, **zero platform fee**. Positioned as the largest research community; pure prize-pool model, no coverage bundle.

**Cantina.** See 3.2.

**Immunefi.** Largest live-asset bug-bounty platform: $190B+ user funds protected, 330+ projects, $1K–$10M individual bounties, ~10%-of-TVL pricing rule of thumb. **Vaults** system lets projects deposit on-chain proof-of-assets and pay whitehats on-chain — the only marketplace whose payout flow lives on-chain.

### 3.4 Continuous monitoring / SecOps

**Hypernative.** Category leader by published numbers — 60+ chains, 300+ risk types, **99.5% hack detection at <0.001% FP rate, ~2-minute pre-exploit lead, $2B+ saved** (vendor claims; corroborated by Sui, 3Jane, exchange and wallet case studies). Couples on-chain + off-chain (web apps, price feeds, governance, vuln DBs) sources with automated response (pause, move to cold, change params).

**Forta.** Decentralized scan-node + detection-bot network with FORT-staking spam gating. Open primitive — but EVM-only in public disclosure, and the headline numbers (1,700+ nodes, 650+ bots, 7,500+ subscribers) are 2022-vintage and have not been refreshed.

**ChainPatrol.** **Off-chain only** — phishing, impersonation, fake domains, social-media takedowns. Integrated blocklists across 20+ wallets (MetaMask, Coinbase Wallet, Phantom) and Google SafeBrowsing; ~29,000 Consensys-brand threats blocked Jan–Oct 2024. Almost no overlap with on-chain SecOps tools.

**Olympix Integrity.** Production monitoring sister product to Olympix's dev-time hardening; smaller monitoring footprint than Hypernative. Differentiator is the single-vendor pre-deploy + post-deploy story.

**Tenderly.** Not security-first — simulation, Virtual TestNets, alerts, Web3 Actions. Reduces incident time-to-root-cause via traces; treated as DevOps infrastructure that other security tools layer on top of.

**CertiK Skynet.** See 3.1.

### 3.5 Chain-specialist firms

**Sec3 (formerly Soteria).** Most complete Solana-native stack: X-Ray (OSS CLI + Premium auto-auditor, 50+ vuln classes), WatchTower post-deploy monitor, OwLLM (Web3-native LLM), GitHub Actions integration. Ships a 5-minute-scan claim even on large codebases like metaplex.

**OtterSec.** Tier-1 SVM/Move boutique — **$36.8B TVL** secured, **>$1B in vulns patched**, anchored by Solana Foundation, Wormhole, and Jito. Co-built EVMBench alongside OpenAI and Paradigm, signaling cross-VM benchmarking credibility.

**Neodyme.** Research-led Solana/high-stakes auditing, known for the "How to Become a Millionaire, 0.000001 BTC at a Time" rounding-error study that put $2.6B at risk. No productized AI play — pure research firm.

**Soteria.** Rebranded to Sec3.

**MoveBit (BitsLab).** First Move-ecosystem security firm; ships Move Analyzer VS Code plugins for both Aptos and Sui plus Move Prover-based formal verification. Academic leadership team (NDSS/CCS publications) — only firm with native IDE tooling across both Aptos and Sui.

**Numen Cyber.** Singapore-based, APAC focus; hosted the first international smart-contract CTF that included Move. Web3 + Web2 hybrid posture (threat detection and response, smart wallets).

**Verichains.** APAC leader, $50B+ secured, 200+ clients (BNB Chain, Klaytn, Wemix, Line Corp, Axie Infinity, Ronin, Kyber). Built and open-sourced **Revela**, the first Move bytecode decompiler; cryptography, key management, and redteam services beyond pure code review.

### 3.6 Open-source detector toolchains

**Slither.** Industry-default Solidity SAST, 80+ detectors. **Slither-MCP** (Nov 2025) wraps it as an MCP server, turning it into a tool any LLM agent can call reliably; latest release Jan 2026.

**Mythril.** OSS bytecode-level symbolic execution that reaches any EVM-compatible chain (Ethereum, Hedera, Quorum, Vechain, Roostock, Tron). Slower than modern fuzzers but unique in needing only bytecode.

**Aderyn (OSS core).** See 3.1.

**Halmos.** "Bring your own Foundry tests, get formal verification." v0.3 (Oct 2025) added stateful invariants, lcov coverage, and call flamegraphs — lowest-friction symbolic-testing onramp because users write normal Foundry tests, not specs.

**hevm.** Mature symbolic EVM engine maintained by the Ethereum Foundation FV team (forked from dapptools). Supports symbolic unit testing of Forge suites and equivalence checking; often the engine inside other tools.

**Echidna.** OSS coverage-guided property-based fuzzer with 168 prebuilt properties. Industry-wide reference for invariant testing.

**Medusa.** OSS parallel coverage-guided mutational fuzzer in Go — Trail of Bits' "new Echidna" (claimed 5–7x faster, leverages Slither for smart mutational generation), now the internal default at ToB in 2026.

**Foundry.** The substrate — Forge, Cast, Anvil, Chisel. Effectively every serious Solidity project runs on it, meaning every audit/SAST tool ultimately round-trips to a Forge test.

---

## 4. White space — where Silica can win

For each gap below: the concrete unmet need, who's closest, and what Silica would need to credibly own it.

### 4.1 Auto-PoC for non-EVM chains

**Gap.** Auto-PoC is exclusively EVM today. Cecuro, Sherlock AI, Olympix, and the academic PoCo / A1 / V2E frameworks all emit **Foundry-compatible** exploits. On Solana, Sec3 X-Ray detects 50+ vuln classes but does **not** synthesize executable exploits; OtterSec/Neodyme deliver SVM PoCs manually. On Move, MoveBit/Verichains/Numen deliver manual PoCs only — no AI auto-PoC tool exists.

**Closest.** Sec3 (SVM detection + monitoring, no exploit synthesis); OtterSec (manual PoCs); Almanax (Move agents with Aptos Labs, PoC status unverified).

**Need.** Target-runtime executors for SVM (Anchor + raw program flows) and Move (Aptos and Sui dialects). The PoCo Reason-Act-Observe loop ports cleanly if the runtime is real (validator-grade, not mock). Heavy infra bet, but no incumbent is doing it.

### 4.2 Multi-VM unified platforms

**Gap.** No platform has real depth on EVM **and** SVM **and** Move. Mono-VM is the rule: EVM (ToB, Olympix, Cecuro, Octane, Sherlock AI, Cyfrin, OZ); SVM (Sec3, OtterSec, Neodyme); Move (MoveBit, Verichains, Numen). Marketplaces span chains via researchers but their platform tooling is EVM-first. ChainGPT/Cecuro claim "all chains" with EVM-only published benchmarks. Hypernative monitors 60+ chains but is detect-and-respond, not audit.

**Closest.** Quantstamp (EVM/Solana/Flow/Cardano via human services); Halborn (EVM/SVM/Move/Cosmos via human services). Both services-shaped, not platform-shaped.

**Need.** Either (a) per-VM agent stacks with a unified report layer and severity taxonomy, or (b) an LLM-orchestration layer that delegates to the strongest per-VM OSS tool (Slither / Aderyn / Sec3 X-Ray / Move Analyzer + Move Prover) and aggregates findings into one normalized model. (b) is cheaper and matches the Slither-MCP / ToB direction of the field.

### 4.3 Continuous monitoring + auto-PoC combined

**Gap.** Today these are separate vendors. Hypernative/Forta/ChainPatrol monitor; they don't proactively generate exploits against the deployed set. Cecuro/Olympix/Sherlock AI generate PoCs at audit time; they don't re-run continuously in production. When a new vuln class drops (EIP-7702, 4337, cross-domain), no system says "re-PoC every contract you own against this new class right now."

**Closest.** Olympix Integrity (PoC engine + monitoring under one vendor, small monitoring footprint); Sec3 (X-Ray + WatchTower, SVM-only).

**Need.** A scheduler that re-runs the auto-PoC engine against every customer-deployed contract on a cadence (per new heuristic, or weekly), with diff'd findings into the same incident channel as the runtime monitor. Operationally novel, not technically novel.

### 4.4 Hybrid on-chain + off-chain perimeter

**Gap.** No entrant covers the full Web3 attack surface. Smart-contract code — every audit firm. Frontend/XSS/token-approval UI — Halborn alone (as manual pentest). RPC/node infra — partly Tenderly. CI/secrets/supply-chain — Almanax (AppSec-shaped); nobody crypto-native. Multisig OSINT (signer compromise via social, leaked PII, key reuse) — no productized tooling. Phishing/brand/domain takedowns — ChainPatrol alone. Governance forum and social manipulation — Hypernative monitors, ChainPatrol monitors brand, nobody synthesizes. A $500M-TVL protocol today buys four vendors with four incident inboxes.

**Closest.** Halborn (broadest perimeter, services-shaped and expensive); Hypernative (best on-chain + some off-chain, but no code review / no PoC).

**Need.** OSINT pipeline (multisig signer footprinting), domain / cert-transparency monitor, CI/secrets-scanner adapter, frontend XSS testing. The hardest gap because it requires non-crypto-native capabilities — but it is where buyers concentrate budget. A focused wedge (code + multisig OSINT + CI secrets) lands in unowned territory.

### 4.5 Self-improving heuristic library across audits

**Gap.** Every AI auditor today has a private, proprietary detector/heuristic library. The library improves only when the vendor's own auditors mine new patterns. There is **no shared, append-only "lessons learned" library that grows with every audit and incident across all customers**. Slither has community detectors but ad hoc. Echidna's 168 prebuilt properties are hand-curated by ToB. ToB's "secure-contracts" repo is reference material, not a live engine. The Solodit / Sherlock issues database is searchable but not feeding any AI auditor as live priors.

**Closest.** Cyfrin Aderyn (community detector PRs); Slither-MCP (community detectors). Both depend on humans writing detector code.

**Need.** A pipeline that, on every audit/incident, extracts the abstract attack pattern and lands it as (a) a vector embedding usable by the agent's retrieval layer, (b) optionally a hand-coded detector. Each audit improves the next. With opt-in customer policy this becomes a flywheel no other vendor has.

### 4.6 Open benchmark harness with reproducible eval

**Gap.** EVMBench (OpenAI + Paradigm + OtterSec, Feb 2026) is the first credible public benchmark, but it's EVM-only, 40 cases, and is already being gamed (see arXiv 2603.10795 "Re-Evaluating EVMBench"). For SVM and Move there is **no public benchmark at all**. Vendor self-claims dominate: Cecuro 87.7% on EVMBench (verifiable since open); Olympix "300% better than OSS" (not reproducible); Sherlock AI "first AI $2.4M mainnet bug" (anecdotal); CertiK 88.6% on 35 incidents (vendor self-eval); Hypernative 99.5% / <0.001% FP / $2B saved (vendor totals).

**Closest.** EVMBench team; Cecuro publishing on it; OpenZeppelin's "We Audited OpenAI's EVMBench" follow-up.

**Need.** A reproducible multi-VM benchmark harness — versioned fixtures, real CVE-grade vulns, deterministic runner, public leaderboard for both detect and exploit tasks, holdout sets, and a "no training on the benchmark" pledge. If Silica ships the benchmark *and* posts a competitive score on it, it acquires both technical credibility and narrative ownership of "the open benchmark."

---

## 5. Strategic synthesis for Silica

If Silica had to pick the most defensible white-space combination, the
ranking by leverage-vs-effort is roughly:

1. **Self-improving heuristic library** (4.5) — flywheel that compounds, modest
   infra, hard for a competitor to copy after launch.
2. **Open multi-VM benchmark harness** (4.6) — narrative ownership, low cost,
   high signal, draws community contributions.
3. **Auto-PoC for SVM and Move** (4.1) — heaviest infrastructure bet, but
   genuinely unowned territory and high willingness-to-pay.
4. **Continuous + auto-PoC combined** (4.3) — operational integration play
   on top of (1)+(3), moderate effort.
5. **Hybrid perimeter** (4.4) — biggest TAM but requires non-crypto-native
   capabilities (OSINT, domain monitoring, CI scanning); risks brand drift.
6. **Multi-VM unified platform** (4.2) — large surface, but the "delegate to
   OSS leaders + unify the report" path is well-trodden by Trail of Bits and
   does not by itself create a moat.

The combination **(1) self-improving library + (3) non-EVM auto-PoC + (4.6)
open benchmark** is the cleanest defensible wedge: each strengthens the others,
none of the incumbents are doing more than one of the three today, and all
three reinforce a single narrative — "the auditor that gets better every time
anyone gets exploited, in any VM, and we publish how we measure ourselves."

---

## 6. Sources

### AI audit agents
- Cecuro: https://chainwire.org/2026/04/16/ai-audit-firm-cecuro-outperforms-nearest-rival-by-2x-on-openai-smart-contract-exploit-benchmark/, https://cecuro.ai/blog/smart-contract-audit-cost-2026
- Olympix: https://olympix.ai/, https://olympix.security/enterprise-tools, https://www.olympix.ai/blog/from-input-testing-to-economic-verification-the-evolution-of-smart-contract-fuzzing
- Cyfrin Aderyn: https://www.cyfrin.io/blog/find-vulnerabilities-in-your-solidity-codebase-using-cyfrin-aderyn, https://github.com/Cyfrin/aderyn
- Nethermind AuditAgent: https://auditagent.nethermind.io/, https://www.nethermind.io/blog/how-nethermind-security-uses-auditagent-alongside-manual-audits, https://auditagent.nethermind.io/blog/using-ai-assisted-security-analysis-on-the-cmtat-case-study-of-how-cmta-and-ubs-have-used-nethermind-s-auditagent-on-cmtat-contracts
- Pessimistic.io: https://pessimistic.io/, https://pessimistic.io/services/smart-contract-audit
- ChainGPT: https://docs.chaingpt.org/ai-tools-and-applications/ai-smart-contract-auditor, https://www.chaingpt.org/smart-contract-auditor
- Hacken: https://hacken.io/services/blockchain-security/smart-contract-security-audit/, https://hackenproof.com/security-ai-agents/nethermind-auditagent
- OpenZeppelin Defender: https://docs.openzeppelin.com/defender, https://www.openzeppelin.com/news/doubling-down-on-open-source-and-phasing-out-defender
- Octane: https://www.octane.security/, https://www.octane.security/post/octane-seed-round
- Almanax: https://almanax.ai/, https://www.cbinsights.com/company/almanax
- Sherlock AI: https://sherlock.xyz/solutions/ai, https://sherlock.xyz/post/introducing-sherlock-ai
- CertiK: https://www.certik.com/products/skynet, https://www.crowdfundinsider.com/2026/04/273472-ai-smart-contracts-now-leveraging-machine-learning-autonomous-agents-certik/

### Human firms with AI tooling
- Trail of Bits: https://blog.trailofbits.com/2026/03/31/how-we-made-trail-of-bits-ai-native-so-far/, https://blog.trailofbits.com/2025/11/15/level-up-your-solidity-llm-tooling-with-slither-mcp/, https://trailofbits.com/services/software-assurance/blockchain/
- Spearbit / Cantina: https://cantina.xyz/welcome, https://cantina.xyz/solutions/competitions, https://cantina.xyz/solutions/spearbit
- Halborn: https://www.halborn.com/, https://www.halborn.com/solutions/smart-contract-audits
- Quantstamp: https://quantstamp.com/, https://quantstamp.com/audits, https://quantstamp.com/blog/smart-contract-audit-cost
- Consensys Diligence: https://diligence.security/, https://github.com/ConsenSysDiligence/mythril, https://consensys.io/mythx/enterprise

### Marketplaces
- Sherlock: https://sherlock.xyz/, https://sherlock.xyz/solutions/audit-contests, https://sherlock.xyz/solutions/collaborative-audits, https://www.theblock.co/press-releases/397376/sherlock-and-ripple-launch-550k-security-audit-contest-to-secure-upcoming-features-on-the-xrp-ledger
- Code4rena: https://code4rena.com/, https://code4rena.com/competitive-audit, https://www.zellic.io/blog/code4rena-free-contests/
- Cantina: see Spearbit row
- Immunefi: https://immunefi.com/bug-bounty/, https://decrypt.co/111142/blockchain-builders-need-bug-bounty-programs-immunefi-engineer

### Continuous monitoring / SecOps
- Hypernative: https://www.hypernative.io/, https://www.hypernative.io/products/hypernative-platform, https://www.hypernative.io/blog/the-real-time-advantage-security-as-strategy
- Forta: https://docs.forta.network/en/latest/getting-started/, https://www.forta.org/blog/forta-for-beginners, https://docs.forta.network/en/latest/how-forta-works/
- ChainPatrol: https://chainpatrol.com/, https://metamask.io/news/metamask-chainpatrol-protect-users-with-phishing-warnings, https://chainpatrol.com/about
- Olympix Integrity: https://olympix.security/, https://olympix.security/blog/smart-contract-audit-limitations-why-audited-doesnt-mean-secure
- Tenderly: https://tenderly.co/, https://tenderly.co/monitoring, https://cryptoadventure.com/tenderly-review-2026-simulation-debugging-virtual-testnets-and-monitoring-for-web3-teams/

### Chain-specialist firms
- Sec3 / Soteria: https://sec3.dev/, https://sec3.dev/blog/announcing-x-ray-premium-auto-auditor-for-solana-smart-contracts, https://github.com/sec3-product/x-ray, https://www.sec3.dev/blog/sec3-pro-auto-auditor
- OtterSec: https://osec.io/, https://m3dython.com/blog/ottersec-review-2026
- Neodyme: referenced via https://github.com/sannykim/solsec and https://www.zealynx.io/blogs/solana-2026-security
- MoveBit: https://www.movebit.xyz/, https://www.movebit.xyz/blog/post/BitsLabs-MoveBit-Releases-Latest-Versions-of-Aptos-and-Sui-Move-Analyzers.html, https://www.movebit.xyz/blog/post/Securing-the-Aptos-Framework-through-formal-verification.html
- Numen Cyber: https://www.numencyber.com/, https://www.numencyber.com/web3-security/, https://www.numencyber.com/numen-successful-ctf/
- Verichains: https://verichains.io/, https://www.alchemy.com/dapps/verichains

### OSS detector toolchains
- Slither: https://github.com/crytic/slither, https://blog.trailofbits.com/2018/10/19/slither-a-solidity-static-analysis-framework/, https://blog.trailofbits.com/2025/11/15/level-up-your-solidity-llm-tooling-with-slither-mcp/
- Mythril: https://github.com/ConsenSysDiligence/mythril, https://mythx.io/
- Aderyn: https://github.com/Cyfrin/aderyn (see also Cyfrin Aderyn row)
- Halmos: https://github.com/a16z/halmos, https://a16zcrypto.com/posts/article/halmos-v0-3-0-release-highlights/, https://a16zcrypto.com/posts/article/symbolic-testing-with-halmos-leveraging-existing-tests-for-formal-verification/
- hevm: https://github.com/argotorg/hevm, https://hevm.dev/, https://fv.ethereum.org/2020/07/28/symbolic-hevm-release/
- Echidna: https://github.com/crytic/echidna, https://blog.trailofbits.com/2022/12/08/hybrid-echidna-fuzzing-optik-maat/
- Medusa: https://github.com/crytic/medusa, https://blog.trailofbits.com/2025/02/14/unleashing-medusa-fast-and-scalable-smart-contract-fuzzing/
- Foundry: https://github.com/foundry-rs/foundry, https://www.getfoundry.sh/

### Benchmarks and academic
- EVMBench: https://github.com/paradigmxyz/evmbench, https://openai.com/index/introducing-evmbench/, https://cdn.openai.com/evmbench/evmbench.pdf, https://www.helpnetsecurity.com/2026/02/19/evmbench-open-source-benchmark-ai-agents/
- EVMBench critical eval: https://arxiv.org/abs/2603.10795, https://www.openzeppelin.com/news/openai-evmbench-audit
- PoCo (auto-PoC research): https://arxiv.org/html/2511.02780v3
- A1 / V2E (auto-PoC research): https://arxiv.org/html/2507.05558v1, https://arxiv.org/html/2604.13611
- SmartLLM / LLM-SmartAudit: https://arxiv.org/html/2502.13167v1, https://arxiv.org/abs/2410.09381
- Market context (Sherlock pricing, Zealynx): https://sherlock.xyz/post/smart-contract-audit-pricing-a-market-reference-for-2026, https://www.zealynx.io/blogs/audit-pricing-2026

---

## 7. Open items to verify before Silica positioning is final

1. Cecuro's actual chain coverage beyond EVM (claims "all blockchains" — find a customer or a non-EVM benchmark).
2. Olympix and Octane public pricing.
3. Sec3 X-Ray Premium pricing tiers.
4. Hacken AI internal tooling specifics — is "Bouncer" still the public product name in 2026?
5. Forta 2026 network metrics (last public counts are 2022).
6. Whether any vendor besides Olympix and Sec3 has shipped continuous-PoC-on-deployed-contracts in production.
7. Confirm Sherlock AI's $2.4M mainnet-bug claim with a third-party post-mortem.
8. Confirm CertiK AI Auditor's 88.6% number with an external evaluation, not the vendor's internal eval.
