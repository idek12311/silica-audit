"""Unit tests for Soteria runner (no Docker dependency)."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from run import _parse_soteria_json, _map_severity  # type: ignore[import]


class TestParseSoteriaJson:
    def test_parses_empty_array(self):
        assert _parse_soteria_json("[]") == []

    def test_parses_finding(self):
        raw = '[{"type": "SVM-SYSVAR-SPOOFING", "severity": "high", "message": "Sysvar not verified"}]'
        result = _parse_soteria_json(raw)
        assert len(result) == 1
        assert result[0]["detector_id"] == "SVM-SYSVAR-SPOOFING"
        assert result[0]["severity_hint"] == "high"
        assert result[0]["highest_passed_hint"] == "static-signal-only"

    def test_handles_invalid_json(self):
        assert _parse_soteria_json("not json") == []

    def test_all_subject_hints_have_svm_vm(self):
        raw = '[{"type": "test", "severity": "low", "message": "x"}]'
        result = _parse_soteria_json(raw)
        assert result[0]["subject_hint"]["vm"] == "svm"


class TestMapSeverity:
    def test_high(self):
        assert _map_severity("High") == "high"

    def test_informational(self):
        assert _map_severity("Info") == "informational"

    def test_unknown_defaults_informational(self):
        assert _map_severity("unknown") == "informational"
