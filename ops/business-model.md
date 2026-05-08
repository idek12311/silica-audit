# Business Model — v0 sketch

> Three-layer model: open-source community → self-serve subscription → enterprise audits. Differentiation: heuristic library compounds across all tiers; enterprise gets private library, community feeds shared library.

## Layer 1 — Open-source baseline

**What we publish:**
- The audit harness scaffold (orchestrator, tool runners, finding schema, validation tier framework)
- A baseline agent (similar to what Cecuro published — basic loop, decent prompts, working-but-not-best-in-class)
- The bench corpus + eval framework
- The full taxonomy and a public heuristic pool seeded from public exploits

**What we hold back:**
- Production agent prompts and routing policies
- Production heuristic library (the curated, FP-tuned version)
- Tenant-specific extensions
- Continuous monitoring infrastructure
- Off-chain perimeter agents (operationally sensitive)

**Why this layer exists:**
- Community adoption builds the market and recruiting funnel.
- Open eval framework lets researchers reproduce numbers (defense against "Cecuro's 87.7% is structurally unverifiable" — see `research/cecuro-deep-dive.md`).
- Open contributions feed the public heuristic pool.
- Cecuro played this card; we should match to avoid being the "closed" alternative — and surpass them by publishing precision/recall/FP numbers, not just recall.

**Revenue from this layer:** $0 directly. Indirect: brand, community, talent.

## Layer 2 — Self-serve subscription (continuous)

**Product:** Web dashboard + GitHub app. Connects to a protocol's repo. On every commit:
- Material-change detector decides whether to run the audit pipeline.
- If material: full pipeline runs at R0–R3 cheap path; flags high-confidence findings; emails the team.
- Optional: deeper validation (R4–R5) on changed code regions.

**Target customers:** small-mid DeFi protocols ($1M–$50M TVL), DAOs, NFT projects, community-built infra.

**Pricing:**
| Tier | Volume | Validation depth | Price |
|---|---|---|---|
| Solo | 1 repo, 5 audits/mo | R0–R3 cheap | $99/mo |
| Team | 5 repos, 30 audits/mo | R0–R5 + R9 fuzz | $499/mo |
| Pro | 20 repos, 200 audits/mo | Full ladder | $2,499/mo |

**Cost shape:** marginal cost ~$15–80 per medium audit (per `design/cost-model.md`). At Solo tier ($99 → 5 audits → $20/audit budget), Solo is loss-leader for Team upgrade. Team tier is gross-margin positive even at high usage.

**Differentiation:** Cecuro doesn't sell continuous. Olympix Integrity does; Hypernative does monitoring (not auto-PoC); we compete on ladder-depth + auto-PoC + hybrid perimeter.

## Layer 3 — Enterprise audits

**Product:** Engagement-priced full audit with custom agent specialization, dedicated Solidity SME assist, off-chain perimeter coverage, multi-VM if applicable.

**Target customers:** large protocols ($100M+ TVL), L1/L2 foundations, exchanges, custodians.

**Pricing:**
| Engagement | Price |
|---|---|
| Pre-launch audit, medium codebase | $25K–$80K |
| Production audit, large codebase | $80K–$250K |
| Mega-protocol full perimeter | $250K–$1M |

**Margin shape:** marginal cost <15% of price; ~85% gross margin.

