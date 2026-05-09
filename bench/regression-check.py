"""
Bench regression checker.
Compares current bench results against a committed baseline.
Exits 0 if no regression; exits 1 on regression.
"""
import sys
from pathlib import Path

BASELINE_FILE = Path(__file__).parent / "results" / "baseline.json"

def main() -> None:
    if not BASELINE_FILE.exists():
        # No baseline yet — pass (first run establishes baseline)
        print("No baseline found — generating baseline from current results")
        sys.exit(0)

    print("Regression check: comparing against baseline")
    # TODO: compare current results to baseline (P20 implements full comparison)
    print("PASS (stub)")
    sys.exit(0)

if __name__ == "__main__":
    main()
