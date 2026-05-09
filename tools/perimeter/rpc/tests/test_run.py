"""Tests for RPC fingerprinter."""
import sys
import os

rpc_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if rpc_dir not in sys.path:
    sys.path.insert(0, rpc_dir)
import pytest
from run import fingerprint_rpc, ScopeMissing, HIGH_RISK_METHODS  # type: ignore[import]


class TestScopeEnforcement:
    def test_raises_without_scope(self):
        with pytest.raises(ScopeMissing):
            fingerprint_rpc("http://localhost:8545", None)


class TestMockMode:
    def test_returns_result_in_mock_mode(self):
        os.environ["SILICA_MOCK_TOOLS"] = "1"
        try:
            result = fingerprint_rpc("http://localhost:8545", "scp_001")
            assert result.success is True
            assert result.endpoint == "http://localhost:8545"
            assert result.high_risk_methods == []
        finally:
            del os.environ["SILICA_MOCK_TOOLS"]

    def test_scope_id_propagated(self):
        os.environ["SILICA_MOCK_TOOLS"] = "1"
        try:
            result = fingerprint_rpc("http://localhost:8545", "scp_rpc_test")
            assert result.scope_artifact_id == "scp_rpc_test"
        finally:
            del os.environ["SILICA_MOCK_TOOLS"]


class TestHighRiskMethods:
    def test_dangerous_methods_listed(self):
        assert "personal_unlockAccount" in HIGH_RISK_METHODS
        assert "admin_stopRPC" in HIGH_RISK_METHODS
        assert "debug_setHead" in HIGH_RISK_METHODS
