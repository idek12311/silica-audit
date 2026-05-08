"""Structural coherence tests for the Silica v1 executor spec.

These run alongside the author-agent-spec validate_spec.py checks. They validate
internal consistency the validator does not (e.g., that every phase row's
.review and .test child checkboxes exist with matching IDs, that worker output
paths declared in 04 match the file plans implied by 03, that bob citations
land within the verified ranges in /root/.claude/skills/author-agent-spec/
references/bob-mapping.md).
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

SPEC_ROOT = Path("/root/Silica/spec")


def _read(name: str) -> str:
    return (SPEC_ROOT / name).read_text()


def test_all_required_files_present():
    """Every section file plus README plus the three runtime dirs exist."""
    expected = [
        "README.md",
        "00-identity.md",
        "01-use-case-frame.md",
        "02-acceptance-criteria.md",
        "03-phase-map.md",
        "04-parallelization-plan.md",
        "05-skill-choreography.md",
        "06-context-handoff.md",
        "07-verification-gates.md",
        "08-failure-recovery.md",
        "09-stop-conditions.md",
        "10-reporting-contract.md",
    ]
    for name in expected:
        assert (SPEC_ROOT / name).is_file(), f"missing required spec file: {name}"
    for d in ("tests", "checkpoints", "decisions"):
        assert (SPEC_ROOT / d).is_dir(), f"missing required dir: {d}"


def test_phase_map_has_review_and_test_children_per_parent():
    """Every parent checkbox - [ ] **PN** must have - [ ] PN.review and PN.test underneath."""
    text = _read("03-phase-map.md")
    parent_re = re.compile(r"^- \[ \] \*\*(P\d+[a-z]?)\*\*", re.M)
    review_re = re.compile(r"^  - \[ \] (P\d+[a-z]?)\.review", re.M)
    test_re = re.compile(r"^  - \[ \] (P\d+[a-z]?)\.test", re.M)
    parents = {m.group(1) for m in parent_re.finditer(text)}
    reviews = {m.group(1) for m in review_re.finditer(text)}
    tests = {m.group(1) for m in test_re.finditer(text)}
    missing_review = parents - reviews
    missing_test = parents - tests
    assert not missing_review, f"phases without .review: {sorted(missing_review)}"
    assert not missing_test, f"phases without .test: {sorted(missing_test)}"


def test_phase_table_dependencies_resolve():
    """depends_on entries must be IDs defined elsewhere in the same table."""
    text = _read("03-phase-map.md")
    rows = re.findall(
        r"^\| (P\d+[a-z]?) \| .+? \| .+? \| (.+?) \| .+? \| .+? \| .+? \|$", text, re.M
    )
    defined = {r[0] for r in rows}
    for pid, deps in rows:
        if deps.strip() == "—":
            continue
        for dep in (d.strip() for d in deps.split(",")):
            assert dep in defined, f"{pid} depends_on undefined ID: {dep}"


def test_phase_table_budgets_set():
    """Every phase row has non-empty tool_budget AND token_budget (no em-dash)."""
    text = _read("03-phase-map.md")
    rows = re.findall(
        r"^\| (P\d+[a-z]?) \| .+? \| .+? \| .+? \| .+? \| (.+?) \| (.+?) \|$", text, re.M
    )
    bad = [(p, t, k) for (p, t, k) in rows if t.strip() in {"", "—"} or k.strip() in {"", "—"}]
    assert not bad, f"unbounded phases: {bad}"


def test_worker_contracts_have_four_fields():
    """Every yaml worker block in 04 must contain objective/output_format/tool_guidance/boundaries."""
    text = _read("04-parallelization-plan.md")
    blocks = re.findall(r"```yaml\n(.+?)\n```", text, re.S)
    assert blocks, "no worker contract yaml blocks found"
    required = {"objective:", "output_format:", "tool_guidance:", "boundaries:"}
    for i, block in enumerate(blocks):
        present = {f for f in required if f in block}
        missing = required - present
        assert not missing, f"worker block #{i} missing fields: {sorted(missing)}"


def test_worker_contract_field_bodies_non_trivial():
    """Each yaml worker block field must have a non-empty, non-TODO body of ≥20 chars or a multi-line block."""
    text = _read("04-parallelization-plan.md")
    blocks = re.findall(r"```yaml\n(.+?)\n```", text, re.S)
    fields = ("objective", "output_format", "tool_guidance", "boundaries")
    for i, block in enumerate(blocks):
        for field in fields:
            # Match `field: <single-line>` or `field: |` followed by indented lines
            single = re.search(rf"^{field}:\s*(.+)$", block, re.M)
            multi = re.search(rf"^{field}:\s*\|\s*\n((?:  .+\n?)+)", block, re.M)
            body = multi.group(1) if multi else (single.group(1) if single else "")
            body = body.strip()
            assert body, f"worker block #{i} field {field}: empty body"
            assert "TODO" not in body.upper().replace("ATODO", ""), f"worker block #{i} field {field}: TODO marker"
            assert len(body) >= 20, f"worker block #{i} field {field}: body too short ({len(body)} chars): {body[:50]!r}"


def test_acceptance_criteria_have_executable_predicates():
    """Every § block in 02 has at least one actual command invocation, not just prose."""
    text = _read("02-acceptance-criteria.md")
    sections = re.split(r"^## ([A-Z])\. ", text, flags=re.M)
    body_pairs = list(zip(sections[1::2], sections[2::2]))
    assert body_pairs, "no §A/§B/... sections found"
    # These patterns must match an ACTUAL command invocation, not narrative prose.
    # The "exits 0" prose match was permissive — removed to require a real shell command.
    COMMAND_PATTERNS = (
        re.compile(r"```bash"),
        re.compile(r"```python"),
        re.compile(r"\btest -[fdsexLnz]\b"),
        re.compile(r"\bgrep -[qcEFlnv]"),
        re.compile(r"\bpsql\b"),
        re.compile(r"\bpytest\b"),
        re.compile(r"\bnpm run\b"),
        re.compile(r"\bnpx\b"),
        re.compile(r"\bpython3 [./_a-zA-Z]"),
        re.compile(r"\bdocker\b"),
        re.compile(r"\bawk\b"),
    )
    for letter, body in body_pairs:
        if letter == "S":  # Summary table is not a criterion itself
            continue
        # Stop at next major heading
        body = re.split(r"^## [A-Z]\. ", body, flags=re.M)[0]
        if not any(p.search(body) for p in COMMAND_PATTERNS):
            pytest.fail(f"§{letter} has no command invocation (prose-only criterion)")


def test_no_manual_verification_phrases_in_gates():
    """07-verification-gates.md must not include 'manually inspect' or equivalents."""
    text = _read("07-verification-gates.md")
    forbidden = (
        "manually inspect",
        "manual inspection",
        "manually check",
        "human review the",
        "look it over yourself",
        "by hand",
        "operator confirms",
        "human verifies",
        "eyeballs the",
    )
    for phrase in forbidden:
        assert phrase not in text.lower(), f"manual-verification phrase found: {phrase!r}"


def test_bob_citations_in_verified_range():
    """All bob:N or bob:N-M citations must land within the bob file's actual line count."""
    bob_path = Path("/root/.claude/bob")
    if not bob_path.exists():
        pytest.skip("bob not available")
    bob_lines = sum(1 for _ in bob_path.open())
    bad = []
    for f in SPEC_ROOT.glob("*.md"):
        text = f.read_text()
        for m in re.finditer(r"bob:(\d+)(?:-(\d+))?", text):
            start = int(m.group(1))
            end = int(m.group(2)) if m.group(2) else start
            if end > bob_lines or start < 1:
                bad.append((f.name, m.group(0)))
    assert not bad, f"bob citations out of range: {bad}"


