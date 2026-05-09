"""
CLI entry point for the Foundry runner.

Usage:
    python3 -m tools.foundry TEST_PATH --fork-url URL --fork-block BLOCK [--match-test PATTERN] [--out PATH]

Emits a FoundryResult JSON to stdout (or --out path).
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from run import run_forge_test, FoundryRunnerError  # type: ignore[import]  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="silica-foundry",
        description="Fork mainnet at a block and run forge test in a Docker sandbox.",
    )
    parser.add_argument("test_path", help="Path to the Foundry project root")
    parser.add_argument(
        "--fork-url",
        default=os.environ.get("FORK_URL"),
        help="EVM RPC fork URL (default: $FORK_URL)",
    )
    parser.add_argument("--fork-block", type=int, required=True, help="Block number to fork at")
    parser.add_argument("--match-test", help="Optional --match-test pattern")
    parser.add_argument("--out", default="-", help="Output path or '-' for stdout")
    args = parser.parse_args(argv)

    if not args.fork_url:
        print(json.dumps({"error": "FORK_URL required (env or --fork-url)"}), file=sys.stderr)
        return 2

    try:
        result = run_forge_test(
            args.test_path,
            args.fork_url,
            args.fork_block,
            match_test=args.match_test,
        )
    except FoundryRunnerError as exc:
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
