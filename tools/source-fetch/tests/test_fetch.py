"""
Unit tests for the source-fetch tool.

Integration test (P4.test — Euler block 16817993) lives at
tests/integration/tools/test_source_fetch_euler.py.
"""
import json
from unittest.mock import MagicMock, patch

import pytest
import sys
import os

# Allow importing from the source-fetch directory directly
# (directory name has a hyphen, so we use importlib)
_FETCH_DIR = os.path.join(os.path.dirname(__file__), '..')
if _FETCH_DIR not in sys.path:
    sys.path.insert(0, _FETCH_DIR)

from fetch import (  # type: ignore[import]  # noqa: E402
    fetch_source,
    SourceFetchError,
    _fetch_from_etherscan,
    _fetch_from_sourcify,
    _build_manifest,
)


EULER_ADDRESS = "0x27182842e098f60e3d576794a5bffb0777e025d3"


def make_etherscan_success_response(source: str = "contract Foo {}", version: str = "v0.8.19+commit.7dd6d404") -> dict:
    return {
        "status": "1",
        "message": "OK",
        "result": [
            {
                "SourceCode": source,
                "ABI": "[]",
                "ContractName": "EulerVault",
                "CompilerVersion": version,
                "OptimizationUsed": "1",
                "Runs": "200",
                "ConstructorArguments": "",
                "EVMVersion": "Default",
            }
        ],
    }