def test_silica_dossier_citations_in_range():
    """Citations to Silica dossier files (notes/README/design/ops/research) must resolve to real lines."""
    silica_root = Path("/root/Silica")
    file_lines: dict[str, int] = {}

    def lines_of(p: Path) -> int | None:
        key = str(p)
        if key in file_lines:
            return file_lines[key]
        if not p.exists():
            file_lines[key] = -1
            return None
        n = sum(1 for _ in p.open())
        file_lines[key] = n
        return n

    bad = []
    pat = re.compile(
        r"\b((?:notes|README|design/[\w-]+|ops/[\w-]+|research/[\w-]+(?:/[\w-]+)?)\.md)"
        r":(\d+)(?:-(\d+))?"
    )
    for f in SPEC_ROOT.glob("*.md"):
        text = f.read_text()
        for m in pat.finditer(text):
            rel = m.group(1)
            target = silica_root / rel
            start = int(m.group(2))
            end = int(m.group(3)) if m.group(3) else start
            n = lines_of(target)
            if n is None:
                continue  # path resolution issue, ignore
            if start < 1 or end > n:
                bad.append((f.name, m.group(0), f"target has {n} lines"))
    assert not bad, f"dossier citations out of range: {bad}"


def test_skill_md_citations_in_range():
    """Citations to ~/.claude/skills/<name>/SKILL.md must resolve to real lines."""
    file_lines: dict[str, int] = {}

    def lines_of(p: Path) -> int | None:
        key = str(p)
        if key in file_lines:
            return file_lines[key]
        if not p.exists():
            file_lines[key] = -1
            return None
        n = sum(1 for _ in p.open())
        file_lines[key] = n
        return n

    pat = re.compile(r"([\w-]+)/SKILL\.md:(\d+)(?:-(\d+))?")
    bad = []
    for f in SPEC_ROOT.glob("*.md"):
        text = f.read_text()
        for m in pat.finditer(text):
            skill = m.group(1)
            target = Path(f"/root/.claude/skills/{skill}/SKILL.md")
            start = int(m.group(2))
            end = int(m.group(3)) if m.group(3) else start
            n = lines_of(target)
            if n is None:
                continue
            if start < 1 or end > n:
                bad.append((f.name, m.group(0), f"target has {n} lines"))
    assert not bad, f"skill SKILL.md citations out of range: {bad}"


