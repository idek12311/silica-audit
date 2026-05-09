"""
Silica Foundry runner.

Forks mainnet (or any EVM chain) at a specific block using Anvil,
runs forge test suites, and captures execution traces + state snapshots.

Implements validation-tiers.md R2 (fork-execution-no-revert) and
R3 (fork-execution-state-asserted).

Per notes.md §17.10: tool runs in a Docker container with cgroups limits.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DOCKER_IMAGE = os.environ.get("SILICA_FOUNDRY_IMAGE", "silica-foundry:latest")
CONTAINER_RAM = "8g"
CONTAINER_CPU = "4.0"
CONTAINER_TIMEOUT = 600  # seconds per forge test run
ANVIL_STARTUP_TIMEOUT = 30


@dataclass
class FoundryResult:
    success: bool
    tests_passed: list[str] = field(default_factory=list)
    tests_failed: list[str] = field(default_factory=list)
    state_assertions: list[dict[str, Any]] = field(default_factory=list)
    gas_report: dict[str, Any] = field(default_factory=dict)
    trace_output: str = ""
    error: str | None = None
    exit_code: int = 0


class FoundryRunnerError(Exception):
    """Raised when Foundry container fails in a non-recoverable way."""


def run_forge_test(
    test_path: str,
    rpc_url: str,
    fork_block: int,
    match_test: str | None = None,
) -> FoundryResult:
    """
    Runs `forge test` against an Anvil fork of the given RPC at `fork_block`.

    Args:
        test_path: Host path to the Foundry project root.
        rpc_url: Ethereum RPC URL for the fork.
        fork_block: Block number to fork at.
        match_test: Optional test name pattern (--match-test).

    Returns:
        FoundryResult with passed/failed test names and state assertions.
    """
    test_path = str(Path(test_path).resolve())
    if not os.path.exists(test_path):
        raise FoundryRunnerError(f"Test path does not exist: {test_path}")

    with tempfile.TemporaryDirectory() as output_dir:
        result_file = Path(output_dir) / "forge-result.json"

        cmd = _build_docker_cmd(test_path, str(output_dir), rpc_url, fork_block, match_test)
        logger.info("Running forge test: fork_block=%d", fork_block)

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=CONTAINER_TIMEOUT + 30,
                env={**os.environ, "RPC_URL": rpc_url},
            )
        except subprocess.TimeoutExpired:
            return FoundryResult(
                success=False,
                error=f"Forge test timed out after {CONTAINER_TIMEOUT}s",
            )

        stdout = proc.stdout
        stderr = proc.stderr

        passed, failed = _parse_forge_output(stdout)
        state_assertions = _extract_state_assertions(stdout)

        return FoundryResult(
            success=proc.returncode == 0,
            tests_passed=passed,
            tests_failed=failed,
            state_assertions=state_assertions,
            trace_output=stderr[:5000] if proc.returncode != 0 else "",
            error=stderr[:1000] if proc.returncode not in (0, 1) else None,
            exit_code=proc.returncode,
        )


def _build_docker_cmd(
    test_path: str,
    output_dir: str,
    rpc_url: str,
    fork_block: int,
    match_test: str | None,
) -> list[str]:
    """Constructs the Docker command for a forge test run."""
    cmd = [
        "docker", "run",
        "--rm",
        "--memory", CONTAINER_RAM,
        "--cpus", CONTAINER_CPU,
        "--security-opt", "no-new-privileges",
        "-v", f"{test_path}:/audit/project:ro",
        "-v", f"{output_dir}:/audit/output",
        "-e", f"FORK_URL={rpc_url}",
        "-e", f"FORK_BLOCK={fork_block}",
        # Allow egress only to the RPC endpoint (enforced at host iptables)
        # In the container: forge test uses RPC set via FORK_URL env
        DOCKER_IMAGE,
        "forge", "test",
        "--fork-url", rpc_url,
        "--fork-block-number", str(fork_block),
        "--json",
        "-vvv",    # verbose trace output
    ]
    if match_test:
        cmd.extend(["--match-test", match_test])
    return cmd


def _parse_forge_output(stdout: str) -> tuple[list[str], list[str]]:
    """
    Parses forge test output to extract passed and failed test names.
    forge --json emits per-test result as JSON lines.
    """
    passed: list[str] = []
    failed: list[str] = []

    for line in stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue

        # Forge JSON format: {"type": "test", "name": "...", "status": "Success"|"Failure"}
        if obj.get("type") == "test":
            name = obj.get("name", "unknown")
            if obj.get("status") == "Success":
                passed.append(name)
            else:
                failed.append(name)

    return passed, failed


def _extract_state_assertions(stdout: str) -> list[dict[str, Any]]:
    """
    Extracts state assertion evidence from forge trace output.
    Looks for lines like: "assertEq(attacker.balance, 197000000 * 1e18)" in traces.
    """
    assertions = []
    for line in stdout.splitlines():
        if "assert" in line.lower() and ("balance" in line.lower() or "eq" in line.lower()):
            assertions.append({"trace_line": line.strip()})
    return assertions
