"""
CLI entry point for the Slither runner.

Usage:
    python3 -m tools.slither SOURCE_PATH [--contract NAME] [--out PATH]

Emits a SlitherResult-equivalent JSON to stdout (or --out path).
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from run import run_slither, SlitherRunnerError  # type: ignore[import]  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="silica-slither",
        description="Run Slither in a Docker sandbox; emit Finding-context JSON.",
    )
    parser.add_argument("source_path", help="Path to the Solidity source dir or file")
    parser.add_argument("--contract", help="Optional specific contract name to analyze")
    parser.add_argument("--out", default="-", help="Output path or '-' for stdout")
    args = parser.parse_args(argv)

    try:
        result = run_slither(args.source_path, contract_name=args.contract)
    except SlitherRunnerError as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 2

    payload = dataclasses.asdict(result)

    if args.out == "-":
        json.dump(payload, sys.stdout, indent=2, default=str)
        sys.stdout.write("\n")
    else:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, default=str)

    return 0 if result.success else 1


if __name__ == "__main__":
    sys.exit(main())