class TestFetchFromEtherscan:
    def test_parses_single_file_source(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = make_etherscan_success_response("contract Foo {}")
        mock_resp.raise_for_status = MagicMock()

        with patch("fetch.requests.get", return_value=mock_resp):
            result = _fetch_from_etherscan(EULER_ADDRESS, 1, "FAKE_KEY")

        assert result.source_format == "verified_source"
        assert result.etherscan_verified is True
        assert EULER_ADDRESS in result.source_files or f"{EULER_ADDRESS}.sol" in result.source_files

    def test_parses_multi_file_json_source(self):
        multi_source = json.dumps({
            "language": "Solidity",
            "sources": {
                "contracts/EulerVault.sol": {"content": "contract EulerVault {}"},
                "contracts/Interfaces.sol": {"content": "interface IVault {}"},
            },
            "settings": {"optimizer": {"enabled": True, "runs": 200}},
        })
        # Etherscan wraps JSON source in extra braces
        raw = "{" + multi_source + "}"
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = make_etherscan_success_response(raw)
        mock_resp.raise_for_status = MagicMock()

        with patch("fetch.requests.get", return_value=mock_resp):
            result = _fetch_from_etherscan(EULER_ADDRESS, 1, "FAKE_KEY")

        assert "contracts/EulerVault.sol" in result.source_files
        assert "contracts/Interfaces.sol" in result.source_files

    def test_raises_on_etherscan_api_error(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": "0", "message": "NOTOK", "result": []}
        mock_resp.raise_for_status = MagicMock()

        with patch("fetch.requests.get", return_value=mock_resp):
            with pytest.raises(SourceFetchError, match="API error"):
                _fetch_from_etherscan(EULER_ADDRESS, 1, "FAKE_KEY")

    def test_raises_when_no_source_code(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "status": "1",
            "message": "OK",
            "result": [{"SourceCode": "", "ContractName": "", "CompilerVersion": ""}],
        }
        mock_resp.raise_for_status = MagicMock()

        with patch("fetch.requests.get", return_value=mock_resp):
            with pytest.raises(SourceFetchError, match="no verified source"):
                _fetch_from_etherscan(EULER_ADDRESS, 1, "FAKE_KEY")


class TestSourcifyMatchPriority:
    """Sourcify full_match must be tried before partial_match, and the
    sourcify_verified flag must reflect which match served the source."""

    @staticmethod
    def _make_sourcify_response(status: int, files: list[dict] | None = None) -> MagicMock:
        resp = MagicMock()
        resp.status_code = status
        resp.json.return_value = files or []
        return resp

    @staticmethod
    def _files_payload() -> list[dict]:
        metadata = json.dumps({
            "compiler": {"version": "0.8.19+commit.7dd6d404"},
            "settings": {"optimizer": {"enabled": True, "runs": 200}},
        })
        return [
            {"name": "metadata.json", "content": metadata, "path": "metadata.json"},
            {"name": "Foo.sol", "content": "contract Foo {}", "path": "src/Foo.sol"},
        ]

    def test_full_match_short_circuits_partial_match(self):
        full_resp = self._make_sourcify_response(200, self._files_payload())
        partial_resp = self._make_sourcify_response(200, self._files_payload())

        urls_called: list[str] = []
        def mock_get(url, **_kwargs):
            del _kwargs
            urls_called.append(url)
            if "/full_match/" in url:
                return full_resp
            return partial_resp

        with patch("fetch.requests.get", side_effect=mock_get):
            result = _fetch_from_sourcify(EULER_ADDRESS, 1)

        assert result.sourcify_verified is True
        assert len(urls_called) == 1
        assert "/full_match/" in urls_called[0]

    def test_partial_match_used_when_full_match_404(self):
        full_resp = self._make_sourcify_response(404)
        partial_resp = self._make_sourcify_response(200, self._files_payload())

        urls_called: list[str] = []
        def mock_get(url, **_kwargs):
            del _kwargs
            urls_called.append(url)
            if "/full_match/" in url:
                return full_resp
            return partial_resp

        with patch("fetch.requests.get", side_effect=mock_get):
            result = _fetch_from_sourcify(EULER_ADDRESS, 1)

        assert result.sourcify_verified is False
        assert len(urls_called) == 2
        assert "/full_match/" in urls_called[0]
        assert "/partial_match/" in urls_called[1]

    def test_raises_when_both_match_types_404(self):
        resp_404 = self._make_sourcify_response(404)
        with patch("fetch.requests.get", return_value=resp_404):
            with pytest.raises(SourceFetchError, match="no source"):
                _fetch_from_sourcify(EULER_ADDRESS, 1)


class TestFetchSource:
    def test_tries_sourcify_first_then_etherscan(self):
        # Sourcify 404 → fallback to Etherscan
        sourcify_resp = MagicMock()
        sourcify_resp.status_code = 404

        etherscan_resp = MagicMock()
        etherscan_resp.status_code = 200
        etherscan_resp.json.return_value = make_etherscan_success_response()
        etherscan_resp.raise_for_status = MagicMock()

        call_count = 0
        def mock_get(url, **_kwargs):
            del _kwargs  # accept any kwargs the real requests.get takes; ignore them
            nonlocal call_count
            call_count += 1
            if "sourcify.dev" in url:
                return sourcify_resp
            return etherscan_resp

        with patch("fetch.requests.get", side_effect=mock_get):
            result = fetch_source(EULER_ADDRESS, 1, api_key="FAKE_KEY")

        assert result.etherscan_verified is True

    def test_raises_without_api_key_when_sourcify_fails(self):
        sourcify_resp = MagicMock()
        sourcify_resp.status_code = 404

        with patch("fetch.requests.get", return_value=sourcify_resp):
            with patch.dict(os.environ, {}, clear=True):
                # Remove any real ETHERSCAN_API_KEY from env
                os.environ.pop("ETHERSCAN_API_KEY", None)
                with pytest.raises(SourceFetchError, match="ETHERSCAN_API_KEY"):
                    fetch_source(EULER_ADDRESS, 1, api_key=None)


class TestBuildManifest:
    def test_builds_correct_manifest(self):
        manifest = _build_manifest("v0.8.19+commit.7dd6d404", {"optimizer": {"enabled": True, "runs": 200}})
        assert manifest["compiler"]["name"] == "solc"
        assert manifest["compiler"]["version"] == "v0.8.19+commit.7dd6d404"
        assert manifest["compiler_settings"]["optimizer_enabled"] is True
        assert manifest["compiler_settings"]["optimizer_runs"] == 200
