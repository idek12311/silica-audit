# Cost Model — v0

> Per-audit and per-component cost projections for Silica. Used by the escalation router to enforce budgets and by Sales to price tiers.

## Audit size classes

| Class | Lines of code | Contracts/programs | Typical TVL |
|---|---|---|---|
| Small | <500 | 1–3 | <$1M |
| Medium | 500–5,000 | 4–10 | $1M–$50M |
| Large | 5,000–15,000 | 11–30 | $50M–$1B |
| Mega | >15,000 | 30+ | >$1B |

(Compound v3, Aave v3, Uniswap v4 ≈ Mega; most newcomer DeFi protocols ≈ Medium.)

## Cost components per audit

### 1. LLM token cost (dominant)

Per-agent-pass token math (medium audit):
- Static-analysis output (Slither + Mythril + Soteria) compiled into context: 30K tokens
- Source code chunks streamed: 20–80K tokens
- Heuristic library hits in context: 5–15K tokens
- Per-agent-pass: 50K input + 5K output

At Anthropic Sonnet 4.6 rates (~$3/MTok input, ~$15/MTok output): $0.225/pass
At Opus 4.7 rates (~$15/MTok input, ~$75/MTok output): $1.125/pass

Agent passes per medium audit:
- Recon agent: 1 pass
- 4–6 specialists × 2 passes each = 8–12 passes
- Prover agent: 1–2 passes per finding × ~5 findings = 5–10 passes
- Skeptic agent: 1 pass per finding = 5 passes
- Re-runs and escalations: 5–10 passes
- **Total: 24–37 passes**

LLM cost at cheap path (mostly Sonnet, occasional Opus): **$8–25**
LLM cost at full path (Opus-heavy): **$40–80**

### 2. Static analysis tool cost

CPU/process time. Slither/Mythril/Soteria/Aderyn run in Docker sandboxes.
- Slither: <1 minute, negligible cost
- Mythril: 5–30 minutes; CPU cost ~$0.10–0.30
- Soteria: <1 minute, negligible
- Halmos: minutes-hours; up to $1–3 per audit

Per medium audit: **$0.50–4**

### 3. RPC / fork costs

EVM:
- Alchemy archive node: ~$0.001 per RPC call, ~5,000 calls per fork validation = $5
- Free-tier alternatives (public RPC providers) work for non-archive blocks
- Per-finding fork validation: $0.50–2

Per medium audit (10–20 findings, fork validation each): **$5–40**

SVM: cheaper (~$0.10/snapshot), per-audit **<$5**.

### 4. Fuzzing cost

Echidna/Medusa run on commodity CPU. Per-invariant fuzz: typically 30 min – 4 hours of CPU at ~$0.04/CPU-hour spot pricing.

If the harness fuzzes 5–20 invariants per medium audit: **$2–20**.

Trident on SVM: similar cost shape, less mature.

### 5. Storage

Fork snapshots, PoC artifacts, heuristic lineage. ~50MB per audit. S3-class: <$0.01/audit.

**Per medium audit: <$0.10.**

## Per-class total cost

Cheap path (Sonnet-heavy, R0–R3 only):

| Class | LLM | Tools | RPC | Fuzz | Storage | **Total** |
|---|---|---|---|---|---|---|
| Small | $2–6 | $0.20–1 | $0.50–3 | $0.50–4 | $0.01 | **$3–14** |
| Medium | $8–25 | $0.50–4 | $5–40 | $2–20 | $0.10 | **$15–90** |
| Large | $40–120 | $5–20 | $30–200 | $20–80 | $1 | **$95–420** |
| Mega | $200–800 | $30–100 | $300–1,500 | $100–400 | $5 | **$635–2,800** |

Full path (Opus-heavy, R0–R5 + R9 fuzz):

| Class | LLM | Tools | RPC | Fuzz | Storage | **Total** |
|---|---|---|---|---|---|---|
| Small | $8–25 | $0.50–3 | $1–10 | $5–20 | $0.05 | **$15–60** |
| Medium | $40–80 | $2–15 | $20–80 | $20–60 | $0.50 | **$80–235** |
| Large | $150–400 | $20–80 | $80–400 | $80–200 | $3 | **$330–1,080** |
| Mega | $800–3,000 | $100–500 | $400–2,500 | $300–1,000 | $20 | **$1,620–7,020** |

