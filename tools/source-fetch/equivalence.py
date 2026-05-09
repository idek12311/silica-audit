"""
Bytecode equivalence checker.

Compiles the resolved source locally and compares the resulting bytecode
against the on-chain deployed bytecode. Records the result on the
SourceResolution's `bytecode_match` field.

Notes.md §11.3: verifier drift — verified Etherscan source frequently
doesn't compile to deployed bytecode due to Solc version, optimizer
settings, or OZ vendoring mismatches.
"""
from __future__ import annotations

import hashlib
import logging
import subprocess
import tempfile
import json
from pathlib import Path
from typing import Any

import requests

from .fetch import SourceResolution

logger = logging.getLogger(__name__)


def check_bytecode_equivalence(
    resolution: SourceResolution,
    provider_url: str,
) -> SourceResolution:
    """
    Compiles the resolved source and compares runtime bytecode to the
    deployed bytecode fetched from `provider_url`.

    Sets `resolution.bytecode_match = True | False`.
    Returns a new SourceResolution with the updated field.
    """
    try:
        local_bytecode = _compile_locally(resolution)
    except Exception as exc:
        logger.warning("Local compile failed for %s: %s", resolution.address, exc)
        return SourceResolution(**{**resolution.__dict__, 'bytecode_match': None})

    try:
        onchain_bytecode = _fetch_deployed_bytecode(resolution.address, provider_url)
    except Exception as exc:
        logger.warning("eth_getCode failed for %s: %s", resolution.address, exc)
        return SourceResolution(**{**resolution.__dict__, 'bytecode_match': None})

    # Strip CBOR-encoded metadata suffix (last 2 bytes encode length)
    local_stripped = _strip_metadata(local_bytecode)
    onchain_stripped = _strip_metadata(onchain_bytecode)

    match = local_stripped == onchain_stripped
    logger.info(
        "Bytecode equivalence for %s: %s (local_len=%d, onchain_len=%d)",
        resolution.address, match, len(local_stripped), len(onchain_stripped),
    )

    return SourceResolution(**{**resolution.__dict__, 'bytecode_match': match})


def _compile_locally(resolution: SourceResolution) -> bytes:
    """Compiles the source files and returns the runtime bytecode bytes."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        # Write all source files
        for fname, content in resolution.source_files.items():
            dest = tmp / fname
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(content)

        # Determine the main contract file
        sol_files = [f for f in resolution.source_files if f.endswith('.sol')]
        if not sol_files:
            raise ValueError("No .sol files in resolution")

        # Build solc input JSON
        solc_input = _build_solc_input(resolution.source_files, resolution.compiler_settings)
        input_path = tmp / "input.json"
        input_path.write_text(json.dumps(solc_input))

        result = subprocess.run(
            ["solc", "--standard-json", str(input_path)],
            capture_output=True, text=True, timeout=60,
        )

        output = json.loads(result.stdout)
        contracts = output.get("contracts", {})
        # Return bytecode of the first contract found
        for fname_contracts in contracts.values():
            for contract_data in fname_contracts.values():
                evm = contract_data.get("evm", {})
                deployed = evm.get("deployedBytecode", {})
                hex_code = deployed.get("object", "")
                if hex_code:
                    return bytes.fromhex(hex_code)

        raise ValueError("solc produced no bytecode")


def _build_solc_input(source_files: dict[str, str], settings: dict[str, Any]) -> dict[str, Any]:
    return {
        "language": "Solidity",
        "sources": {name: {"content": content} for name, content in source_files.items()},
        "settings": {
            **settings,
            "outputSelection": {"*": {"*": ["evm.deployedBytecode"]}},
        },
    }


def _fetch_deployed_bytecode(address: str, provider_url: str) -> bytes:
    payload = {
        "jsonrpc": "2.0",
        "method": "eth_getCode",
        "params": [address, "latest"],
        "id": 1,
    }
    resp = requests.post(provider_url, json=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    hex_code = data.get("result", "0x")
    if hex_code == "0x":
        return b""
    return bytes.fromhex(hex_code[2:])


def _strip_metadata(bytecode: bytes) -> bytes:
    """
    Strips the CBOR-encoded metadata suffix from Solidity compiled bytecode.
    The last 2 bytes are the big-endian length of the CBOR block.
    """
    if len(bytecode) < 2:
        return bytecode
    cbor_len = int.from_bytes(bytecode[-2:], 'big')
    if cbor_len < len(bytecode) - 2:
        return bytecode[:len(bytecode) - 2 - cbor_len]
    return bytecode


def bytecode_hash(bytecode: bytes) -> str:
    """Returns sha256 hex digest of bytecode (for toolchain manifest)."""
    return hashlib.sha256(bytecode).hexdigest()
