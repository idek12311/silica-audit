"""
Silica RPC node fingerprinter.

Implements Surface 3 from ops/perimeter-playbook.md:
- Scan known RPC endpoints for the protocol
- Fingerprint exposed JSON-RPC methods
- Flag dangerous admin methods (personal_*, admin_*, txpool_*)

Container: 2GB RAM, 1 CPU, 300s timeout.
Network egress: target IP/port only.

REQUIRES scope_artifact_id — fail-closed without it.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
from dataclasses import dataclass, field
from typing import Any

import requests

logger = logging.getLogger(__name__)

# Dangerous RPC methods that should never be publicly exposed
HIGH_RISK_METHODS = {
    "personal_importRawKey",
    "personal_unlockAccount",
    "personal_sign",
    "admin_stopRPC",
    "admin_startRPC",
    "admin_addPeer",
    "admin_removePeer",
    "debug_setHead",
    "debug_chaindbCompact",
    "txpool_content",
    "eth_sendUnsignedTransaction",
}

MEDIUM_RISK_METHODS = {
    "txpool_inspect",
    "txpool_status",
    "debug_traceTransaction",
    "trace_replayTransaction",
}


@dataclass
class RpcFingerprintResult:
    success: bool
    endpoint: str
    exposed_methods: list[str] = field(default_factory=list)
    high_risk_methods: list[str] = field(default_factory=list)
    medium_risk_methods: list[str] = field(default_factory=list)
    client_type: str | None = None
    error: str | None = None
    scope_artifact_id: str | None = None


class ScopeMissing(Exception):
    pass


def fingerprint_rpc(
    endpoint: str,
    scope_artifact_id: str | None,
) -> RpcFingerprintResult:
    """Fingerprints an RPC endpoint for exposed dangerous methods."""
    if not scope_artifact_id:
        raise ScopeMissing(
            "RPC fingerprinter requires scope_artifact_id — fail-closed."
        )

    if os.environ.get("SILICA_MOCK_TOOLS"):
        return _mock_result(endpoint, scope_artifact_id)

    return _probe_rpc(endpoint, scope_artifact_id)


def _probe_rpc(endpoint: str, scope_artifact_id: str) -> RpcFingerprintResult:
    """Probes the RPC endpoint via JSON-RPC calls."""
    exposed: list[str] = []

    # Try rpc_modules to get the method namespace list
    modules = _call_rpc(endpoint, "rpc_modules", [])
    if modules:
        exposed.extend([f"{k}_{m}" for k, v in modules.items() for m in str(v).split(",")])

    # Try direct method probing for high-risk methods
    for method in list(HIGH_RISK_METHODS)[:5]:  # limit probes
        result = _call_rpc(endpoint, method, [])
        if result is not None:
            exposed.append(method)

    high_risk = [m for m in exposed if m in HIGH_RISK_METHODS]
    medium_risk = [m for m in exposed if m in MEDIUM_RISK_METHODS]

    # Detect client type
    client_version = _call_rpc(endpoint, "web3_clientVersion", [])
    client_type = str(client_version) if client_version else None

    return RpcFingerprintResult(
        success=True,
        endpoint=endpoint,
        exposed_methods=exposed,
        high_risk_methods=high_risk,
        medium_risk_methods=medium_risk,
        client_type=client_type,
        scope_artifact_id=scope_artifact_id,
    )


def _mock_result(endpoint: str, scope_artifact_id: str) -> RpcFingerprintResult:
    return RpcFingerprintResult(
        success=True,
        endpoint=endpoint,
        exposed_methods=["eth_chainId", "eth_blockNumber"],
        high_risk_methods=[],
        medium_risk_methods=[],
        client_type="Geth/mock",
        scope_artifact_id=scope_artifact_id,
    )


def _call_rpc(endpoint: str, method: str, params: list[Any]) -> Any:
    try:
        resp = requests.post(endpoint, json={
            "jsonrpc": "2.0", "method": method, "params": params, "id": 1,
        }, timeout=10)
        data = resp.json()
        return data.get("result")
    except Exception:
        return None
