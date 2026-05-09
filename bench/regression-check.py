"""
Bench regression checker.

Compares the current `public/eval-framework/score-sheet.json` against a saved
baseline at `bench/results/baseline.json` and exits non-zero on regression.

A regression is any of:
  - A case that passed in the baseline now fails.
  - EVM or SVM recall dropped vs baseline.
  - Average cost rose above baseline by more than 20% (cost regression).

If the baseline file is absent, the current score-sheet is written as the new
baseline and the run exits 0 (first-run-establishes-baseline semantics).

Usage:
  python3 bench/regression-check.py
  python3 bench/regression-check.py --update-baseline    # save current as new baseline
  python3 bench/regression-check.py --score-sheet PATH   # use a non-default sheet
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
DEFAULT_SCORE_SHEET = REPO_ROOT / "public" / "eval-framework" / "score-sheet.json"
BASELINE_FILE = Path(__file__).parent / "results" / "baseline.json"

COST_REGRESSION_THRESHOLD = 1.20  # 20% above baseline


def load_score_sheet(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(
            f"Score sheet not found at {path}. "
            "Run `npm run score-sheet:generate` first."
        )
    with open(path) as f:
        return json.load(f)


def load_baseline() -> dict | None:
    if not BASELINE_FILE.exists():
        return None
    with open(BASELINE_FILE) as f:
        return json.load(f)


def write_baseline(score_sheet: dict) -> None:
    BASELINE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(BASELINE_FILE, "w") as f:
        json.dump(score_sheet, f, indent=2)


def index_results(sheet: dict) -> dict[str, dict]:
    """Return {case_id -> result-dict}."""
    return {r["case_id"]: r for r in sheet.get("results", [])}


def detect_regressions(baseline: dict, current: dict) -> list[str]:
    """Return a list of regression descriptions; empty list = no regression."""
    failures: list[str] = []
    base_idx = index_results(baseline)
    curr_idx = index_results(current)

    # 1. Cases that passed before now fail
    for case_id, base_r in base_idx.items():
        if not base_r.get("passed"):
            continue
        curr_r = curr_idx.get(case_id)
        if curr_r is None:
            failures.append(f"case-removed: {case_id} was in baseline, missing from current")
            continue
        if not curr_r.get("passed"):
            failures.append(
                f"case-regressed: {case_id} (baseline: passed, current: failed — {curr_r.get('reason')})"
            )

    # 2. Recall dropped
    base_agg = baseline.get("aggregate", {})
    curr_agg = current.get("aggregate", {})
    for axis in ("evm_recall", "svm_recall"):
        base_v = float(base_agg.get(axis, 0))
        curr_v = float(curr_agg.get(axis, 0))
        if curr_v + 1e-6 < base_v:
            failures.append(f"recall-dropped: {axis} {base_v:.3f} → {curr_v:.3f}")

    # 3. Cost regressed by >20%
    base_cost = float(base_agg.get("avg_cost_usd", 0))
    curr_cost = float(curr_agg.get("avg_cost_usd", 0))
    if base_cost > 0 and curr_cost > base_cost * COST_REGRESSION_THRESHOLD:
        failures.append(
            f"cost-regressed: avg_cost_usd ${base_cost:.2f} → ${curr_cost:.2f} "
            f"(>{int((COST_REGRESSION_THRESHOLD - 1) * 100)}% increase)"
        )

    return failures


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--score-sheet", default=str(DEFAULT_SCORE_SHEET))
    parser.add_argument("--update-baseline", action="store_true")
    args = parser.parse_args()

    sheet_path = Path(args.score_sheet)
    current = load_score_sheet(sheet_path)

    if args.update_baseline:
        write_baseline(current)
        print(f"Baseline updated at {BASELINE_FILE}")
        sys.exit(0)

    baseline = load_baseline()
    if baseline is None:
        write_baseline(current)
        print(f"No baseline found — wrote current sheet to {BASELINE_FILE}")
        sys.exit(0)

    regressions = detect_regressions(baseline, current)
    if regressions:
        print("REGRESSION DETECTED:")
        for r in regressions:
            print(f"  - {r}")
        sys.exit(1)

    print(
        f"PASS — no regression vs baseline "
        f"({len(current.get('results', []))} cases, "
        f"evm_recall={current['aggregate']['evm_recall']}, "
        f"svm_recall={current['aggregate']['svm_recall']}, "
        f"avg_cost=${current['aggregate']['avg_cost_usd']:.2f})"
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
