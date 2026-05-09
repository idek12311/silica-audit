"""
Silica source fetcher — resolves verified Solidity/Vyper source from
Etherscan API and Sourcify, with fallback between the two.

Accepts: a contract address + chain_id + optional block number.
Emits: a SourceResolution dict with source_files, compiler_settings,
       compiler_version, and sourcify_verified flag.

Notes.md §11.3: verified source ≠ deployed bytecode.
Bytecode equivalence is a separate step (equivalence.py).
"""
from __future__ import annotations

import os
import json
import logging
from dataclasses import dataclass, field
from typing import Any

import requests

logger = logging.getLogger(__name__)

ETHERSCAN_API_BASE = "https://api.etherscan.io/api"
SOURCIFY_API_BASE = "https://sourcify.dev/server"

# Chain IDs for per-chain Etherscan endpoints
ETHERSCAN_CHAIN_API: dict[int, str] = {
    1: "https://api.etherscan.io/api",
    137: "https://api.polygonscan.com/api",
    42161: "https://api.arbiscan.io/api",
    10: "https://api-optimistic.etherscan.io/api",
    56: "https://api.bscscan.com/api",
    43114: "https://api.snowtrace.io/api",
}


@dataclass
class SourceResolution:
    address: str
    chain_id: int
    source_files: dict[str, str]          # filename → source content
    compiler_version: str
    compiler_settings: dict[str, Any]
    source_format: str                      # 'verified_source' | 'raw_bytecode'
    sourcify_verified: bool = False
    etherscan_verified: bool = False
    # Bytecode-equivalence state — populated by equivalence.py
    bytecode_match: bool | None = None
    toolchain_manifest: dict[str, Any] = field(default_factory=dict)


class SourceFetchError(Exception):
    """Raised when source cannot be resolved from any provider."""


def fetch_source(address: str, chain_id: int, api_key: str | None = None) -> SourceResolution:
    """
    Resolves verified source for `address` on `chain_id`.

    Resolution order:
      1. Sourcify (open, no rate limit)
      2. Etherscan (requires API key for sustained use)

    Raises SourceFetchError if neither succeeds.
    """
    address = address.lower()
    api_key = api_key or os.environ.get("ETHERSCAN_API_KEY")

    # Try Sourcify first (no API key required)
    try:
        return _fetch_from_sourcify(address, chain_id)
    except SourceFetchError as e:
        logger.debug("Sourcify failed for %s (chain %d): %s", address, chain_id, e)

    # Fallback to Etherscan
    if not api_key:
        raise SourceFetchError(
            f"No source for {address} on chain {chain_id}: Sourcify failed and "
            "ETHERSCAN_API_KEY not set"
        )
    return _fetch_from_etherscan(address, chain_id, api_key)


def _fetch_from_sourcify(address: str, chain_id: int) -> SourceResolution:
    """Queries Sourcify's full-match endpoint first, then partial-match."""
    for match_type in ("full_match", "partial_match"):
        url = f"{SOURCIFY_API_BASE}/files/{match_type}/{chain_id}/{address}"
        try:
            resp = requests.get(url, timeout=30)
        except requests.RequestException as exc:
            raise SourceFetchError(f"Sourcify request failed: {exc}") from exc

        if resp.status_code == 404:
            continue
        if resp.status_code != 200:
            raise SourceFetchError(f"Sourcify HTTP {resp.status_code}")

        data = resp.json()
        if not data:
            continue

        # Sourcify returns a list of file objects: {name, content, path}
        source_files: dict[str, str] = {}
        metadata: dict[str, Any] = {}
        for file_obj in data:
            fname = file_obj.get("name", "")
            content = file_obj.get("content", "")
            if fname.endswith("metadata.json"):
                try:
                    metadata = json.loads(content)
                except json.JSONDecodeError:
                    pass
            elif fname.endswith((".sol", ".vy")):
                source_files[fname] = content

        if not source_files:
            continue

        compiler_version = (
            metadata.get("compiler", {}).get("version", "unknown") or "unknown"
        )
        settings: dict[str, Any] = metadata.get("settings", {})

        return SourceResolution(
            address=address,
            chain_id=chain_id,
            source_files=source_files,
            compiler_version=compiler_version,
            compiler_settings=settings,
            source_format="verified_source",
            sourcify_verified=(match_type == "full_match"),
            toolchain_manifest=_build_manifest(compiler_version, settings),
        )

    raise SourceFetchError(f"Sourcify: no source for {address} on chain {chain_id}")


def _fetch_from_etherscan(address: str, chain_id: int, api_key: str) -> SourceResolution:
    """Queries Etherscan getsourcecode endpoint."""
    api_base = ETHERSCAN_CHAIN_API.get(chain_id, ETHERSCAN_API_BASE)
    params = {
        "module": "contract",
        "action": "getsourcecode",
        "address": address,
        "apikey": api_key,
    }
    try:
        resp = requests.get(api_base, params=params, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise SourceFetchError(f"Etherscan request failed: {exc}") from exc

    result = resp.json()
    if result.get("status") != "1":
        raise SourceFetchError(
            f"Etherscan API error for {address}: {result.get('message', 'unknown error')}"
        )

    items = result.get("result", [])
    if not items or not items[0].get("SourceCode"):
        raise SourceFetchError(f"Etherscan: no verified source for {address}")

    item = items[0]
    raw_source = item["SourceCode"]
    compiler_version: str = item.get("CompilerVersion", "unknown")
    settings: dict[str, Any] = {}

    source_files: dict[str, str] = {}

    # Multi-file format: double-braced JSON {{ ... }}
    if raw_source.startswith("{{"):
        try:
            inner = json.loads(raw_source[1:-1])  # strip outer braces
            sources_dict: dict[str, Any] = inner.get("sources", {})
            settings = inner.get("settings", {})
            for fname, fobj in sources_dict.items():
                source_files[fname] = fobj.get("content", "")
        except json.JSONDecodeError:
            source_files[f"{address}.sol"] = raw_source
    else:
        source_files[f"{address}.sol"] = raw_source

    return SourceResolution(
        address=address,
        chain_id=chain_id,
        source_files=source_files,
        compiler_version=compiler_version,
        compiler_settings=settings,
        source_format="verified_source",
        etherscan_verified=True,
        toolchain_manifest=_build_manifest(compiler_version, settings),
    )


def _build_manifest(compiler_version: str, settings: dict[str, Any]) -> dict[str, Any]:
    return {
        "compiler": {"name": "solc", "version": compiler_version},
        "compiler_settings": {
            "optimizer_enabled": settings.get("optimizer", {}).get("enabled", False),
            "optimizer_runs": settings.get("optimizer", {}).get("runs", 200),
            "via_ir": settings.get("viaIR", False),
            "evm_version": settings.get("evmVersion"),
        },
    }
