"""
Unit tests for Slither output normalization.
Integration tests (Docker container, cgroups) live in tests/integration/tools/.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from normalize import (  # type: ignore[import]
    normalize_slither_finding,
    normalize_batch,
)

EULER_ADDRESS = "0x27182842e098f60e3d576794a5bffb0777e025d3"


class TestNormalizeSlitherFinding:
    def test_maps_high_impact_to_high_severity(self):
        raw = {
            "detector_id": "reentrancy-eth",
            "impact": "High",
            "confidence": "High",
            "description": "Reentrancy in withdraw()",
            "elements": [],
        }
        result = normalize_slither_finding(raw, EULER_ADDRESS, 1)
        assert result["severity_hint"] == "high"

    def test_maps_informational_impact_correctly(self):
        raw = {
            "detector_id": "missing-events-access-control",
            "impact": "Informational",
            "confidence": "Medium",
            "description": "Missing event",
            "elements": [],
        }
        result = normalize_slither_finding(raw, EULER_ADDRESS, 1)
        assert result["severity_hint"] == "informational"

    def test_confidence_prior_high_is_0_90(self):
        raw = {"detector_id": "reentrancy-eth", "impact": "High", "confidence": "High", "elements": []}
        result = normalize_slither_finding(raw, EULER_ADDRESS, 1)
        assert result["confidence_prior"] == 0.90

    def test_confidence_prior_low_is_0_50(self):
        raw = {"detector_id": "test", "impact": "Low", "confidence": "Low", "elements": []}
        result = normalize_slither_finding(raw, EULER_ADDRESS, 1)
        assert result["confidence_prior"] == 0.50

    def test_highest_passed_hint_is_static_signal_only(self):
        raw = {"detector_id": "x", "impact": "High", "confidence": "High", "elements": []}
        result = normalize_slither_finding(raw, EULER_ADDRESS, 1)
        assert result["highest_passed_hint"] == "static-signal-only"

    def test_subject_hint_includes_address_and_chain(self):
        raw = {"detector_id": "x", "impact": "Medium", "confidence": "Medium", "elements": []}
        result = normalize_slither_finding(raw, EULER_ADDRESS, 1)
        assert result["subject_hint"]["address"] == EULER_ADDRESS
        assert result["subject_hint"]["chain_id"] == 1
        assert result["subject_hint"]["vm"] == "evm"

    def test_extracts_function_location(self):
        raw = {
            "detector_id": "reentrancy-eth",
            "impact": "High",
            "confidence": "High",
            "elements": [
                {
                    "type": "function",
                    "name": "withdraw",
                    "source_mapping": {
                        "filename_relative": "contracts/Vault.sol",
                        "lines": [42, 43, 44],
                    },
                }
            ],
        }
        result = normalize_slither_finding(raw, EULER_ADDRESS, 1)
        assert any(
            loc["name"] == "withdraw" and loc["kind"] == "function"
            for loc in result["locations"]
        )


class TestNormalizeBatch:
    def test_processes_empty_list(self):
        result = normalize_batch([], EULER_ADDRESS, 1)
        assert result == []

    def test_processes_multiple_findings(self):
        raw_list = [
            {"detector_id": "reentrancy-eth", "impact": "High", "confidence": "High", "elements": []},
            {"detector_id": "missing-events", "impact": "Low", "confidence": "Medium", "elements": []},
        ]
        result = normalize_batch(raw_list, EULER_ADDRESS, 1)
        assert len(result) == 2
        assert result[0]["severity_hint"] == "high"
        assert result[1]["severity_hint"] == "low"
