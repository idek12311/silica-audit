# 8. Verification Gates

## A. Per-phase Six-Layer Review (bob:873-883)

Every `*.review` checkbox is satisfied by a forked reviewer subagent applying the six layers below. Spawn pattern is in `04-parallelization-plan.md` (Per-phase adversarial review template). All six layers are defined within the bob:873-883 framework table; the framework as a whole is the citation, not per-layer line numbers (the bob source presents L1–L6 as rows in a single table).

| Layer | Citation | What the reviewer checks |
|-------|----------|--------------------------|
| **L1 Requirement fidelity** | bob:873-883 | Does the artifact deliver what the phase row asked for? Scope creep? Spec invariants preserved (see §2 Invariants in `01-use-case-frame.md`)? |
| **L2 Logic & edge cases** | bob:873-883 | Empty / boundary / off-by-one inputs? Concurrency / ordering / idempotency? Hostile-input handling (the spec's invariant #2)? |
| **L3 API integrity** | bob:873-883 + bob:884-889 (Lema anti-hallucination — 21 signature mismatches across layers) | Are cited paths, line numbers, type signatures, RPC method names, schema field names real? Every external API call must reference a real endpoint with real method name, real argument order. |
| **L4 Security** | bob:873-883 | Out-of-scope writes? Credential leaks? Injection vectors? Prompt-injection from contract-source comments / NatSpec / strings? Off-chain agent running without `scope_artifact_id`? |
| **L5 Context awareness** | bob:873-883 | Contradictions with prior phases? Reuse of existing patterns? Dependencies on frozen contracts (§7 phase data immutability)? |
| **L6 Test quality** | bob:873-883 + paragraph following the L6 row in bob (commentary on behavioral coverage vs line coverage) | Behavior assertions, not call-graph assertions? Edge cases covered? No `xfail`/skip added? Coverage proven via behavioral mapping not just line %? |

Verdict format (literal, parseable):
```
verdict: approve              # all six PASS
verdict: proceed-with-changes # ≤3 minor findings, none security or API integrity
verdict: block                # any L3 or L4 finding, OR ≥4 findings of any layer
```

## B. Per-build Six-Gate CI (bob:908-918)

Every phase's `.test` checkbox runs the relevant subset of these gates. The full set runs at P20 (final acceptance). Each gate exit code 0 = PASS.

| Gate | Threshold | Command | Expected exit |
|------|-----------|---------|---------------|
| **G1 Coverage** | ≥80% lines on changed code, ≥70% branches, ≥85% functions | `cd /root/Silica && npm run test:coverage` | 0 |
| **G2 Cyclomatic complexity** | <15 per function | `cd /root/Silica && python3 -m radon cc src/ -a -nc` | 0 |
| **G3 Duplication** | <3% (excluding bench fixtures and heuristic templates) | `cd /root/Silica && npx jscpd src/ tools/` | 0 |
| **G4 Security grade** | A (no high/critical) | `cd /root/Silica && npm audit --audit-level=high && python3 -m bandit -r tools/ -lll` | 0 |
| **G5 Max file length** | <300 lines per source file (bench fixtures and migrations exempt) | `cd /root/Silica && python3 /root/.claude/skills/scan-code-smells/scripts/check_code_shape.py /root/Silica/src /root/Silica/tools --max-file-lines 300 --strict` | 0 |
| **G6 Dependency direction** | inward (domain never imports infrastructure / framework / vendor SDK) | `cd /root/Silica && npx depcruise --validate .dependency-cruiser.cjs src/` | 0 |

## C. TDD red-then-green gates (bob:420-427 Three Laws)

For every phase that introduces behavior (P1, P2, P3, P4, P5, P6, P7, P8, P9, P10, P11, P12, P13, P14, P15, P16, P17, P18, P19):

- **RED gate** (per slice within the phase): `npm run test:unit -- <slice-path>` shows ≥1 FAIL before implementation. Evidence: `checkpoints/<phase-id>.red-gate.txt` recording the failing test name and the failure reason.
- **GREEN gate** (per slice within the phase): `npm run test:unit -- <slice-path>` exits 0 after implementation. Evidence: `checkpoints/<phase-id>.green-gate.txt` recording the passing test names.

For P11 specifically (first end-to-end Euler audit), the RED gate runs against the full bench command:
```bash
cd /root/Silica && npm run bench:evm -- --case euler   # exits non-zero pre-P11
```
And the GREEN gate runs the same command post-implementation:
```bash
cd /root/Silica && npm run bench:evm -- --case euler   # exits 0 with state-asserted PoC
```

## D. Drift gate (per-checkpoint)

Every checkpoint write triggers verification that all cited file:line ranges still resolve. The drift gate validates citations to bob, to Silica's design dossier (`notes.md`, `design/`, `ops/`, `research/`), and to `~/.claude/skills/<name>/SKILL.md` files. Run before the checkpoint is finalized:

```bash
# bob + Silica dossier + skill SKILL.md citations
python3 - <<'PY'
import re, pathlib, sys
spec_dir = pathlib.Path('/root/Silica/spec')

# Citation patterns:
#   bob:N or bob:N-M
#   <repo-path>:N or <repo-path>:N-M  (paths under /root/Silica/ or relative like notes.md / design/foo.md)
#   <skill-name>/SKILL.md:N-M

bob_path = pathlib.Path('/root/.claude/bob')
file_lines = {}
def lines_of(p):
    if p in file_lines: return file_lines[p]
    if not pathlib.Path(p).exists():
        file_lines[p] = None
        return None
    n = sum(1 for _ in pathlib.Path(p).open())
    file_lines[p] = n
    return n

bad = []
for f in spec_dir.glob('*.md'):
    text = f.read_text()
    # bob:N(-M)
    for m in re.finditer(r'\bbob:(\d+)(?:-(\d+))?', text):
        start = int(m.group(1)); end = int(m.group(2) or m.group(1))
        n = lines_of(str(bob_path))
        if n and (start < 1 or end > n):
            bad.append((str(f), m.group(0), 'bob OOB'))
    # design/, ops/, research/, notes.md, README.md citations: <relpath>:N(-M)
    for m in re.finditer(r'\b((?:notes|README|design/[\w-]+|ops/[\w-]+|research/[\w-]+(?:/[\w-]+)?|spec/\d{2}-[\w-]+)\.md):(\d+)(?:-(\d+))?', text):
        rel = m.group(1)
        path = pathlib.Path('/root/Silica') / rel
        start = int(m.group(2)); end = int(m.group(3) or m.group(2))
        n = lines_of(str(path))
        if n is None: continue   # path resolution issue, not a drift fault
        if start < 1 or end > n:
            bad.append((str(f), m.group(0), f'OOB (file has {n} lines)'))
    # SKILL.md citations: <skill-name>/SKILL.md:N-M
    for m in re.finditer(r'(\w[\w-]+)/SKILL\.md:(\d+)(?:-(\d+))?', text):
        skill = m.group(1)
        path = pathlib.Path(f'/root/.claude/skills/{skill}/SKILL.md')
        start = int(m.group(2)); end = int(m.group(3) or m.group(2))
        n = lines_of(str(path))
        if n is None: continue
        if start < 1 or end > n:
            bad.append((str(f), m.group(0), f'SKILL OOB (has {n} lines)'))
if bad:
    for f, c, why in bad: print(f'DRIFT: {f}: {c} — {why}')
    sys.exit(1)
print('drift gate: OK')
PY

# skill citation freshness (bash patterns from 05-skill-choreography.md "Citation freshness check")
bash <(sed -n '/^## Citation freshness check/,/^## Skills referenced/p' /root/Silica/spec/05-skill-choreography.md \
       | grep -E '^sed -n')
```

Exit 0 = all citations in range. Exit 1 = at least one citation broken — write `decisions/PIVOT-NNN.md`, fix citations, re-run drift gate, then continue.

## E. Final acceptance gate (P20)

Walk every criterion §A through §O in `02-acceptance-criteria.md`. Log per-criterion pass/fail to `checkpoints/P20.md`. Any FAIL → build NOT done, even if Phase Map is all-checked. Run:

```bash
cd /root/Silica/spec
python3 - <<'PY'
import subprocess, re, pathlib
text = pathlib.Path('02-acceptance-criteria.md').read_text()
sections = re.findall(r'^## ([A-Z])\. (.+?)\n\n```bash\n(.+?)\n```', text, re.S | re.M)
results = []
for letter, name, cmd in sections:
    print(f'### §{letter} — {name}')
    r = subprocess.run(['bash', '-c', cmd], capture_output=True, text=True, cwd='/root/Silica')
    status = 'PASS' if r.returncode == 0 else 'FAIL'
    results.append((letter, name, status, r.returncode))
    print(f'  → {status} (exit {r.returncode})')
fails = [r for r in results if r[2] == 'FAIL']
print(f'\nTotal: {len(results)}; PASS: {len(results)-len(fails)}; FAIL: {len(fails)}')
exit(1 if fails else 0)
PY
```

Plus the spec self-validator:
```bash
python3 /root/.claude/skills/author-agent-spec/scripts/validate_spec.py --strict /root/Silica/spec
```

Both exit 0 → final gate PASS. Any non-zero exit → reviewer block; write `decisions/STOP-P20.md`.

## F. Behavioral coverage audit (P20 sub-gate)

The `check-test-quality` skill runs as part of P20. It verifies that test assertions pin user-visible behavior, not call graphs:

```bash
python3 /root/.claude/skills/check-test-quality/scripts/check_test_intent.py /root/Silica/tests
```

Findings of `behavior-unclear`, `truthy-only`, or `mock-call-only` test names → reviewer reads each → either rewrite to behavioral assertion or document why the call-graph check is the user-visible behavior in `decisions/<phase-id>.test-rationale.md`.

## G. Hostile-input regression (P20 sub-gate)

P20 runs the prompt-injection corpus and tool-bomb tests:

```bash
cd /root/Silica && npm run test:security -- src/llm/   # 3 prompt-injection patterns from notes.md:364-373 (§11.7)
cd /root/Silica && npm run test:security -- tools/      # malformed-Solidity, compiler-bombs, oversize bytecode
```

Each exits 0. Any new injection vector discovered post-launch → ADR + heuristic mint + add to corpus.

## H. Per-phase gate execution

Each phase's `.test` checkbox satisfies a subset of A-G:

| Phase | Required gates | Optional gates |
|-------|---------------|---------------|
| P0 | A (parts) | — |
| P1, P2, P3 | C (RED+GREEN), B/G1, D | B/G6 |
| P4, P5, P6 | C, B/G1, B/G4 (Docker), D | — |
| P7 | C, B/G1, D | — |
| P8 | C, B/G1, B/G6, D | — |
| P9 | C, B/G1, G | — |
| P10 | C, B/G1, B/G6, D | — |
| P11 | C (RED then GREEN against bench:evm euler), B (subset: G1 coverage, G6 boundaries) | — |
| P12, P13 | C per case/heuristic, B/G1 | — |
| P14, P15, P16 | C, B/G1, B/G6 (no EVM imports leak into SVM code), D | — |
| P17, P18 | C, B/G1, G (perimeter tools handle hostile input), D | — |
| P19 | C, B/G1, B/G6 | — |
| P20 | A (all), B (full set), E, F, G, A/six-layer whole-spec review, validate_spec.py --strict | — |

A phase's `.test` checkbox flips to `[x]` only when ALL its required gates pass. Optional gates are advisory at phase-time, mandatory at P20.
