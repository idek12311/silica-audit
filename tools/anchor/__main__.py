"""
CLI entry point for the Anchor runner.

Usage:
    python3 -m tools.anchor PROGRAM_PATH [--rpc-url URL] [--clone PUBKEY ...] [--match-test PATTERN] [--out PATH]
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from run import run_anchor_test, AnchorRunnerError  # type: ignore[import]  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="silica-anchor",
        description="Run anchor test against solana-test-validator in a Docker sandbox.",
    )
    parser.add_argument("program_path", help="Path to the Anchor project root")
    parser.add_argument(
        "--rpc-url",
        default=os.environ.get("SOLANA_RPC_URL"),
        help="Solana RPC URL (default: $SOLANA_RPC_URL)",
    )
    parser.add_argument(
        "--clone",
        action="append",
        default=[],
        help="Account pubkey to clone from mainnet (repeatable)",
    )
    parser.add_argument("--match-test", help="Optional --grep test name pattern")
    parser.add_argument("--out", default="-", help="Output path or '-' for stdout")
    args = parser.parse_args(argv)

    try:
        result = run_anchor_test(
            args.program_path,
            rpc_url=args.rpc_url,
            clone_accounts=args.clone or None,
            match_test=args.match_test,
        )
    except AnchorRunnerError as exc:
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
