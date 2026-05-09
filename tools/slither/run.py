"""
Silica Slither runner.

Executes Slither inside a Docker container with cgroups limits and emits
a Finding-context JSON bundle per notes.md §17.10 (container-level isolation).

Container limits: 4GB RAM, 2 CPU, 300s timeout, no network egress.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

DOCKER_IMAGE = os.environ.get("SILICA_SLITHER_IMAGE", "silica-slither:latest")
CONTAINER_RAM = "4g"
CONTAINER_CPU = "2.0"
CONTAINER_TIMEOUT = 300  # seconds
CONTAINER_NAME_PREFIX = "silica-slither-"


@dataclass
class SlitherResult:
    success: bool
    findings: list[dict[str, Any]]
    raw_output: str
    error: str | None = None
    container_id: str | None = None


class SlitherRunnerError(Exception):
    """Raised when the Slither container fails in a non-recoverable way."""


def run_slither(source_path: str, contract_name: str | None = None) -> SlitherResult:
    """
    Runs Slither on `source_path` in a Docker container.

    Args:
        source_path: Host path to the Solidity source directory or file.
        contract_name: Optional specific contract to analyze.

    Returns:
        SlitherResult with findings list and raw JSON output.

    Raises:
        SlitherRunnerError on container startup failure.
    """
    source_path = str(Path(source_path).resolve())
    if not os.path.exists(source_path):
        raise SlitherRunnerError(f"Source path does not exist: {source_path}")

    with tempfile.TemporaryDirectory() as output_dir:
        output_file = Path(output_dir) / "slither.json"

        cmd = _build_docker_cmd(source_path, str(output_file), contract_name)
        logger.info("Running Slither: %s", " ".join(cmd))

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=CONTAINER_TIMEOUT + 30,  # outer timeout slightly longer
            )
        except subprocess.TimeoutExpired:
            return SlitherResult(
                success=False,
                findings=[],
                raw_output="",
                error=f"Slither container timed out after {CONTAINER_TIMEOUT}s",
            )

        stdout = proc.stdout + proc.stderr

        if proc.returncode not in (0, 1):
            # Slither exits 1 when findings found (normal), non-1 on hard failure
            return SlitherResult(
                success=False,
                findings=[],
                raw_output=stdout,
                error=f"Slither container exit code {proc.returncode}: {stdout[:500]}",
            )

        # Parse JSON output written to output_file
        if output_file.exists():
            raw_json = output_file.read_text()
        else:
            # Fall back to stdout JSON
            raw_json = proc.stdout

        findings = _parse_slither_json(raw_json)
        return SlitherResult(
            success=True,
            findings=findings,
            raw_output=raw_json,
        )


def _build_docker_cmd(
    source_path: str,
    output_path: str,
    contract_name: str | None,
) -> list[str]:
    """Constructs the Docker run command with cgroups limits."""
    cmd = [
        "docker", "run",
        "--rm",
        "--memory", CONTAINER_RAM,
        "--cpus", CONTAINER_CPU,
        "--read-only",
        "--tmpfs", "/tmp:size=512m",
        "--network", "none",           # No network egress for static analysis
        "--security-opt", "no-new-privileges",
        "-v", f"{source_path}:/audit/src:ro",
        "-v", f"{os.path.dirname(output_path)}:/audit/output",
        DOCKER_IMAGE,
        "slither", "/audit/src",
        "--json", "/audit/output/slither.json",
        "--exclude-informational",
    ]
    if contract_name:
        cmd.extend(["--contract-name", contract_name])
    return cmd


def _parse_slither_json(raw_json: str) -> list[dict[str, Any]]:
    """
    Normalizes Slither JSON output into a list of finding-context dicts.

    Slither JSON format: {"success": bool, "error": null|str, "results": {"detectors": [...]}}
    """
    if not raw_json.strip():
        return []

    try:
        data: dict[str, Any] = json.loads(raw_json)
    except json.JSONDecodeError:
        logger.warning("Could not parse Slither JSON output")
        return []

    detectors: list[dict[str, Any]] = (
        data.get("results", {}).get("detectors", [])
    )

    findings = []
    for det in detectors:
        finding = {
            "kind": "static-analysis",
            "tool": "slither",
            "detector_id": det.get("check", "unknown"),
            "impact": det.get("impact", "Unknown"),
            "confidence": det.get("confidence", "Unknown"),
            "description": det.get("description", ""),
            "elements": det.get("elements", []),
        }
        findings.append(finding)

    return findings
