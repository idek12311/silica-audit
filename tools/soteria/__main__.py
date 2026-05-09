"""
CLI entry point for the Soteria runner.

Usage:
    python3 -m tools.soteria PROGRAM_PATH [--out PATH]
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from run import run_soteria, SoteriaRunnerError  # type: ignore[import]  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="silica-soteria",
        description="Run Soteria static analysis on a Solana/Anchor program in a Docker sandbox.",
    )
    parser.add_argument("program_path", help="Path to the Anchor / Solana program directory")
    parser.add_argument("--out", default="-", help="Output path or '-' for stdout")
    args = parser.parse_args(argv)

    try:
        result = run_soteria(args.program_path)
    except SoteriaRunnerError as exc:
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