## Pricing implications

Suggested pricing tiers (well above marginal cost — gross margin target ~85%):

| Tier | Audit size | Validation rungs | List price |
|---|---|---|---|
| Self-serve quick scan | Small | R0–R3 cheap path | **$99** flat |
| Pre-launch audit | Medium | R0–R5 full path | **$2,000–$8,000** |
| Production audit | Large | R0–R5 + R9 fuzz | **$15,000–$50,000** |
| Mega-protocol audit | Mega | Full ladder including R10 formal | **$80,000–$300,000** custom |
| Continuous monitoring | (any) | R0–R3 daily + R5 on commit | **$500–$5,000/mo** |

Margin target stays high because LLM and infra costs are <15% of price even at the deepest tier.

For comparison: Cecuro charges **$2,999** for ≤100 LoC audits and **$6,999** for >100 LoC audits flat (per Cecuro deep dive research). Our tier-based pricing maps roughly to: self-serve under their floor, pre-launch overlapping their >100 LoC tier, production audit clearly above their range. The "continuous monitoring" tier is a market they don't address.

## Budget enforcement

Each audit declares a `cost_ceiling_usd`. The escalation router:
- Tracks accumulated cost in real-time
- Refuses to escalate to higher rungs when projected cost would exceed ceiling
- Emits a "budget-truncated" status on the audit when truncation occurs
- Allows human override (sales-on-call) for borderline cases

Per-tool budgets: each tool declares cost shape (`cheap`, `medium`, `expensive`, `very-expensive`). The router prefers cheap-tier tools first; expensive tools only fire on R3+ candidates.

## Sensitivity analysis

What changes total cost most?
1. **Model selection.** Opus 4.7 vs Sonnet 4.6 = ~5x cost difference for similar tasks. Per-agent routing matters.
2. **Source size in context.** Bigger contracts = more context tokens. Caching matters: prompt caching can drop input cost ~10x for repeat reads.
3. **Number of agent passes.** Specialist count and re-run count are router decisions.
4. **Validation rung depth.** R9 fuzz is the biggest single line item if engaged.
5. **RPC provider choice.** Free-tier vs Alchemy archive: 100x difference for archive-heavy audits.

## Caching

Anthropic prompt caching: contract source + heuristic library context can be cached for 5 min. Per-audit savings: ~30–60% of input token costs once specialist agents start re-reading the same source.

The harness must structure prompts to maximize cache hits:
- Source code at front of prompt (cached across passes)
- Heuristic context next (cached across passes within audit)
- Per-agent task instructions at the end (not cached)

## Cost telemetry

Every audit emits a cost ledger:
```jsonc
{
  "audit_id": "aud_...",
  "size_class": "medium",
  "ladder_depth_reached": "R5",
  "components": {
    "llm_input_tokens": 1_240_000,
    "llm_output_tokens": 87_000,
    "llm_cost_usd": 22.40,
    "static_analysis_cpu_seconds": 412,
    "rpc_calls": 4_823,
    "fuzz_cpu_seconds": 8_412,
    "storage_mb": 47,
    "total_cost_usd": 38.20
  },
  "per_agent_breakdown": [ /* ... */ ],
  "per_finding_breakdown": [ /* ... */ ]
}
```

This feeds:
- Sales analytics (which clients drive most cost?)
- Engineering optimization (which agents/rungs cost most?)
- Pricing recalibration (per-class cost shape)
- Budget enforcement (running totals against ceiling)

## Open items for v1

- Real cost data from first 50 audits to calibrate.
- Per-bug-class cost shape (some bug classes need expensive fuzz; others are cheap pattern matches).
- Tenant-specific cost telemetry (some clients prefer cheap fast scans; some demand full ladder).
- Carbon footprint reporting (optional, but increasingly requested).
- Reserved-capacity pricing for enterprise (committed monthly volume → lower per-audit cost).
