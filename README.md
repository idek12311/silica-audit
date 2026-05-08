# Silica

> VM-and-source-agnostic vulnerability platform for smart-contract auditing.

Silica is a multi-agent platform that audits smart contracts (EVM, Solana SVM, Move, Cairo) and the off-chain infrastructure around them, using a unifying spine that lets every front (multi-VM, continuous monitoring, off-chain perimeter, invariant fuzzing, self-improving heuristics) compound rather than splinter.

This repo currently holds **design documentation only**. No production code. The spec phase begins after the design docs round-trip cleanly against the bench corpus stressors.

## Status

| Area | Status | Path |
|---|---|---|
| Information pool / design dialogue | living | [`notes.md`](notes.md) |
| Finding schema draft | round-tripped against 8 stressors (1 gap → v0.1 migration locked) | [`design/schema-draft-v0.md`](design/schema-draft-v0.md) |
| Schema additional stressors | 5 more cases; BadgerDAO exposed off-chain gap | [`design/schema-stressors-v0.md`](design/schema-stressors-v0.md) |
| Validation tier ladder | 11 rungs enumerated | [`design/validation-tiers.md`](design/validation-tiers.md) |
| Heuristic library schema | drafted | [`design/heuristic-schema.md`](design/heuristic-schema.md) |
| Multi-VM stress test (SVM) | passed | [`design/multi-vm-svm-sketch.md`](design/multi-vm-svm-sketch.md) |
| Cost model | drafted with napkin math | [`design/cost-model.md`](design/cost-model.md) |
| Off-chain perimeter playbook | 8 surfaces documented | [`ops/perimeter-playbook.md`](ops/perimeter-playbook.md) |
| Legal & compliance framing | 10 risks enumerated | [`ops/legal-framing.md`](ops/legal-framing.md) |
| Business model | three-layer model sketched | [`ops/business-model.md`](ops/business-model.md) |
| Cecuro deep dive | source-level analysis | [`research/cecuro-deep-dive.md`](research/cecuro-deep-dive.md) |
| Competitor matrix | 36+ entrants | [`research/competitor-matrix.md`](research/competitor-matrix.md) |
| Bug taxonomy | 58 entries across 18 categories | [`research/bug-taxonomy.md`](research/bug-taxonomy.md) |
| Bench corpus | in progress | [`research/bench-corpus.md`](research/bench-corpus.md) |
| Exploit case studies | 11 deep-dives | [`research/case-studies/`](research/case-studies/) |
| External deep-research architecture doc | captured + critical review | [`research/deep-research-architecture.md`](research/deep-research-architecture.md) |

## Core architecture (one-pager)

**Spine — four primitives, all VM-agnostic:**
1. **Finding** — normalized JSON emitted by every detection path. See [`design/schema-draft-v0.md`](design/schema-draft-v0.md).
2. **Execution Proof** — per-VM validator implementing a common contract. Foundry on EVM, Anchor on SVM, Move Prover on Move.
3. **Heuristic** — versioned, citable detection rule. See [`design/heuristic-schema.md`](design/heuristic-schema.md).
4. **Bench Case** — every confirmed finding becomes a regression test forever.

**Five extension surfaces:**
- Tool plugin
- Agent plugin
- VM plugin
- Heuristic library
- Benchmark cases

**Five runtime routers:**
- Tool, Escalation, Model, Agent, Validation. See `notes.md` §6.

**Validation tier ladder:** 11 rungs from `static-only` to `formal-proof`. See [`design/validation-tiers.md`](design/validation-tiers.md).

## Differentiation vs Cecuro

Cecuro: best-in-class on-chain pattern detection on EVM. Their famous "87.7% on EVMBench" headline turns out to be a benchmark they did NOT author (it's OpenAI/Paradigm/OtterSec's). Their own bench, DVBench, measures recall only with synthetic LLM-generated reference findings — see [`research/cecuro-deep-dive.md`](research/cecuro-deep-dive.md) for source-level dissection. Crowded axis with shallow moat.

Silica competes on:
- **Multi-VM native** (SVM, Move, Cairo) — Cecuro is EVM-only
- **Hybrid on-chain + off-chain perimeter** — Cecuro doesn't cover frontend, RPC, CI, multisig OSINT
- **Continuous / live audit** — Cecuro is point-in-time only
- **Invariant-first depth** — most agents pattern-match; few do real invariant synthesis + fuzzing
- **Self-improving heuristic library** — compounds across audits; Cecuro's prompts don't compound this way
- **Open eval framework** — precision + recall + FP rate, not just recall on a held-back dataset

Substrate-first investment lets all five compound. See `notes.md` §7–9.

## Working assumptions

- Build from scratch. Do not fork Nexus or any other chat-platform infra.
- Spine before product. 2–3 months of substrate work before first shippable demo.
- Will lag Cecuro's EVM benchmark numbers for 6–12 months while substrate matures. Trade compounds long-term.
- Schema discipline is forever. Schema changes go through one owner.
- Hostile-input-by-default. Audit input is treated as adversarial; LLM prompt-injection defense is architectural, not a prompt trick.
- Benchmark from day one. Every prompt / agent / model change gates on the bench corpus.

## v1 commitments (locked)

Per `notes.md` §17:

- **v1 fronts:** EVM + SVM + off-chain perimeter (3 axes). v2 adds continuous monitoring + Move.
- **Non-EVM priority:** SVM. Move is v2.
- **LLM tier:** Anthropic no-retention as default; self-hosted vLLM for IP-sensitive engagements.
- **Heuristic library:** open-source baseline (~500 seed heuristics) + curated closed production library + per-tenant private pool.
- **Off-chain perimeter:** built-in for v1; HexStrike adapter as v2 fallback.
- **Continuous monitoring trigger:** triple-gate (bytecode-equivalence-fails OR storage-layout-changed OR external-call-graph-changed). v2 feature.
- **Canonicalization:** `sha256(rfc8785(subject_locator) || 0x1f || taxonomy_id || 0x1f || rfc8785(invariant_violated))`.
- **Plugin trust:** core / verified / community tiers; sandboxed execution per tier.
- **Multi-tenancy:** container-level for tool execution; process-level for orchestration.
- **Schema v0 → v0.1:** off-chain subject support added (motivated by BadgerDAO stressor).

Items still genuinely open are listed in `notes.md` §17.X.

## Read order for someone joining the project

1. **`notes.md`** — full thinking trail; read top-to-bottom or skim the table of contents.
2. **`README.md`** (this file) — orientation.
3. **`research/cecuro-deep-dive.md`** — what we're really up against (it's not what their press release says).
4. **`research/competitor-matrix.md`** — full landscape.
5. **`design/schema-draft-v0.md`** — the keystone artifact. Everything else hangs off this.
6. **`design/validation-tiers.md`** + **`design/heuristic-schema.md`** — the other two spine artifacts.
7. **`research/bug-taxonomy.md`** — 58 entries, the densest reusable artifact.
8. **`research/case-studies/INDEX.md`** — 11 real exploits the harness must catch.
9. **`design/multi-vm-svm-sketch.md`** — proof the spine isn't EVM-biased.
10. **`design/cost-model.md`** + **`ops/business-model.md`** — economics.
11. **`ops/perimeter-playbook.md`** + **`ops/legal-framing.md`** — operational reality.

## License

TBD before any code lands. Likely permissive (MIT/Apache 2.0) for the open-source layer, with a separate license for the production-proprietary components.
