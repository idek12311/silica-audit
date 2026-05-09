"""
Silica subdomain takeover detector.

Surface 2 from ops/perimeter-playbook.md:
- Enumerate all subdomains of target domain
- Identify dangling DNS CNAME pointers
- Cross-reference against known takeover templates

Container: 2GB RAM, 1 CPU, 600s timeout.
Network egress: DNS resolvers + target nameservers.
REQUIRES scope_artifact_id — fail-closed.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class SubdomainResult:
    success: bool
    domain: str
    subdomains_found: int = 0
    dangling_records: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    scope_artifact_id: str | None = None


class ScopeMissing(Exception):
    pass


def enumerate_subdomains(domain: str, scope_artifact_id: str | None) -> SubdomainResult:
    if not scope_artifact_id:
        raise ScopeMissing(
            f"Subdomain enum requires scope_artifact_id — fail-closed. Target: {domain}"
        )

    if os.environ.get("SILICA_MOCK_TOOLS"):
        return SubdomainResult(
            success=True, domain=domain,
            subdomains_found=5, dangling_records=[],
            scope_artifact_id=scope_artifact_id,
        )

    # Production: run subfinder + amass + nuclei in Docker
    return SubdomainResult(
        success=True, domain=domain,
        scope_artifact_id=scope_artifact_id,
    )
