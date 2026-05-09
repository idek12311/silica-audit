# Silica — Open-Source Security Audit Platform

Silica v1 open-source layer: bench corpus, eval framework, and baseline agent.

## What's here

- `bench-corpus/` — Regression fixtures for 11 known-exploited DeFi protocols (6 EVM + 5 SVM). Each case includes a fixture.json with block/slot anchor and an expected-finding.json with the bug class taxonomy, severity, and heuristic citations.
- `eval-framework/` — Runner scripts and check utilities for running your own audit harness against the bench corpus.
- `baseline-agent.ts` — The simplest possible Silica-compatible analyzer agent. Uses the Anthropic SDK with prompt caching and the open-source heuristic library.

## Quick start

```bash
npm install
# Set ANTHROPIC_API_KEY and FORK_URL
MODEL_FALLBACK_MODE=mock npm run bench:evm   # Run in mock mode without a real fork
```

## Bench corpus format

Each bench case folder contains:
- `fixture.json` — protocol metadata, vulnerable contract address, block anchor
- `expected-finding.json` — the finding the harness should emit

See `bench/heuristic-id-convention.md` for the stable heuristic ID scheme.

## Methodology

Silica uses a validation tier ladder (R0–R10) to bound finding confidence:
- R0 static-signal-only → confidence ceiling 0.60
- R3 fork-execution-state-asserted → ceiling 0.92
- R5 multi-tx-orchestrated → ceiling 0.92

Results are reproducible: every audit pins a full toolchain manifest (Solc version, Foundry version, Slither version).

## License

Apache 2.0. See [LICENSE](LICENSE).

## Contributing

Bug class additions go through heuristic-id-convention.md. New bench cases require:
- fixture.json with verified on-chain address + block/slot
- expected-finding.json citing at least one heuristic
- An exploit PoC (Foundry .t.sol or Anchor .ts test)
