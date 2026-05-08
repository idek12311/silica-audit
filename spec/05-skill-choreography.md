# 6. Skill Invocation Choreography

This section names the existing skills the executor invokes per phase. The executor MUST invoke the named skill before performing the corresponding action; skill bodies are the authoritative procedure. Citation freshness check at the bottom verifies cited line ranges before each invocation.

## Choreography table

| Phase | Skill | Why | Invocation | Procedure citation |
|-------|-------|-----|-----------|--------------------|
| P0 | `write-agent-rules` | Author repo CLAUDE.md with enforceable rules | Invoke after repo init; pass `/root/Silica/` as target | `write-agent-rules/SKILL.md:16-44` |
| P0 | `codex` | Apply scaffolding edits (package.json, tsconfig, CI yml) | Plan in main; delegate edits to `codex` | `codex` Skill registry entry only — no SKILL.md |
| P1 | `plan-feature-architecture` | Plan Finding module's domain / application / infrastructure layering | Invoke before any code | `plan-feature-architecture/SKILL.md:20-44` |
| P1 | `choose-better-names` | Name Finding-related types and functions before writing | Invoke after plan, before TDD | `choose-better-names/SKILL.md:17-31` |
| P1 | `code-with-tests-first` | Red-green-refactor for each Finding subcomponent | Invoke per slice (schema, canonical_id, lifecycle) | `code-with-tests-first/SKILL.md:17-35` |
| P1 | `codex` | Execute the planned edits | Per slice | (registry only) |
| P2 | `plan-feature-architecture` | Plan validation tier ladder layering | Same pattern as P1 | `plan-feature-architecture/SKILL.md:20-44` |
| P2 | `choose-better-names` | Name rung enum, handler interface, registry | Pre-code | `choose-better-names/SKILL.md:17-31` |
| P2 | `code-with-tests-first` + `codex` | Implement each rung handler shell | Per rung | `code-with-tests-first/SKILL.md:17-35` |
| P3 | `plan-feature-architecture` | Plan heuristic schema + 3-pool storage layers | Pre-code | `plan-feature-architecture/SKILL.md:20-44` |
| P3 | `choose-better-names` | Name heuristic types, mining agent, drift monitor | Pre-code | `choose-better-names/SKILL.md:17-31` |
| P3 | `code-with-tests-first` + `codex` | Implement schema, store, lifecycle, migrations | Per slice | `code-with-tests-first/SKILL.md:17-35` |
| P4 | `plan-feature-architecture` | Plan source-fetch module (port-and-adapter for Etherscan/Sourcify) | Pre-code | `plan-feature-architecture/SKILL.md:20-44` |
| P4 | `code-with-tests-first` + `codex` | Implement fetcher, compiler matcher, equivalence checker | Per slice | `code-with-tests-first/SKILL.md:17-35` |
| P5 | `plan-feature-architecture` | Plan Slither runner (Docker boundary + JSON normalization) | Pre-code | `plan-feature-architecture/SKILL.md:20-44` |
| P5 | `code-with-tests-first` + `codex` | Implement runner, Dockerfile, normalizer | Per slice | `code-with-tests-first/SKILL.md:17-35` |
| P6 | `plan-feature-architecture` | Plan Foundry runner (anvil pool + fork policy + state snapshot) | Pre-code | `plan-feature-architecture/SKILL.md:20-44` |
| P6 | `code-with-tests-first` + `codex` | Implement runner, anvil pool, snapshot | Per slice | `code-with-tests-first/SKILL.md:17-35` |
| P7 | `claude-api` | Anthropic SDK with prompt caching, model migration discipline | Invoke for the gateway implementation | `claude-api` Skill registry entry only |
| P7 | `code-with-tests-first` + `codex` | Implement gateway, trust-tier router | Per slice | `code-with-tests-first/SKILL.md:17-35` |
| P8 | `plan-feature-architecture` | Plan 5-router architecture; ports for tool/escalation/model/agent/validation | Pre-code | `plan-feature-architecture/SKILL.md:20-44` |
| P8 | `decide-duplicate-code` | Routers will look similar — verify shared logic vs deliberately distinct | Pre-extraction check | `decide-duplicate-code/SKILL.md:16-42` |
| P8 | `code-with-tests-first` + `codex` | Implement each router with tests | Per router | `code-with-tests-first/SKILL.md:17-35` |
| P9 | `code-with-tests-first` + `codex` | Implement Analyzer / Prover / Skeptic agents | Per agent | `code-with-tests-first/SKILL.md:17-35` |
| P9 | `claude-api` | Each agent uses the gateway with role-specific prompts and caching | Per agent | (registry) |
| P10 | `plan-feature-architecture` | Plan orchestrator state machine and event log | Pre-code | `plan-feature-architecture/SKILL.md:20-44` |
| P10 | `code-with-tests-first` + `codex` | Implement state machine, transitions, budget enforcement | Per slice | `code-with-tests-first/SKILL.md:17-35` |
| P11 | `code-with-tests-first` | Drive Euler bench case end-to-end as the canonical TDD slice | RED gate then GREEN | `code-with-tests-first/SKILL.md:17-35` |
| P11 | `codex` | Implement adapter glue between tool layer and agents | Per slice | (registry) |
| P12 | `code-with-tests-first` + `codex` | Per-bench-case slice: failing test → implementation → green | Per case | `code-with-tests-first/SKILL.md:17-35` |
| P12 | `decide-duplicate-code` | Bench-case fixtures will share structure — extract or keep separate? | Pre-extraction | `decide-duplicate-code/SKILL.md:16-42` |
| P13 | `code-with-tests-first` + `codex` | Per-heuristic slice: regression test → heuristic JSON → seed | Per heuristic | `code-with-tests-first/SKILL.md:17-35` |
| P14 | `plan-feature-architecture` | Plan SVM tool layer (Soteria, Anchor IDL analyzer, anchor-test, Trident) | Pre-code | `plan-feature-architecture/SKILL.md:20-44` |
| P14 | `code-with-tests-first` + `codex` | Implement each SVM tool runner with tests | Per tool | `code-with-tests-first/SKILL.md:17-35` |
| P15 | `code-with-tests-first` + `codex` | Implement SVM specialist agents (one per bug class) | Per agent | `code-with-tests-first/SKILL.md:17-35` |
| P15 | `claude-api` | SVM agent prompts use the gateway with caching | Per agent | (registry) |
| P16 | `code-with-tests-first` + `codex` | Per-SVM-bench-case + per-SVM-heuristic slice | Per case / per heuristic | `code-with-tests-first/SKILL.md:17-35` |
| P17 | `plan-feature-architecture` | Plan frontend taint + RPC + scope artifact module | Pre-code | `plan-feature-architecture/SKILL.md:20-44` |
| P17 | `code-with-tests-first` + `codex` | Implement frontend taint analyzer, RPC fingerprinter, scope artifact | Per slice | `code-with-tests-first/SKILL.md:17-35` |
| P18 | `code-with-tests-first` + `codex` | Implement subdomain enum + CI key scan + multisig OSINT | Per slice | `code-with-tests-first/SKILL.md:17-35` |
| P19 | `plan-feature-architecture` | Plan three-pool storage + mining agent + drift monitor | Pre-code | `plan-feature-architecture/SKILL.md:20-44` |
| P19 | `code-with-tests-first` + `codex` | Implement each subcomponent | Per slice | `code-with-tests-first/SKILL.md:17-35` |
| P20 | `find-dead-code` + `make-debt-report` | Pre-publication debt sweep | Run scanners over full repo | `find-dead-code/SKILL.md:11-95,166-174` |
| P20 | `scan-code-smells` | Final structural shape audit | Run before final gate | `scan-code-smells/SKILL.md:16-60` |
| P20 | `check-architecture-boundaries` | Final boundary audit (no domain → infra imports) | Run before final gate | `check-architecture-boundaries/SKILL.md:58-72` |
| P20 | `check-test-quality` | Behavioral coverage audit on the test suite | Run before final gate | `check-test-quality/SKILL.md:18-71` |
| P20 | `review-ai-code` | Whole-spec adversarial review | Spawn forked reviewer (see §4 review template) | `review-ai-code/SKILL.md:25-71` |