**Differentiation vs traditional firms (Trail of Bits, Spearbit, Halborn):**
- Hours not weeks (Cecuro's value proposition)
- Auto-PoC
- Continuous re-audit included for 6 months post-engagement
- Multi-VM coverage
- Off-chain perimeter included by default

**Differentiation vs Cecuro:**
- Off-chain perimeter
- Multi-VM (Solana, Move, Cairo)
- Continuous monitoring extension
- Open eval framework with precision/recall/FP measurement
- Reproducible benchmark numbers

## Cross-layer compound effect

Layer 1 feeds Layer 2 and 3:
- Open-source baseline drives developer mindshare (free distribution).
- Public heuristic pool grows from community contributions.
- Bench corpus expands as users contribute exploits to the public eval set.

Layer 2 feeds Layer 3:
- Self-serve users' confirmed findings feed the shared heuristic pool (with consent + sanitization).
- High-volume self-serve usage tunes the harness's prompts and routing policies, which improve Layer 3 quality.

Layer 3 feeds Layer 2 and 1:
- Enterprise findings (sanitized) feed the shared heuristic pool.
- Enterprise feedback drives roadmap.

## Heuristic library as moat

After 1000+ audits across all layers:
- Public pool: ~5,000 heuristics
- Shared pool (opt-in): ~3,000 additional
- Per-enterprise private pool: 100–500 heuristics each

A new entrant trying to compete would have to bootstrap 8,000 heuristics from scratch. The library is the compounding asset.

Cecuro's prompts can be matched in months; a heuristic library cannot.

## Revenue projection — first 24 months (rough)

| Quarter | Self-serve MRR | Enterprise revenue | Total ARR run-rate |
|---|---|---|---|
| Q1 | $5K | $0 | $60K |
| Q2 | $15K | $50K | $230K |
| Q3 | $40K | $200K | $680K |
| Q4 | $80K | $500K | $1.46M |
| Q5 | $150K | $1M | $2.8M |
| Q6 | $250K | $2M | $5M |
| Q7 | $400K | $4M | $8.8M |
| Q8 | $600K | $7M | $14.2M |

This is rough — depends heavily on enterprise deal closure rate, which depends on benchmark numbers (back to: benchmark from day one).

## Distribution and go-to-market

### Phase 1 — Open-source launch (months 0–3)
- Publish baseline agent + eval framework + bench corpus
- Submit to OpenAI's Frontier Eval suite
- Run public benchmark vs Cecuro's DVBench (where reproducible) and EVMBench
- Position: "the open, reproducible, multi-VM AI audit"
- Channels: GitHub, Twitter/X, Ethereum Magicians, Solana Cookbook contributors, Move community

### Phase 2 — Self-serve launch (months 3–9)
- Web dashboard + GitHub app
- 14-day free trial → Solo conversion
- Target: 100 active self-serve protocols by month 9
- Channels: ProductHunt, dev.to, Twitter/X case studies, ETHGlobal hackathons

### Phase 3 — Enterprise sales (months 6–24)
- Direct outreach to top-200 DeFi protocols by TVL
- Foundation partnerships: Ethereum, Solana, Aptos, Sui foundations for grant-funded VM expansion
- Marketplace partnerships: integrate as a tool option in Sherlock, Code4rena, Cantina
- Channels: in-person events (DevConnect, Solana Breakpoint, Token2049, etc.)

## Pricing comparison reference

(From `research/cecuro-deep-dive.md` and `research/competitor-matrix.md`.)

| Vendor | Audit pricing |
|---|---|
| Cecuro | $2,999 (≤100 LoC) / $6,999 (>100 LoC) flat |
| Trail of Bits | ~$80K-$300K manual |
| Spearbit | $30K-$150K manual |
| Halborn | $25K-$200K manual |
| Code4rena (marketplace) | $10K-$200K (split among auditors) |
| Sherlock (marketplace) | $20K-$500K with judging |
| **Silica self-serve** | **$99-$2,499/mo subscription** |
| **Silica enterprise** | **$25K-$1M engagement** |

## Open business decisions for v1

1. **Marketplace integration:** integrate with Sherlock / Code4rena / Cantina, or compete? (Probably integrate as a tool; competing on the marketplace front is a different go-to-market.)
2. **Bug-bounty share program:** if Silica-discovered bugs are paid out via Immunefi, do we take a share?
3. **Insurance partnership:** team up with Nexus Mutual / Sherlock Shield for "audit + insurance" bundle?
4. **Foundation partnerships:** Ethereum Foundation, Solana Foundation, Aptos Foundation, Sui Foundation for grant-funded multi-VM expansion?
5. **Cybersecurity-firm partnerships:** off-chain perimeter overlaps with mainstream cyber. Partner with mainstream cyber firms vs build standalone?
6. **Sherlock Shield-style coverage product:** Sherlock has the only audit+insurance bundle in the market; should Silica build similar or partner?

## Differentiation play summary

Cecuro: best-in-class on EVM patterns, currently #1 on EVMBench (a benchmark they did NOT author and which has known measurement issues). Their bench (DVBench) measures recall only; no precision; reference findings are LLM-generated. Beating them on EVMBench is mostly a prompt-tuning game; the moat is shallow.

Silica: bet the moat on **breadth + reproducibility + compounding**. Multi-VM, hybrid perimeter, continuous monitoring, open eval, growing heuristic library. Each axis is moderately defensible; combined they're hard to copy.

Risk: in 12-24 months, Cecuro adds multi-VM and continuous, eroding our positional differentiation. Mitigation: heuristic library compounds during that window. By the time they catch up on axis-coverage, we have a 2,000+ heuristic library they don't.
