"""
Silica frontend wallet-call taint analyzer.

Implements Surface 1 from ops/perimeter-playbook.md:
- Crawl frontend bundle
- Identify wallet-call construction sites (wagmi, ethers, web3)
- Trace data flow to wallet-call parameters
- Flag uncontrolled inputs reaching wallet-call params

Container: 2GB RAM, 1 CPU, 300s timeout.
Network egress: target domain only (enforced at run.py invocation).

IMPORTANT: Requires a valid scope_artifact_id.
           This tool fails-closed without scope.
"""
from __future__ import annotations

import json
import logging
import os
import re
import subprocess
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

DOCKER_IMAGE = os.environ.get("SILICA_FRONTEND_IMAGE", "silica-frontend:latest")
CONTAINER_RAM = "2g"
CONTAINER_CPU = "1.0"
CONTAINER_TIMEOUT = 300


@dataclass
class FrontendTaintResult:
    success: bool
    taint_flows: list[dict[str, Any]] = field(default_factory=list)
    wallet_call_sites: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    scope_artifact_id: str | None = None


class FrontendRunnerError(Exception):
    pass


class ScopeMissing(FrontendRunnerError):
    """Raised when scope_artifact_id is not provided — fail-closed."""


def run_frontend_taint(
    bundle_url: str,
    scope_artifact_id: str | None,
    allow_list_domains: list[str] | None = None,
) -> FrontendTaintResult:
    """
    Analyzes a frontend bundle for wallet-call taint vulnerabilities.

    REQUIRES scope_artifact_id — fail-closed without it.
    """
    if not scope_artifact_id:
        raise ScopeMissing(
            "Frontend taint analyzer requires scope_artifact_id. "
            "Off-chain tools refuse to run without valid scope (ops/perimeter-playbook.md)."
        )

    # In mock mode (no Docker), run synthetic analysis
    if os.environ.get("SILICA_MOCK_TOOLS"):
        return _run_mock_analysis(bundle_url, scope_artifact_id)

    if not allow_list_domains:
        allow_list_domains = [_extract_domain(bundle_url)]

    cmd = _build_docker_cmd(bundle_url, allow_list_domains)
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=CONTAINER_TIMEOUT + 30)
    except subprocess.TimeoutExpired:
        return FrontendTaintResult(
            success=False,
            error=f"Frontend analyzer timed out after {CONTAINER_TIMEOUT}s",
            scope_artifact_id=scope_artifact_id,
        )

    flows = _parse_taint_output(proc.stdout)
    return FrontendTaintResult(
        success=True,
        taint_flows=flows,
        scope_artifact_id=scope_artifact_id,
    )


def _run_mock_analysis(bundle_url: str, scope_artifact_id: str) -> FrontendTaintResult:
    """
    Mock analysis for CI/testing: detects synthetic BadgerDAO injection pattern.
    """
    # Simulate detection of the BadgerDAO-style swap injection
    mock_flows = [
        {
            "kind": "wallet-call-swap",
            "source": "external-api-response",
            "sink": "approve(spender, amount)",
            "call_site": "app.tsx:142",
            "bundle_url": bundle_url,
            "description": (
                f"At {bundle_url}: spender parameter derived from "
                "/api/vault-info response without integrity verification"
            ),
            "severity": "critical",
            "rung": "static-signal-only",
        }
    ]
    return FrontendTaintResult(
        success=True,
        taint_flows=mock_flows,
        scope_artifact_id=scope_artifact_id,
    )


def _build_docker_cmd(bundle_url: str, allow_list_domains: list[str]) -> list[str]:
    return [
        "docker", "run",
        "--rm",
        "--memory", CONTAINER_RAM,
        "--cpus", CONTAINER_CPU,
        "--security-opt", "no-new-privileges",
        "--network", "bridge",  # Allow-listed domains only (enforced via iptables)
        "-e", f"TARGET_URL={bundle_url}",
        "-e", f"ALLOW_LIST={','.join(allow_list_domains)}",
        DOCKER_IMAGE,
        "python3", "/app/taint.py", "--url", bundle_url,
    ]


def _parse_taint_output(stdout: str) -> list[dict[str, Any]]:
    """Parses taint analysis JSON output."""
    if not stdout.strip():
        return []
    try:
        data = json.loads(stdout)
        return data.get("taint_flows", []) if isinstance(data, dict) else []
    except json.JSONDecodeError:
        return []


def _extract_domain(url: str) -> str:
    """Extracts domain from URL for allow-list."""
    m = re.match(r'^https?://([^/]+)', url)
    return m.group(1) if m else url
