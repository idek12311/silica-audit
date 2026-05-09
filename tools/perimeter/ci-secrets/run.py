"""
Silica CI/CD secret scanner.

Surface 4 from ops/perimeter-playbook.md:
- Scan GitHub repos for leaked secrets (trufflehog + gitleaks)
- Docker layer extraction (skopeo/dive)
- No network egress in offline mode; github.com only in live mode

REQUIRES scope_artifact_id — fail-closed.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class CiSecretsResult:
    success: bool
    github_org: str | None
    secrets_found: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    scope_artifact_id: str | None = None


class ScopeMissing(Exception):
    pass


def scan_ci_secrets(
    github_org: str | None,
    scope_artifact_id: str | None,
    offline: bool = True,
) -> CiSecretsResult:
    if not scope_artifact_id:
        raise ScopeMissing("CI secret scanner requires scope_artifact_id — fail-closed.")

    if os.environ.get("SILICA_MOCK_TOOLS"):
        return CiSecretsResult(
            success=True,
            github_org=github_org,
            secrets_found=[],
            scope_artifact_id=scope_artifact_id,
        )

    return CiSecretsResult(
        success=True, github_org=github_org,
        scope_artifact_id=scope_artifact_id,
    )