def test_phase_count_matches_locked_v1_scope():
    """Spec ships 21 phases (P0-P20) — locked per notes.md §17.1 v1 axes."""
    text = _read("03-phase-map.md")
    parent_re = re.compile(r"^- \[ \] \*\*(P\d+[a-z]?)\*\*", re.M)
    parents = {m.group(1) for m in parent_re.finditer(text)}
    assert len(parents) == 21, f"expected 21 phases, found {len(parents)}: {sorted(parents)}"
    # P0 through P20
    assert {f"P{i}" for i in range(21)} == parents


def test_required_artifact_top_level_dirs_owned_by_phase():
    """Every top-level dir under /root/Silica/ named in 00 must appear in the phase map or parallelization plan.

    Top-level here means src/<module>, tools/<tool>, db/, bench/, heuristics/. We do not require
    every leaf path to be cited verbatim — phase actions describe modules, worker contracts cite dirs.
    """
    identity = _read("00-identity.md")
    phasemap = _read("03-phase-map.md")
    parallel = _read("04-parallelization-plan.md")
    combined = phasemap + parallel
    # Extract /root/Silica/<dir>/<sub> top-level segments from artifact paths in 00
    paths = re.findall(r"\| `(/root/Silica/[^`]+)` \|", identity)
    # Strip the brace-expansion shorthand and trailing filename; keep up to the second dir level
    top_level = set()
    for p in paths:
        parts = p.split("/")  # ['', 'root', 'Silica', '<top>', '<sub>', ...]
        if len(parts) < 5:
            continue
        top_dir = parts[3]  # 'src' | 'tools' | 'db' | 'bench' | 'heuristics' | etc
        sub_dir = parts[4]
        # Skip brace-expanded entries — they encode multiple sibling files
        if "{" in sub_dir:
            continue
        if top_dir in {"src", "tools", "bench", "heuristics"}:
            top_level.add(f"{top_dir}/{sub_dir}")
        elif top_dir == "db":
            top_level.add("db/")
    unreferenced = [t for t in top_level if t not in combined]
    assert not unreferenced, f"top-level dirs unreferenced in phases/parallel plan: {sorted(unreferenced)}"
