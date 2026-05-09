import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import pytest
from run import enumerate_subdomains, ScopeMissing  # type: ignore

class TestSubdomainScope:
    def test_raises_without_scope(self):
        with pytest.raises(ScopeMissing): enumerate_subdomains("example.com", None)

    def test_mock_returns_result(self):
        os.environ["SILICA_MOCK_TOOLS"] = "1"
        try:
            r = enumerate_subdomains("example.com", "scp_001")
            assert r.success and r.domain == "example.com"
        finally: del os.environ["SILICA_MOCK_TOOLS"]
