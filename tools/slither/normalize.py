"""
Converts raw Slither finding dicts into the Silica Finding-context bundle.

Each Slither finding is normalized to a partial Finding shape that the
Analyzer agent can consume. The canonical_id and validation fields are
not populated here — that happens downstream in the orchestrator pipeline.
"""
from __future__ import annotations

from typing import Any

# Slither impact → Silica severity mapping
IMPACT_TO_SEVERITY: dict[str, str] = {
    "High": "high",
    "Medium": "medium",
    "Low": "low",
    "Informational": "informational",
    "Optimization": "informational",
}

# Slither confidence → numeric prior
CONFIDENCE_TO_PRIOR: dict[str, float] = {
    "High": 0.90,
    "Medium": 0.70,
    "Low": 0.50,
}


def normalize_slither_finding(raw: dict[str, Any], source_address: str, chain_id: int) -> dict[str, Any]:
    """
    Converts a raw Slither finding dict (from run.py) into a partial
    Silica Finding-context dict suitable for passing to the Analyzer agent.
    """
    severity = IMPACT_TO_SEVERITY.get(raw.get("impact", ""), "informational")
    confidence_prior = CONFIDENCE_TO_PRIOR.get(raw.get("confidence", "Low"), 0.50)

    # Extract affected function/contract locations from elements
    locations = _extract_locations(raw.get("elements", []))

    return {
        "tool_source": "slither",
        "detector_id": raw.get("detector_id", "unknown"),
        "description": raw.get("description", ""),
        "severity_hint": severity,
        "confidence_prior": confidence_prior,
        "locations": locations,
        "subject_hint": {
            "vm": "evm",
            "address": source_address,
            "chain_id": chain_id,
        },
        # Validation hint — static-only initially
        "highest_passed_hint": "static-signal-only",
    }


def normalize_batch(
    raw_findings: list[dict[str, Any]],
    source_address: str,
    chain_id: int,
) -> list[dict[str, Any]]:
    """Normalizes a list of raw Slither findings."""
    return [
        normalize_slither_finding(f, source_address, chain_id)
        for f in raw_findings
    ]


def _extract_locations(elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    locations = []
    for el in elements:
        loc: dict[str, Any] = {}
        el_type = el.get("type", "")
        name = el.get("name", "")
        source_map = el.get("source_mapping", {})

        if el_type in ("function", "modifier", "variable"):
            loc["kind"] = el_type
            loc["name"] = name
            if source_map:
                loc["filename"] = source_map.get("filename_relative", "")
                loc["lines"] = source_map.get("lines", [])
        elif el_type == "contract":
            loc["kind"] = "contract"
            loc["name"] = name
        else:
            continue

        if loc:
            locations.append(loc)

    return locations
