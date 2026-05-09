import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import pytest
from run import analyze_multisig, ScopeMissing  # type: ignore

class TestMultisigScope:
    def test_raises_without_scope(self):
        with pytest.raises(ScopeMissing): analyze_multisig("0xSafe", 1, None)

    def test_mock_returns_owners(self):
        os.environ["SILICA_MOCK_TOOLS"] = "1"
        try:
            r = analyze_multisig("0xSafe", 1, "scp_001")
            assert r.success and len(r.owners) > 0
        finally: del os.environ["SILICA_MOCK_TOOLS"]
