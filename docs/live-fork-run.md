# Live-fork bench run procedure

The bench harness runs in two modes:

- **Mock mode** (default, no env): validates fixture + expected-finding JSON shape only. Ships green out of the box.
- **Live mode**: drives the full audit-job pipeline (`src/orchestrator/runner.ts`) against the real chain via an archive RPC. This is what actually validates Silica end-to-end.

This document is the procedure for running live mode against the v1 EVM bench corpus and validating the FINAL.md residual risk #1 ("live-fork integration tests not verified").

## Prerequisites

- An archive-node RPC URL for Ethereum mainnet. Alchemy, Infura, QuickNode, or self-hosted Erigon all work — the bench replays state at exact historic blocks (e.g. Euler at block 16817993), so a non-archive node will fail with `Missing trie node`.
- An Etherscan API key for source-fetch fallback when Sourcify lacks the contract.
- An Anthropic API key for the analyzer/prover/skeptic agents.
- Docker — the Slither and Foundry tool runners shell out to containers per `notes.md §17.10` (container-level isolation for tool execution).

## One-shot setup

```bash
export FORK_URL="https://eth-mainnet.g.alchemy.com/v2/<YOUR_KEY>"
export ETHERSCAN_API_KEY="<YOUR_KEY>"
export ANTHROPIC_API_KEY="sk-ant-..."
# Optional — defaults to anthropic-no-retention
export TRUST_TIER="anthropic-no-retention"
```

## Run

```bash
# Single case (recommended first — Euler is the lowest-difficulty regression-grade case)
npm run bench:evm -- --case euler

# Full EVM corpus (16 cases — expect ~30–60 minutes wall time depending on archive RPC latency)
npm run bench:evm

# Generate a fresh score-sheet from the live results
FORK_URL=... npm run score-sheet:generate
# The score-sheet will record `mode: live`.
```

## Expected behavior

For each case the runner walks the audit-job state machine through:
`pending → fetching → compiling → static-analyzing → analyzer-pass → prover-pass → skeptic-pass → consolidating → persisting → completed`

A `[PASS]` per case requires:
1. `tools/source-fetch` resolved the contract source from Sourcify or Etherscan.
2. `tools/slither` ran inside Docker and emitted normalized findings.
3. The `AnalyzerAgent` emitted at least one Finding whose `class.taxonomy_id` matches the case's `expected-finding.json`.
4. The `ProverAgent` generated a Foundry PoC that the runner wrote to a tmpdir and executed via `tools/foundry` against the fork — `--fork-block <fixture.block> --fork-url <FORK_URL>`.
5. The `SkepticAgent` review did not return `verdict: failed`.

## Regression discipline

After a successful live run, snapshot the baseline:

```bash
python3 bench/regression-check.py --update-baseline
```

Subsequent runs (`python3 bench/regression-check.py`) exit non-zero if any case that previously passed now fails, recall drops, or `avg_cost_usd` rises by more than 20%.

## SVM live mode

SVM live mode is wired but has a different prerequisite: `fixture.json` must include a `program_path` field pointing at a local checkout of the open-source program at the exploit slot. The five v1 SVM cases (Cashio, Crema, Mango, OptiFi, Wormhole-Solana) ship without `program_path` because Crema is closed-source and the others need their pre-exploit-commit repos staged out-of-band. The runner short-circuits to `mock` for any case missing `program_path`.

```bash
export SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"  # Or a Helius / QuickNode mainnet URL
npm run bench:svm
```

## Troubleshooting

- **`Missing trie node` from forge** — the archive RPC isn't actually serving archive depth. Switch to a Tier-3 Alchemy / Infura plan or self-hosted Erigon with `--prune.h.older=disabled`.
- **`429 Too Many Requests` from Etherscan** — the API key's free-tier quota is exhausted. Either upgrade or rerun with `--case <one-id>` to space requests out.
- **Slither container hangs** — the source-fetch step wrote a Solc version Slither's container can't pin. Check `tools/slither/run.py` log output; the manifest's `compiler_version` field should match an installed Solc.
- **Anthropic 429 / 529** — the gateway retries with exponential backoff per `src/llm/anthropic-gateway.ts`. If the run still fails, check the rate-limit dashboard for your org.

## What live mode validates

A green live-fork run is the difference between "Silica's code compiles and types are right" and "Silica actually finds the bugs we say it finds." This is the procedure to discharge FINAL.md open risk #1 — until it has been run successfully against ≥1 EVM case end-to-end on real fork state, that risk stays open.
