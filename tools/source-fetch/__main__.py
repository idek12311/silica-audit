"""
CLI entry point for the source fetcher.

Usage:
    python3 -m tools.source-fetch ADDRESS [--chain CHAIN_ID] [--api-key KEY] [--out PATH]

Or, when invoked from the tools/source-fetch/ directory:
    python3 __main__.py ADDRESS [--chain ...] ...

Emits the SourceResolution as JSON to stdout (or to --out path).
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import sys

# Allow this module to be run both as `python -m tools.source-fetch`
# (package style) and as `python3 fetch.py` standalone.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fetch import fetch_source, SourceFetchError  # type: ignore[import]  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="silica-source-fetch",
        description="Resolve verified Solidity/Vyper source from Etherscan + Sourcify.",
    )
    parser.add_argument("address", help="Contract address (0x... hex)")
    parser.add_argument("--chain", type=int, default=1, help="Chain ID (default: 1 mainnet)")
    parser.add_argument(
        "--api-key",
        default=os.environ.get("ETHERSCAN_API_KEY"),
        help="Etherscan API key (default: $ETHERSCAN_API_KEY)",
    )
    parser.add_argument("--out", default="-", help="Output path or '-' for stdout")
    args = parser.parse_args(argv)

    try:
        resolution = fetch_source(args.address, args.chain, api_key=args.api_key)
    except SourceFetchError as exc:
        print(json.dumps({"error": str(exc), "address": args.address}), file=sys.stderr)
        return 2

    payload = dataclasses.asdict(resolution)

    if args.out == "-":
        json.dump(payload, sys.stdout, indent=2, default=str)
        sys.stdout.write("\n")
    else:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, default=str)

    return 0


if __name__ == "__main__":
    sys.exit(main())
