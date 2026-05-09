"""Unit tests for Anchor runner (no Docker dependency)."""
import sys
import os

anchor_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if anchor_dir not in sys.path:
    sys.path.insert(0, anchor_dir)

from run import _parse_mocha_output, AnchorRunnerError, run_anchor_test  # type: ignore[import]
from unittest.mock import patch, MagicMock
import pytest


class TestParseMochaOutput:
    def test_parses_passing_test(self):
        stdout = "  ✓ exploit works correctly\n  2 passing (5s)"
        passed, failed = _parse_mocha_output(stdout)
        assert "exploit works correctly" in passed
        assert failed == []

    def test_parses_failing_test(self):
        stdout = "  1) test should prove exploit\n     AssertionError"
        passed, failed = _parse_mocha_output(stdout)
        assert "test should prove exploit" in failed

    def test_mixed_results(self):
        stdout = "  ✓ setup works\n  1) exploit fails\n  1 passing, 1 failing"
        passed, failed = _parse_mocha_output(stdout)
        assert len(passed) >= 1
        assert len(failed) >= 1


class TestRunAnchorTest:
    def test_raises_for_nonexistent_path(self):
        with pytest.raises(AnchorRunnerError, match="does not exist"):
            run_anchor_test("/nonexistent/path")

    def test_returns_result_on_success(self, tmp_path):
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = "  ✓ test_cashio_exploit\n  1 passing"
        mock_proc.stderr = ""

        with patch("run.subprocess.run", return_value=mock_proc):
            result = run_anchor_test(str(tmp_path))

        assert result.success is True
        assert "test_cashio_exploit" in result.tests_passed
