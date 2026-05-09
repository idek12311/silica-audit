# Heuristic ID Convention — Frozen C1↔C2 Contract

> Status: FROZEN as of P11. This file is the coordination contract between
> Group C workers: C1 (bench cases) and C2 (heuristic seeding). Do NOT
> modify after P11 completes.

## Purpose

Defines the stable heuristic ID scheme used across bench cases and the
heuristic baseline library. Every `expected-finding.json` in bench cases
references heuristic IDs from this convention. Every `HEUR-*.json` in
`heuristics/baseline/evm/` uses IDs from this convention.

## ID format

```
HEUR-{CATEGORY}-{SEQUENCE:02d}
```

Where `{CATEGORY}` is one of the short category codes below, and
`{SEQUENCE}` is a two-digit zero-padded sequence number within that
category (starts at 01).

## Category codes (EVM)

| Code | Bug-taxonomy category | Example ID |
|---|---|---|
| `AC` | Access Control | `HEUR-AC-01` |
| `RE` | Reentrancy | `HEUR-RE-01` |
| `ARITH` | Arithmetic / Overflow / Rounding | `HEUR-ARITH-01` |
| `ORACLE` | Oracle Manipulation | `HEUR-ORACLE-01` |
| `FLASH` | Flash Loan | `HEUR-FLASH-01` |
| `GOV` | Governance | `HEUR-GOV-01` |
| `PROXY` | Proxy / Upgradeability | `HEUR-PROXY-01` |
| `BRIDGE` | Bridge / Cross-chain | `HEUR-BRIDGE-01` |
| `TOKEN` | Token Standard / ERC | `HEUR-TOKEN-01` |
| `CROSS` | Cross-contract / Composability | `HEUR-CROSS-01` |
| `LEND` | Lending / Liquidation | `HEUR-LEND-01` |
| `VLOOKUP` | Validation / State Check | `HEUR-VLOOKUP-01` |
| `INIT` | Initialization | `HEUR-INIT-01` |
| `MISC` | Miscellaneous | `HEUR-MISC-01` |

## Category codes (SVM)

| Code | Bug class | Example ID |
|---|---|---|
| `SVM-AC` | CPI Authority / Account Owner Check | `HEUR-SVM-AC-01` |
| `SVM-SIGNER` | Missing Signer Check | `HEUR-SVM-SIGNER-01` |
| `SVM-COSPLAY` | Account Type Cosplay | `HEUR-SVM-COSPLAY-01` |
| `SVM-SYSVAR` | Sysvar Spoofing | `HEUR-SVM-SYSVAR-01` |
| `SVM-CPI` | Arbitrary CPI | `HEUR-SVM-CPI-01` |
| `SVM-DUP` | Duplicate Account Mutable | `HEUR-SVM-DUP-01` |

## Allocation

Starting allocations for the 30 EVM + 10 SVM heuristics from P13/P16:

### EVM allocation

| Range | Category | Notes |
|---|---|---|
| HEUR-AC-01..05 | Access Control | 5 heuristics |
| HEUR-RE-01..04 | Reentrancy | 4 heuristics |
| HEUR-ARITH-01..03 | Arithmetic | 3 heuristics |
| HEUR-ORACLE-01..03 | Oracle | 3 heuristics |
| HEUR-FLASH-01..02 | Flash Loan | 2 heuristics |
| HEUR-GOV-01..02 | Governance | 2 heuristics |
| HEUR-PROXY-01..03 | Proxy | 3 heuristics |
| HEUR-BRIDGE-01..02 | Bridge | 2 heuristics |
| HEUR-TOKEN-01..02 | Token | 2 heuristics |
| HEUR-LEND-01..02 | Lending | 2 heuristics (incl. HEUR-LEND-01 = Euler donation) |
| HEUR-VLOOKUP-01..01 | Validation | 1 heuristic |
| HEUR-INIT-01..01 | Init | 1 heuristic (P11 Euler seed) |

> Note: HEUR-LEND-01 is the Euler donation/health-check heuristic seeded in P11.

### SVM allocation

| Range | Category | Notes |
|---|---|---|
| HEUR-SVM-AC-01..02 | CPI/Owner | 2 heuristics |
| HEUR-SVM-SIGNER-01..02 | Signer | 2 heuristics |
| HEUR-SVM-COSPLAY-01..01 | Cosplay | 1 heuristic |
| HEUR-SVM-SYSVAR-01..02 | Sysvar | 2 heuristics |
| HEUR-SVM-CPI-01..02 | Arbitrary CPI | 2 heuristics |
| HEUR-SVM-DUP-01..01 | Duplicate | 1 heuristic |

## Stability guarantee

IDs in this convention are frozen from the moment the first bench case or
heuristic file references them. An ID, once assigned, must not change.
If renaming is truly necessary, file a PIVOT ADR and update both this file
and every downstream reference in a single atomic commit.
