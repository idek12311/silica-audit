"""
Unit tests for the Foundry runner.
Integration tests (actual Docker + anvil fork) at tests/integration/tools/.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from unittest.mock import patch, MagicMock

from run import (  # type: ignore[import]
    run_forge_test,
    _parse_forge_output,
    _extract_state_assertions,
    FoundryRunnerError,
)
from state_snapshot import diff_snapshots, StateSnapshot  # type: ignore[import]


class TestParseForgeOutput:
    def test_parses_passed_test(self):
        stdout = '{"type": "test", "name": "test_exploit_works", "status": "Success"}'
        passed, failed = _parse_forge_output(stdout)
        assert "test_exploit_works" in passed
        assert failed == []

    def test_parses_failed_test(self):
        stdout = '{"type": "test", "name": "test_no_revert", "status": "Failure", "reason": "assertion failed"}'
        passed, failed = _parse_forge_output(stdout)
        assert "test_no_revert" in failed
        assert passed == []

    def test_ignores_non_json_lines(self):
        stdout = "Compiling... 100%\n[PASS] test_foo\n"
        passed, failed = _parse_forge_output(stdout)
        assert passed == []
        assert failed == []

    def test_parses_mixed_output(self):
        stdout = '\n'.join([
            '{"type": "test", "name": "test_a", "status": "Success"}',
            '{"type": "test", "name": "test_b", "status": "Failure"}',
            "non json line",
        ])
        passed, failed = _parse_forge_output(stdout)
        assert "test_a" in passed
        assert "test_b" in failed


class TestExtractStateAssertions:
    def test_extracts_asserteq_line(self):
        stdout = "  ├─ emit Transfer\n  ├─ assertEq(attacker.balance, 197000000)\n  └─ STOP"
        assertions = _extract_state_assertions(stdout)
        assert any("assertEq" in a["trace_line"] for a in assertions)

    def test_returns_empty_for_no_assertions(self):
        stdout = "Running tests...\nTest passed.\n"
        assertions = _extract_state_assertions(stdout)
        assert assertions == []


class TestRunForgeTest:
    def test_raises_for_nonexistent_path(self):
        with pytest.raises(FoundryRunnerError, match="does not exist"):
            run_forge_test("/nonexistent/path", "http://localhost:8545", 16817993)

    def test_returns_result_on_success(self, tmp_path):
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = '{"type": "test", "name": "test_exploit", "status": "Success"}\n'
        mock_proc.stderr = ""

        with patch("run.subprocess.run", return_value=mock_proc):
            result = run_forge_test(str(tmp_path), "http://localhost:8545", 16817993)

        assert result.success is True
        assert "test_exploit" in result.tests_passed

    def test_returns_failure_on_nonzero_exit(self, tmp_path):
        mock_proc = MagicMock()
        mock_proc.returncode = 1
        mock_proc.stdout = '{"type": "test", "name": "test_fail", "status": "Failure"}\n'
        mock_proc.stderr = "trace output"

        with patch("run.subprocess.run", return_value=mock_proc):
            result = run_forge_test(str(tmp_path), "http://localhost:8545", 16817993)

        assert result.success is False
        assert "test_fail" in result.tests_failed


class TestDiffSnapshots:
    def test_computes_balance_delta(self):
        before = StateSnapshot(
            block=100,
            chain_id=1,
            account_states={"0xattacker": {"balance_wei": 0, "nonce": 0}},
        )
        after = StateSnapshot(
            block=101,
            chain_id=1,
            account_states={"0xattacker": {"balance_wei": 197_000_000, "nonce": 1}},
        )
        diff = diff_snapshots(before, after)
        assert diff["delta"]["0xattacker"]["balance_wei_delta"] == 197_000_000

    def test_handles_new_address_in_after(self):
        before = StateSnapshot(block=100, chain_id=1, account_states={})
        after = StateSnapshot(
            block=101, chain_id=1,
            account_states={"0xnew": {"balance_wei": 1000, "nonce": 0}},
        )
        diff = diff_snapshots(before, after)
        assert "0xnew" in diff["after"]