## Invocation order (strict sequence within a phase)

For any non-trivial phase, the executor invokes skills in this canonical order:

```
1. plan-feature-architecture     (architecture plan — 8 required outputs)
2. choose-better-names            (name files / functions / types)
3. clean-code-before-change       (only if modifying tangled code)
4. code-with-tests-first          (red-green-refactor per slice)
5. codex                          (apply file edits per slice)
6. decide-duplicate-code          (only if extraction is being considered)
7. simplify                       (post-edit cleanup of the slice)
8. check-test-quality             (behavioral audit, periodically not per-slice)
9. review-ai-code                 (pre-PR / pre-checkpoint review)
```

Skills 1-2 run pre-code; skills 4-7 run per slice; skills 8-9 run at phase completion.

## Citation freshness check

Before any `Read` of a cited skill, verify the cited line still contains the expected text. Run before the executor invokes a skill for the first time in a session:

```bash
sed -n '17,35p' /root/.claude/skills/code-with-tests-first/SKILL.md | grep -q "red.green.refactor" \
  || echo "DRIFT: code-with-tests-first SKILL.md lines 17-35 moved"

sed -n '20,44p' /root/.claude/skills/plan-feature-architecture/SKILL.md | grep -q "Behavior slice" \
  || echo "DRIFT: plan-feature-architecture SKILL.md lines 20-44 moved"

sed -n '17,31p' /root/.claude/skills/choose-better-names/SKILL.md | grep -q "Mine the domain vocabulary" \
  || echo "DRIFT: choose-better-names SKILL.md lines 17-31 moved"

sed -n '58,72p' /root/.claude/skills/check-architecture-boundaries/SKILL.md | grep -q "Run the script" \
  || echo "DRIFT: check-architecture-boundaries SKILL.md lines 58-72 moved"

sed -n '16,42p' /root/.claude/skills/decide-duplicate-code/SKILL.md | grep -q "Same actor" \
  || echo "DRIFT: decide-duplicate-code SKILL.md lines 16-42 moved"

sed -n '18,71p' /root/.claude/skills/check-test-quality/SKILL.md | grep -q "Behavior map" \
  || echo "DRIFT: check-test-quality SKILL.md lines 18-71 moved"

sed -n '25,71p' /root/.claude/skills/review-ai-code/SKILL.md | grep -q "Requirement fidelity" \
  || echo "DRIFT: review-ai-code SKILL.md lines 25-71 moved"

sed -n '16,32p' /root/.claude/skills/clean-code-before-change/SKILL.md | grep -q "two-change rule" \
  || echo "DRIFT: clean-code-before-change SKILL.md lines 16-32 moved"

sed -n '16,60p' /root/.claude/skills/scan-code-smells/SKILL.md | grep -q "File too long" \
  || echo "DRIFT: scan-code-smells SKILL.md lines 16-60 moved"

sed -n '16,44p' /root/.claude/skills/write-agent-rules/SKILL.md | grep -q "Inspect the repo" \
  || echo "DRIFT: write-agent-rules SKILL.md lines 16-44 moved"
```

If any DRIFT line is emitted, stop and write `decisions/PIVOT-NNN.md` describing what changed and update this file's citations before resuming.

## Skills referenced but with no on-disk SKILL.md (registry-only)

Four skills have no SKILL.md on disk; their procedure body is loaded by the runtime at Skill invocation. The executor must invoke these via the Skill tool and follow whatever body the runtime returns:

- `codex` — file edits
- `forge` — alternative file edits (interchangeable with codex)
- `claude-api` — Anthropic SDK best practices
- `simplify` — post-edit cleanup

Per `/tmp/skill-citations.md` notes, the Hermes-vendored `codex` skill at `/root/.hermes/skills/autonomous-ai-agents/codex/SKILL.md` is a different skill and must NOT be cited as the body of the Claude Code `codex` skill.
