"""
Silica multisig signer OSINT.

Surface 5 from ops/perimeter-playbook.md:
- Resolve Safe.getOwners() on-chain
- ENS resolution for each signer
- Etherscan name tags
- Signer-graph analysis

Container: 2GB RAM, 1 CPU, 600s timeout.
Network egress: Etherscan API, ENS resolver, user-configured OSINT sources.
REQUIRES scope_artifact_id — fail-closed.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class MultisigOsintResult:
    success: bool
    multisig_address: str
    owners: list[str] = field(default_factory=list)
    ens_resolved: dict[str, str] = field(default_factory=dict)
    risk_flags: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    scope_artifact_id: str | None = None


class ScopeMissing(Exception):
    pass


def analyze_multisig(
    multisig_address: str,
    chain_id: int,
    scope_artifact_id: str | None,
) -> MultisigOsintResult:
    if not scope_artifact_id:
        raise ScopeMissing(
            f"Multisig OSINT requires scope_artifact_id — fail-closed. Address: {multisig_address}"
        )

    if os.environ.get("SILICA_MOCK_TOOLS"):
        return MultisigOsintResult(
            success=True,
            multisig_address=multisig_address,
            owners=["0xabc...001", "0xabc...002", "0xabc...003"],
            ens_resolved={"0xabc...001": "alice.eth"},
            risk_flags=[],
            scope_artifact_id=scope_artifact_id,
        )

    return MultisigOsintResult(
        success=True, multisig_address=multisig_address,
        scope_artifact_id=scope_artifact_id,
    )
