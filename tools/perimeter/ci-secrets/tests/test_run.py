import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import pytest
from run import scan_ci_secrets, ScopeMissing  # type: ignore

class TestCiSecretsScope:
    def test_raises_without_scope(self):
        with pytest.raises(ScopeMissing): scan_ci_secrets("myorg", None)

    def test_mock_returns_result(self):
        os.environ["SILICA_MOCK_TOOLS"] = "1"
        try:
            r = scan_ci_secrets("myorg", "scp_001")
            assert r.success and r.github_org == "myorg"
        finally: del os.environ["SILICA_MOCK_TOOLS"]
