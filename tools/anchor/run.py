"""
Silica Anchor test runner.

Runs `anchor test` against a local solana-test-validator, cloning mainnet
program state as needed. Implements SVM validation rungs R1-R5.

Per multi-vm-svm-sketch.md:114-122: Fork environment + PoC framework.
"""
from __future__ import annotations

import logging
import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DOCKER_IMAGE = os.environ.get("SILICA_ANCHOR_IMAGE", "silica-anchor:latest")
CONTAINER_RAM = "8g"
CONTAINER_CPU = "4.0"
CONTAINER_TIMEOUT = 600


@dataclass
class AnchorResult:
    success: bool
    tests_passed: list[str] = field(default_factory=list)
    tests_failed: list[str] = field(default_factory=list)
    state_assertions: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    exit_code: int = 0


class AnchorRunnerError(Exception):
    pass


def run_anchor_test(
    program_path: str,
    rpc_url: str | None = None,
    clone_accounts: list[str] | None = None,
    match_test: str | None = None,
) -> AnchorResult:
    """
    Runs anchor test on the program at `program_path`.

    Args:
        program_path: Host path to the Anchor project root.
        rpc_url: Solana RPC URL for cloning mainnet state.
        clone_accounts: Account public keys to clone from mainnet.
        match_test: Optional test name filter.
    """
    program_path = str(Path(program_path).resolve())
    if not os.path.exists(program_path):
        raise AnchorRunnerError(f"Program path does not exist: {program_path}")

    cmd = _build_docker_cmd(program_path, rpc_url, clone_accounts, match_test)
    logger.info("Running anchor test: %s", program_path)

    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=CONTAINER_TIMEOUT + 30,
            env={**os.environ, **({"RPC_URL": rpc_url} if rpc_url else {})},
        )
    except subprocess.TimeoutExpired:
        return AnchorResult(success=False, error=f"Anchor test timed out after {CONTAINER_TIMEOUT}s", exit_code=124)

    passed, failed = _parse_mocha_output(proc.stdout)

    return AnchorResult(
        success=proc.returncode == 0,
        tests_passed=passed,
        tests_failed=failed,
        error=proc.stderr[:500] if proc.returncode not in (0, 1) else None,
        exit_code=proc.returncode,
    )


def _build_docker_cmd(
    program_path: str,
    rpc_url: str | None,
    clone_accounts: list[str] | None,
    match_test: str | None,
) -> list[str]:
    cmd = [
        "docker", "run",
        "--rm",
        "--memory", CONTAINER_RAM,
        "--cpus", CONTAINER_CPU,
        "--security-opt", "no-new-privileges",
        "-v", f"{program_path}:/audit/project",
        DOCKER_IMAGE,
        "sh", "-c",
    ]
    # Build the inner anchor test command
    anchor_cmd = ["cd /audit/project && anchor test"]
    if rpc_url:
        anchor_cmd.append(f"--provider.cluster {rpc_url}")
    if match_test:
        anchor_cmd.append(f"--grep '{match_test}'")
    if clone_accounts:
        # solana-test-validator --clone <pubkey> per multi-vm-svm-sketch.md:114
        for pubkey in clone_accounts:
            anchor_cmd.append(f"--validator-args '--clone {pubkey}'")
    cmd.append(" ".join(anchor_cmd))
    return cmd


def _parse_mocha_output(stdout: str) -> tuple[list[str], list[str]]:
    """Parses Mocha test output for passed/failed test names."""
    passed: list[str] = []
    failed: list[str] = []
    for line in stdout.splitlines():
        # Mocha passing pattern: "  ✓ test name"
        if line.strip().startswith("✓") or line.strip().startswith("passing"):
            name = line.strip().lstrip("✓").strip()
            if name and name != "passing":
                passed.append(name)
        # Mocha failing pattern: "  1) test name"
        elif line.strip() and line.strip()[0].isdigit() and ")" in line:
            name = line.strip().split(")", 1)[-1].strip()
            if name:
                failed.append(name)
    return passed, failed
