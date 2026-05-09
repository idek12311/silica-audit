"""Tests for frontend taint analyzer."""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import pytest
from run import run_frontend_taint, ScopeMissing, _extract_domain  # type: ignore[import]


class TestScopeEnforcement:
    def test_raises_scope_missing_without_scope_id(self):
        with pytest.raises(ScopeMissing):
            run_frontend_taint("https://app.example.com", None)

    def test_raises_scope_missing_with_empty_string(self):
        with pytest.raises(ScopeMissing):
            run_frontend_taint("https://app.example.com", "")


class TestMockAnalysis:
    def test_detects_badgerdao_pattern_in_mock_mode(self):
        os.environ["SILICA_MOCK_TOOLS"] = "1"
        try:
            result = run_frontend_taint("https://app.badger.finance/", "scp_test")
            assert result.success is True
            assert len(result.taint_flows) > 0
            assert result.taint_flows[0]["severity"] == "critical"
        finally:
            del os.environ["SILICA_MOCK_TOOLS"]

    def test_scope_artifact_id_in_result(self):
        os.environ["SILICA_MOCK_TOOLS"] = "1"
        try:
            result = run_frontend_taint("https://app.example.com", "scp_badger_2021")
            assert result.scope_artifact_id == "scp_badger_2021"
        finally:
            del os.environ["SILICA_MOCK_TOOLS"]


class TestExtractDomain:
    def test_extracts_https_domain(self):
        assert _extract_domain("https://app.example.com/path") == "app.example.com"

    def test_extracts_http_domain(self):
        assert _extract_domain("http://localhost:3000/") == "localhost:3000"
