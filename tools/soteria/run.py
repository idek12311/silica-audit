"""
Silica Soteria runner.

Executes Soteria static analysis on a Solana/Anchor program inside a Docker
container with cgroups limits. Emits Finding-context JSON.

Per notes.md §17.10: container-level isolation for all tool execution.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DOCKER_IMAGE = os.environ.get("SILICA_SOTERIA_IMAGE", "silica-soteria:latest")
CONTAINER_RAM = "4g"
CONTAINER_CPU = "2.0"
CONTAINER_TIMEOUT = 300


@dataclass
class SoteriaResult:
    success: bool
    findings: list[dict[str, Any]]
    raw_output: str
    error: str | None = None


class SoteriaRunnerError(Exception):
    pass


def run_soteria(program_path: str) -> SoteriaResult:
    """
    Runs Soteria on a Solana program directory in a Docker container.
    """
    program_path = str(Path(program_path).resolve())
    if not os.path.exists(program_path):
        raise SoteriaRunnerError(f"Program path does not exist: {program_path}")

    with tempfile.TemporaryDirectory() as output_dir:
        cmd = [
            "docker", "run",
            "--rm",
            "--memory", CONTAINER_RAM,
            "--cpus", CONTAINER_CPU,
            "--read-only",
            "--tmpfs", "/tmp:size=512m",
            "--network", "none",
            "--security-opt", "no-new-privileges",
            "-v", f"{program_path}:/audit/src:ro",
            "-v", f"{output_dir}:/audit/output",
            DOCKER_IMAGE,
            "soteria", "analyze", "/audit/src",
            "--output", "/audit/output/soteria.json",
        ]

        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=CONTAINER_TIMEOUT + 30)
        except subprocess.TimeoutExpired:
            return SoteriaResult(
                success=False, findings=[], raw_output="",
                error=f"Soteria timeout after {CONTAINER_TIMEOUT}s",
            )

        output_file = Path(output_dir) / "soteria.json"
        if not output_file.exists():
            return SoteriaResult(success=proc.returncode == 0, findings=[], raw_output=proc.stdout)

        raw_json = output_file.read_text()
        findings = _parse_soteria_json(raw_json)
        return SoteriaResult(success=True, findings=findings, raw_output=raw_json)


def _parse_soteria_json(raw_json: str) -> list[dict[str, Any]]:
    """Normalizes Soteria JSON output into Finding-context format."""
    if not raw_json.strip():
        return []
    try:
        data: list[dict[str, Any]] = json.loads(raw_json)
        findings = []
        for item in data:
            findings.append({
                "kind": "static-analysis",
                "tool": "soteria",
                "detector_id": item.get("type", "unknown"),
                "severity_hint": _map_severity(item.get("severity", "")),
                "confidence_prior": 0.70,
                "description": item.get("message", ""),
                "highest_passed_hint": "static-signal-only",
                "subject_hint": {"vm": "svm"},
            })
        return findings
    except json.JSONDecodeError:
        return []


def _map_severity(sev: str) -> str:
    return {"high": "high", "medium": "medium", "low": "low", "info": "informational"}.get(sev.lower(), "informational")
