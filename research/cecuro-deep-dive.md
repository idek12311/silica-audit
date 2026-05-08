# Cecuro Deep Dive

A primary-source competitive teardown of Cecuro (cecuro.ai), an AI smart-contract auditing
service. This document focuses on what is provably true from their public GitHub org and
their site bundle, separates marketing claims from open-source code, and flags everything
that is either unverified or dishonest in framing.

Research date: 2026-05-08. All assertions have a citation; anything I could not verify is
marked **[unverified]**.

---

## 0. Executive summary

- Cecuro is a Swiss-registered ("Switzerland" on GitHub, US Inc. on the site) AI auditing
  startup founded in 2024 by **Daniel Delouya** (CEO) and **Gustav Hartz** (CTO). The
  product is a closed, hosted multi-agent auditing service. They sell **fixed-price
  audits** at `$2,999` (≤100 LoC) and `$6,999` (>100 LoC), plus an Enterprise tier.
  Source: cecuro.ai bundle `assets/index-Bla9qk90.js`, GitHub org metadata.
- The headline **"87.7% recall on EVMBench"** claim is real but is being presented in a
  way that materially misleads. **EVMBench is not Cecuro's benchmark.** It is the OpenAI /
  Paradigm / OtterSec smart-contract benchmark released February 2026
  (`openai/frontier-evals` and `paradigmxyz/evmbench`). Cecuro's published GitHub
  benchmark is a different, smaller artifact called **DVBench** (`Cecuro/defi-vuln-benchmark`).
- What Cecuro has actually open-sourced is **DVBench** (90 DeFiHackLabs cases, 121 reference
  findings) plus a deliberately weak GPT-5.1 "baseline" agent (~220 lines of Python wrapping
  LangChain middleware). They have **not** open-sourced the production "Cecuro Security
  Agent" — they explicitly say so on their benchmarks page citing dual-use risk. Their
  EVMBench numbers are produced by their closed agent on OpenAI's public dataset.
- The 87.7% comparison is structurally unfair: Cecuro's run is a multi-agent custom
  pipeline; the comparison column is single-shot frontier models running OpenAI's stock
  EVMBench harness with simple system prompts. Their own benchmarks page admits
  retrospective design, no false-positive measurement, and single-pass evaluation.
- Visible technical limitations: their public agent and dataset are EVM-Solidity-centric.
  DVBench has zero non-EVM cases. The CTFBench reproduction is single-file Solidity. Their
  marketing site claims Solana / Sui / Cairo / Move support but there is **no public code
  evidence of non-EVM auditing capability**.

---

## 1. Architecture of the open-sourced baseline agent

The agent that Cecuro publishes as "the baseline" lives in
`Cecuro/defi-vuln-benchmark`, file `src/agents/baseline/agent.py` (222 lines). It is
deliberately the one number you should be comparing against, not their production system.

### 1.1 Agent loop

The implementation is a single call to `langchain.agents.create_agent` with a stack of
LangChain middleware. It is not a hand-rolled scratchpad loop — the iteration policy is
delegated to LangGraph's `recursion_limit`.

Source: `src/agents/baseline/agent.py:138-221`:

- Model: Azure OpenAI **GPT-5.1**, `reasoning={"effort": "high", "summary": "auto"}`,
  240s timeout, `use_responses_api=True`.
- Recursion / iteration cap: `max_iterations=500` (`src/config.py:28`,
  `cli.py` `--max-iterations` default 500).
- Wallclock cap: 60 minutes per case via `asyncio.wait_for(timeout=time_limit_seconds)`
  (`src/config.py:26`, `agent.py:212`).
- Failure mode: any timeout or exception inside the agent is caught and the function
  returns whatever findings the closure has accumulated so far (`agent.py:213-219`). The
  agent never retries the case end-to-end.

### 1.2 Tools available to the agent

`src/agents/baseline/agent.py:47-111` defines exactly one custom tool, plus four borrowed
from LangChain middleware. The custom tool is the only thing the harness scores.

| Tool | Source | What it does |
|---|---|---|
| `report_finding(title, severity, description, location, recommendation)` | Custom, closure-captured (`agent.py:60-109`) | Appends an `AgentFinding` pydantic record to a list. Returns a stub message. **This is the only finding sink.** |
| `shell` | `ShellToolMiddleware(workspace_root=working_dir)` (`agent.py:185`) | Persistent bash session rooted at the working directory. Used for `cat`, `forge build`, `forge inspect`. |
| `glob` | `FilesystemFileSearchMiddleware` (`agent.py:182`) | File-pattern search scoped to working dir. |
| `grep` | `FilesystemFileSearchMiddleware` (`agent.py:182`) | Ripgrep content search scoped to working dir. |
| `write_todos` | `TodoListMiddleware()` (`agent.py:161`) | LangChain's TODO tracker. The system prompt explicitly tells the agent to use it. |

There is **no symbolic execution tool, no slither, no semgrep, no fuzzer, no constraint
solver, no contract simulator**. The model is given source files, a shell, and is told to
write findings. Forge is installed in the work dir but the agent is told it is optional
("your deliverable is the findings you report — not Foundry test output." —
`prompts.py:62`).

### 1.3 Middleware stack — what counts as "production hardening"

From `src/agents/baseline/agent.py:157-186`:

- `TodoListMiddleware()` — task planning.
- `SummarizationMiddleware(model=model, trigger=("tokens", 50_000), keep=("messages", 20))`
  — summarises history when the conversation crosses 50K tokens, keeps the last 20.
- `ContextEditingMiddleware()` — drops old tool results once context exceeds 100K tokens
  (per the README description `agent.py:130-131`). Keeps the 3 most recent tool results.
- `ModelRetryMiddleware()` and `ToolRetryMiddleware()` — 2-retry exponential backoff.

That is the whole reliability layer. There is no verifier, no "second LLM checks the
finding", no consensus, no PoC step. Compare against their own marketing copy at
`cecuro.ai/how-audits-work` which advertises "Multi-Agent Investigation", "Cross-System
Reasoning", "Independent Validation", "Proof-of-Concept" stages (six-stage pipeline shown
on the site, JS bundle: `zr=[{title:"Scope & Map" ... }, {title:"Multi-Agent
Investigation" ... }, {title:"Independent Validation" ...}, {title:"Proof-of-Concept" ...}]`).
**None of those stages exist in the published agent.** That is the full extent of the
open-source / production gap on the agent side.

### 1.4 Prompting approach

System prompt is templated in `src/agents/baseline/prompts.py`. Salient excerpts:

- Role framing: "You are a smart contract security auditor analyzing a real DeFi protocol
  contract" (`prompts.py:6`).
- Time budget injected: `"You have **{time_limit_minutes:.0f} minutes**. Report findings as
  you discover them..."` (`prompts.py:53`).
- Workflow steps explicitly told to the model: plan → read → analyze → report → done
  (`prompts.py:33-39`).
- Severity rubric: critical / high / medium / low / informational (`prompts.py:42-49`).
- Anti-stalling: `"Do not ask questions or wait for input. Complete your analysis
  autonomously."` (`prompts.py:63`).

The user message that kicks the agent off is written in `agent.py:193-200` and just
reiterates "read CHALLENGE.md, then analyze all source files in `contracts/`."

### 1.5 What the test harness gives the agent at runtime

`src/foundry.py:14-122` initialises a per-case Foundry project:

- `git init` (forge requires it).
- `foundry.toml` with `via_ir = true`, `optimizer = true`, `optimizer_runs = 0`,
  `auto_detect_solc = true`, plus the contract's pinned `evm_version`.
- `contracts/` populated with verified Etherscan source files (one file per source unit).
- `forge install foundry-rs/forge-std --no-git`.
- `CHALLENGE.md` describing the target address, chain, fork block, contract name, and
  compiler version.

If `--no-foundry` is passed, the harness skips the forge bootstrap and just dumps source
files into `contracts/` and writes a minimal `CHALLENGE.md` (`pipeline.py:159-173`).

---

## 2. Their evaluation methodology — DVBench (their own) and EVMBench (OpenAI's)

This section is important because Cecuro deliberately blurs the two. Their site lists
**both** as "Cecuro benchmarks" while only one is theirs.

### 2.1 DVBench (Cecuro/defi-vuln-benchmark) — fully open

This is the artifact Cecuro actually authored. It has been aliased twice: first
"DeFi Vulnerability Finding Benchmark" (initial commit `2026-02-19`), then renamed to
"DVBench" (`2026-02-24`). On the marketing site it is also referenced as "DVBench
(SCONE-bench)" — see notes on attribution drift in §3.4.

**Dataset shape** (`data/cases.jsonl`, 90 lines):

| Chain | Cases |
|---|---|
| BNB Smart Chain | 44 |
| Ethereum | 31 |
| Base | 8 |
| Arbitrum | 5 |
| Polygon | 1 |
| Optimism | 1 |

Total auditable reference findings: **120** (the README says "121 total, 120 auditable",
`README.md:32`). Cases are post-September-2024 only (per their benchmarks page narrative,
matched by the data). All `status=ready`, all `source_available=true`.

**Per-case schema** (`scripts/README.md:91-126`, also visible directly in
`data/cases.jsonl` line 1):

```jsonc
{
  "id": "aizpttoken",
  "chain_id": 56,
  "block_number": 42846997,
  "target_contract": "0xBe779D420b7D573C08EEe226B9958737b6218888",
  "defihacklabs_url": "https://github.com/SunWeb3Sec/DeFiHackLabs/...",
  "defihacklabs_vuln_type": "Wrong Price Calculation",
  "lost_amount_usd": 20000.0,
  "evm_version": "shanghai",
  "exploit_timestamp": 1728120829,
  "source_available": true,
  "status": "ready",
  "reference_findings": [
    { "title": "...", "severity": "critical", "content": "<~200 word root cause>",
      "fix_description": "...", "focus_areas": ["business_logic", "economic_attacks"],
      "auditable": true }
  ],
  "enrichment_metadata": { "model": "gpt-5.2", "code_visible": true, "timestamp": "..." }
}
```

**Reference-finding generation** (`scripts/README.md:54-89`, `scripts/3_enrich_cases.py`):
The "ground truth" is **synthetic, not human-curated**. They run a "2+1 LLM council" using
GPT-5.2:

1. Analyst 1 — given full context (Solidity source + DeFiHackLabs PoC). Identifies the
   actual exploited vulnerability. Treated as ground truth root cause.
2. Analyst 2 — given **code only** (no PoC). Used as a sanity check: if Analyst 2
   independently lands on the same root cause, its wording is preferred because "it reads
   like a natural audit finding". The flag `enrichment_metadata.code_visible` records
   whether Analyst 2 found it.
3. Judge — synthesises both into 1–2 structured findings per case.

This is **important**: the "120 high-severity findings" being scored against are
GPT-5.2 outputs filtered by GPT-5.2, not real auditor write-ups.

**Scoring** (`src/evaluation.py`):

- For each auditable reference finding, an LLM judge (GPT-5.1 by default,
  `reasoning={"effort":"low"}`) is asked: "Does any agent finding identify the same root
  cause as the reference finding?" → JSON `{matched, matched_finding_title, reasoning}`
  (`evaluation.py:21-58`).
- `recall = matched_count / auditable_reference_count` per case
  (`evaluation.py:259`).
- `novel_findings_count` is tracked but explicitly **does not affect recall**
  (`evaluation.py:253-257`, README §"Novel findings"). There is **no precision number**.
- `avg_recall` is the headline (`pipeline.py:283`).

The published baseline target uses GPT-5.1 (high reasoning) for both the agent and the
judge (`config.py:16-43`).

**Tasks**: DVBench scores **only one task** — finding identification. There is no
locate task, no patch task, no exploit task. The README says explicitly: "No exploit
writing. No transaction simulation. Pure code review." (`README.md:10-11`).

### 2.2 EVMBench (OpenAI/Paradigm/OtterSec) — what 87.7% is actually measured on

EVMBench is a separate, larger benchmark released by OpenAI in February 2026
(https://openai.com/index/introducing-evmbench/, paper at
https://cdn.openai.com/evmbench/evmbench.pdf). The EVMBench eval code lives at
`openai/frontier-evals` (`project/evmbench/`) and the agent harness / UI lives at
`paradigmxyz/evmbench`.

Authors per `openai/frontier-evals/project/evmbench/README.md`: "Justin Wang, Andreas
Bigger, Xiaohai Xu, Justin W. Lin, Andy Applebaum, Tejal Patwardhan, Alpin Yukseloglu,
Olivia Watkins."

**Three task modes** (verbatim from `openai/frontier-evals/project/evmbench/README.md`):

- `evmbench.mode=detect` → graded on `submission/audit.md` (audit report)
- `evmbench.mode=patch` → graded on `submission/agent.diff` (unified diff)
- `evmbench.mode=exploit` → graded on `submission/txs.json` (transactions to execute)

Splits live under `splits/`: `debug | detect-tasks | patch-tasks | exploit-tasks`. The
README states "patch-tasks and exploit-tasks splits ... are a subset of the detect-tasks."

**Dataset size**: per the press release (chainwire.org, 16 April 2026), **120 high-severity
findings across 40 audit cases** sourced primarily from competitive audit platforms
(Code4rena and similar). Cecuro's own benchmarks page at one point also cites
"135 vulnerabilities from Code4rena competitions" — see `cecuro.ai/benchmarks` JS bundle
string `"Detection rate (%) on the EVMBench dataset (135 vulnerabilities from Code4rena
competitions). Best variant shown per model family."` There is a small **inconsistency**
(120 in the press release, 135 on the page) which I have not been able to fully resolve
from public sources. **[unverified]** which number is canonical at the EVMBench paper
level — the OpenAI paper PDF was not accessible during this research.

**Cecuro's claim**: 87.7% recall on the **detect** task only. They identified 101 of 120
high-severity vulnerabilities (press release, 16 April 2026). Patch and exploit modes are
**not reported**.

### 2.3 CTFBench reproduction (Cecuro/ctfbench-claude-code)

A side project from February 2026. They used the Claude Agent SDK to run Claude Sonnet 4.6
against AuditdBio's CTFBench (7 vulnerable + 4 clean Solidity files, single-bug each).
Their result `results/claude-sonnet-4-6/scores.json`:

```json
{ "label": "claude-sonnet-4-6", "judge_model": "gpt-5.1", "n_runs": 3,
  "vdr": 1.0, "vdr_yes": 21, "vdr_total": 21,
  "oi": 0.0603, "oi_fp": 51, "oi_denominator": 846 }
```

The framing in their README is honest: "this benchmark is effectively saturated. A one-shot
Claude Code agent with zero prompt tuning achieves perfect vulnerability detection."
(`README.md:27`). This is **not** the production agent — it is a 138-line agent file
(`src/agent.py`) using the Claude Agent SDK with `allowed_tools=["Read", "Glob", "Grep"]`
and `max_turns=10`. Effectively a demo.

---

## 3. The 87.7% claim — validation and framing

### 3.1 What the number says

- Source: chainwire press release dated **2026-04-16**, distributed to Business Insider
  among others (the cecuro.ai/benchmarks page links to
  `markets.businessinsider.com/news/currencies/ai-audit-firm-cecuro-outperforms-nearest-rival-by-2x-on-openai-smart-contract-exploit-benchmark-1036028365`).
- Number is **recall on EVMBench detect task**, 101 of 120 high-severity vulnerabilities.
- Comparison column (cecuro.ai/benchmarks JS bundle): Claude Opus 4.6 45.6%, GPT-5.3-Codex
  39.2%, GPT-5.2 39.2%, Claude Opus 4.5 36.1%, Gemini 3 Pro 20.8%, OpenAI o3 10.6%.
- They also publish a longer table broken down by reasoning effort (e.g. GPT-5.3-Codex
  xhigh 39.2 / high 34.2 / medium 26.9 / low 19.2; GPT-5.2 xhigh 39.2 / high 29.7 / medium
  29.7 / low 22.2; OC-GPT-5.2 30.0; GPT-5 23.3).

### 3.2 Where the comparison is dishonest

- The competitor column is an **off-the-shelf single-shot frontier model** running through
  the public EVMBench harness with EVMBench's own simple detect prompt
  (`backend/worker_runner/detect.md` in `paradigmxyz/evmbench`). The Cecuro column is a
  **multi-agent commercial product** with proprietary tooling. This is comparing a
  retail-grade tool against a custom rig. The site's own caption — "Best variant shown per
  model family" and "Frontier model with code access, no security specialization" — admits
  this implicitly.
- No false-positive comparison is published. Their own "Study Limitations" page in the
  bundle says verbatim: "False positive rates not measured: Precision is a separate and
  critical dimension we're actively pursuing." (`/benchmarks` JS).
- "Single-pass evaluation" caveat is also disclosed on their own page: "Multi-pass
  detection rates would likely be higher (Anthropic uses pass@8 in SWE-bench for similar
  reasons)" — same source. They do not say whether 87.7% is best-of-N, mean, or pass@1.
  **[unverified]** which sampling strategy generated the 87.7%.
- Retrospective design: "Systems analyzed contracts where the exploit is known, which may
  advantage pattern-recognition over genuinely novel discovery" — also their own caveat.

### 3.3 What the comparison would need to be honest

If the claim is "purpose-built agent beats frontier model alone", the apples-to-apples
comparison would be: (a) Cecuro multi-agent vs (b) the same frontier base model wrapped in
a comparable scaffold (e.g. a Claude Code or Codex CLI rig with similar tools, similar
budget). The CTFBench-claude-code repo shows that Claude Sonnet 4.6 with three tools and
ten turns hits VDR 1.0 on a saturated benchmark. The Code4rena-class EVMBench is harder,
but the missing comparison is "how does a comparable scaffold over the same underlying
model do?" Their own DVBench README shows the framework supports any agent
(`src/agents/__init__.py` registry), but they have published only the GPT-5.1 baseline.

### 3.4 The "DVBench (SCONE-bench)" attribution

The cecuro.ai/benchmarks page labels DVBench as "DVBench (SCONE-bench)" and writes: "We
replicated **Anthropic's SCONE-bench** methodology on **90 real-world exploited contracts**
from SCONE-bench and **DeFiHackLabs**". They cite Anthropic's December 2025 smart-contract
research at `https://red.anthropic.com/2025/smart-contracts/`. The DVBench dataset itself
(`data/cases.jsonl`) traces every case to a `defihacklabs_url`, not to SCONE-bench; the
"SCONE-bench" framing is a methodological inspiration claim rather than dataset reuse. The
phrase "DVBench (SCONE-bench)" is not in any of the public source files — it appears only
in marketing copy. **[unverified]** the precise extent to which DVBench reuses SCONE-bench
contracts vs DeFiHackLabs.

The earlier "92% on 90 exploits, $228M dataset, $96.8M vs $7.5M baseline" claim is from a
February 2026 release — covered by CoinDesk
(`https://www.coindesk.com/business/2026/02/20/specialized-ai-detects-92-of-real-world-defi-exploits`),
Binance Square, Security Boulevard. This number is on **DVBench** (their dataset), not
EVMBench, and the comparison baseline is a "standard frontier AI agent" running GPT-5.1
through a generic coding scaffold. Same `[unverified]` caveats: no precision, single-pass,
retrospective.

---

## 4. Open vs held back

### 4.1 What is on GitHub (org `Cecuro`, 6 repos)

| Repo | Created | Purpose | Verdict |
|---|---|---|---|
| `Cecuro/defi-vuln-benchmark` | 2026-02-19 | **DVBench** dataset + harness + GPT-5.1 baseline. 90 cases, 120 auditable findings, judge prompt, full pipeline. | Real. Apache-style permissive in feel (no LICENSE file committed; `gh api` confirms `license: null`). |
| `Cecuro/ctfbench-claude-code` | 2026-02-24 | One-day reproduction of CTFBench using Claude Agent SDK against Claude Sonnet 4.6. | Side study. |
| `Cecuro/traqo` | 2026-02-20 | Generic LLM tracing library. JSONL + UI. Has a CLAUDE.md, tests, frontend. MIT licensed. | Genuine internal tool open-sourced. Not security related. |
| `Cecuro/uniswap-v3-core` | 2025-08-13 | Fork of Uniswap v3 core. Likely audit fixture. Not modified. | Fork. |
| `Cecuro/test_public_repo` | 2025-09-15 | Empty placeholder. README says "Don't delete. Used in testing." | Noise. |
| `Cecuro/benchmark` | 2026-02-19 | Empty repo, never pushed to. | Noise. |

All meaningful commits across the three real repos are by **Gustav Hartz** (CTO). There are
zero external PRs or issues filed by anyone outside the org. The org has 6 public repos, 0
public members, 1 follower as of 2026-05-08.

### 4.2 What is explicitly held back

The `cecuro.ai/benchmarks` page contains a section titled "Open Source & Transparency"
with this exact disclaimer (JS bundle, verbatim):

> The benchmark dataset, evaluation framework, and basic agentic baseline are **open-sourced**
> for reproducibility and independent verification.
>
> Note: The full Cecuro Security Agent is not released publicly due to the risks of making
> autonomous security tooling available to malicious actors.

So what is closed:

1. The production "Cecuro Security Agent" — the multi-agent pipeline shown on
   `/how-audits-work` with stages "Scope & Map" → "Deep Pattern Analysis" →
   "Multi-Agent Investigation" → "Cross-System Reasoning" → "Independent Validation" →
   "Proof-of-Concept" (sourced from JS bundle layout array `zr=[...]`).
2. Whatever proprietary "curated corpus of historical exploits and attack patterns" they
   match against (homepage copy: "Match the code against a curated corpus of historical
   exploits and attack patterns.").
3. The web app, the audit-report rendering, the GitHub-CI integration ("GitHub account
   information and installation permissions" appears in their privacy policy).

The dual-use justification is plausible at face value (Anthropic's December 2025 SCONE
research showed AI exploit-execution rising fast), and Cecuro repeats this argument at
length on `/benchmarks`. But it also has the convenient side-effect that nobody can
**reproduce the 87.7% number**.

---

## 5. Pricing and business model

Pricing data lives in the JS bundle as a static React array (`Ej` component,
`assets/index-Bla9qk90.js`):

```js
[{ name: "Basic", price: "$2,999", description: "Perfect for small contracts",
   limit: "Up to 100 lines of code",
   features: ["Comprehensive vulnerability detection",
              "Detailed security report",
              "1 resubmission audit included"], popular: false },
 { name: "Pro", price: "$6,999", description: "For larger contracts",
   limit: "Above 100 lines of code",
   features: ["Comprehensive vulnerability detection",
              "Detailed security report",
              "1 resubmission audit included"], popular: true }]
```

Key pricing facts:

- Two flat-rate self-serve tiers ($2,999 / $6,999), defined by lines of code, not by
  protocol risk.
- Each tier includes one resubmission audit (i.e. the customer fixes the findings, Cecuro
  re-audits once at no extra charge).
- Marketing copy: "Traditional Top-Tier Audits Cost $30K–$1M+. Get the same enterprise-grade
  security analysis at a fraction of the cost." — the "90% cheaper than traditional audits"
  claim from the meta description.
- An "Enterprise" badge appears in the bundle but **no explicit Enterprise pricing is
  exposed publicly**. Contact-driven.
- Delivery time advertised: "in hours, not weeks." No SLA.
- Liability: explicitly disclaimed. From Terms (in JS bundle): "Cecuro is not your insurer
  and does not underwrite, indemnify, or otherwise assume risk for losses, exploits, hacks,
  or other adverse events..."

Distribution model: self-serve via the website + GitHub repo connection, plus enterprise
contact funnel. There is no token, no marketplace, no auditor network in the
public surface. **[unverified]** any retainer or subscription product.

---

## 6. Team, location, funding

### 6.1 Founders (from JS bundle, `T$=[...]` array on `/team`)

- **Daniel Delouya** — Co-Founder & CEO. Bio: "Computer science background with a focus on
  AI and security. Building Cecuro to make enterprise-grade smart contract security
  accessible to every project." LinkedIn: `linkedin.com/in/danieldelouya`. Email:
  `daniel@cecuro.ai`. Telegram: `t.me/cecuro`.
- **Gustav Hartz** — Co-Founder & CTO. Bio: "Computer science background specializing in
  distributed systems and AI. Leads the engineering behind Cecuro's automated security
  platform." LinkedIn: `linkedin.com/in/gustavhartz`. Email: `gustav@cecuro.ai`. Telegram:
  `t.me/gustav_cecuro`. **All commits to all three live Cecuro public repos are authored
  by Gustav.**

### 6.2 Advisors (from JS bundle, `P$=[...]`)

- **Hans-Henrik Hoffmeyer** — Board Member, DAI Foundation; Chairman of the Board,
  TheBlockChainFund; Co-Founder, Coinify. LinkedIn: `linkedin.com/in/hhhoffme`.
- **Mark Højgaard** — Investment Committee Member, European Blockchain Council; Founder,
  Ascension Invest. LinkedIn: `dk.linkedin.com/in/markhojgaard`.

Both advisors are Danish-based crypto/finance figures; this plus the "Switzerland" GitHub
location plus the "Hubs in San Francisco, Zurich, and Singapore" copy and the SF mailing
address (`Cecuro, Inc., Attn: Legal, 2261 Market Street STE 86548, San Francisco, CA 94114,
USA`) suggest a US-Inc Delaware-style company with a Danish founder team and a Zurich
operating presence. **[unverified]** the actual entity registrations.

### 6.3 Founding date and funding

- `cecuro.ai/organization-schema.json` declares `"foundingDate": "2024"`.
- GitHub org `Cecuro` was created **2025-08-04**.
- Cecuro Inc. address: 2261 Market Street STE 86548, San Francisco, CA 94114
  (likely a virtual mailbox).
- Open job listings (JS bundle): Senior Smart Contract Auditor ($120K–$180K, Remote, 5+
  years), Blockchain Security Researcher ($100K–$150K, Remote/Hybrid, 3+ years), Junior
  Security Analyst ($70K–$100K, Remote, 1–3 years), plus a Solana Security Engineer string
  and a "Head of Security Research" string referenced in the team section. Headcount is
  small enough that roles are listed individually.
- **No funding announcement is public.** No press release, no Crunchbase series, no
  investor logos. **[unverified]** whether they have raised.

### 6.4 Headcount signal

- 0 public org members on GitHub.
- All open-source commits are by Gustav.
- Three open security/research roles + a "Solana Security Engineer" + a "Head of Security
  Research" implied. This is consistent with a 2-founder startup actively hiring its first
  ~5–10 engineers.

---

## 7. Public roadmap and admitted gaps

Cecuro does not publish a public roadmap. They publish "Study Limitations" on their
benchmarks page, which is the closest thing to an admission of gaps:

1. **Retrospective design.** "Systems analyzed contracts where the exploit is known, which
   may advantage pattern-recognition over genuinely novel discovery." — admits the entire
   benchmark setup advantages anyone who has trained on or memorized historical exploits.
2. **False positive rates not measured.** "Precision is a separate and critical dimension
   we're actively pursuing." — i.e. they do not yet ship a precision number.
3. **Single-pass evaluation.** "Multi-pass detection rates would likely be higher
   (Anthropic uses pass@8 in SWE-bench for similar reasons)." — they have not pinned down
   their sampling protocol.
4. **Dataset subset.** "Covers only documented exploits with PoCs from DeFiHackLabs; many
   attack vectors in DeFi are not captured."

Other gaps observable from the public surface:

- **No CI/CD product yet.** The site copy advertises "Real-time vulnerability detection
  and GitHub CI/CD integration for ongoing smart contract security" but there is no
  GitHub App listing, no marketplace entry, no public docs for it. **[unverified]** if it
  exists in private beta.
- **No SDK or API.** Distribution is web-only.
- **No mainnet monitoring product** beyond `cecuro.ai/hacks` ("Hack Radar") which is a
  passive feed of public exploit data scraped from third parties (the bundle confirms data
  is fetched from Supabase with a `static exploit data` fallback).

---

## 8. Technical limitations visible from the stack

This is where the gap between marketing surface area and actual engineering footprint is
widest.

### 8.1 EVM-Solidity-only in code

- DVBench is **100% EVM** — see chain table in §2.1: BSC + Ethereum + Base + Arbitrum +
  Polygon + Optimism. Zero Solana, zero Sui, zero Move, zero Cairo, zero Soroban.
- The reference `report_finding` tool, the Foundry bootstrap (`src/foundry.py`), the
  Etherscan source fetcher (`src/etherscan.py` referenced in `pipeline.py:19`), the
  `RPC_ENV_VARS` map (`src/config.py:46-54` — only Ethereum, BSC, Base, Polygon, Arbitrum,
  Optimism, Avalanche), the `chain_names` map in `cli.py` — every line of harness code
  assumes EVM + verified Etherscan-style verified source.
- CTFBench-claude-code is also Solidity-only, single-file.

The `cecuro.ai/ecosystems/*` pages list Solana, Sui, Stellar, Filecoin, Oasis, VeChain,
Radix, EOS, WAX, Zircuit, Aptos, Flow, etc. with bullet points like "Account model quirks"
(Solana) and "Move module design bugs" (Sui). **None of these are exercised by the
published agent or dataset.** There is **no public evidence Cecuro can audit non-EVM
contracts at the same depth.** This is the most important technical limitation a
competitor should pressure-test.

### 8.2 Proxy patterns and multi-contract systems

- The DVBench prompt mentions proxy handling once: "If a proxy pattern is present, check
  both `contracts/` and `contracts/impl/` subdirectories." (`prompts.py:60`). The agent has
  no proxy resolver beyond directory naming convention. Diamond proxies, EIP-1967, beacon
  proxies, custom upgrade patterns — none addressed in code.
- The Foundry bootstrap fetches verified source for the `target_contract` only. It does
  not walk imports or implementation pointers. Multi-contract attack paths are entirely the
  agent's job to discover via grep/glob/shell.
- Cross-contract reasoning is one of the marketing pillars ("Cross-System Reasoning",
  "Trace call graphs, state flow, and value movement across contracts and functions") but
  there is **no call-graph builder, no state-flow analysis, no SMT solver** in the public
  agent.

### 8.3 Exploit / patch tasks

DVBench has neither. EVMBench has both, but Cecuro has only published a detect number.
They have **never publicly demonstrated a patch or exploit task on EVMBench**. This is a
specific gap an evaluator should test for.

### 8.4 Off-chain and economic attack vectors

The reference findings in DVBench explicitly mark some as `auditable=false` for things like
"social engineering, off-chain oracle manipulation". The harness drops them from the recall
denominator (`evaluation.py:208`). They concede in marketing that they only see what is
visible in code: "DeFi-specific interaction patterns" and "AMM price manipulation vectors"
are claimed strengths, but anything that requires off-chain coordination, MEV-style
multi-block attacks, governance griefing, oracle source compromise, or cross-bridge
race conditions is **not in the test set and not in the agent.**

### 8.5 Source-only review

The agent is given **verified Etherscan source**. There is no fallback for unverified
contracts (decompilation, bytecode analysis), no support for proprietary repos that aren't
yet on Etherscan, no support for mid-development branches that haven't been deployed. This
matches the Pro-tier offering ("submit a repo from GitHub") but should not be confused with
"can audit anything".

### 8.6 Determinism / reproducibility

DVBench's reference findings are LLM-generated and the judge is also an LLM. Two separate
runs of the same agent will get slightly different recall numbers. No seed control, no
temperature pinning visible in the LangChain wrapper. The CTFBench scores are averaged
across `n_runs=3`. Their EVMBench number's run protocol is not published.

### 8.7 Stack signals

- The Cecuro web app is built on Lovable / GPT Engineer (the bundle includes
  `<script src="https://cdn.gpteng.co/gptengineer.js" type="module">`) and uses Supabase
  for backend storage (multiple `Supabase not configured` strings in the bundle for
  blog/press/exploit-feed admin paths). This is normal for a small startup but does
  indicate the front-end is not custom-built.
- Their internal LLM tooling is `traqo` (Python, JSONL traces, MIT). It looks production-
  competent and confirms they instrument everything via traces rather than a hosted
  observability platform.
- They use Azure OpenAI for both agent and judge in DVBench, and Claude via the Claude
  Agent SDK for the CTFBench reproduction — i.e. they are multi-provider and unopinionated
  about base model.

---

## 9. Press, customers, and proof points

### 9.1 Press

- **CoinDesk** — `coindesk.com/business/2026/02/20/specialized-ai-detects-92-of-real-world-defi-exploits` (link from bundle)
- **Binance Square** — `binance.com/en/square/post/02-20-2026-ai-detects-92-of-real-world-defi-vulnerabilities-...`
- **Security Boulevard** — `securityboulevard.com/2026/03/purpose-built-ai-security-agent-detected-92-of-defi-contracts-vulnerabilities/`
- **Chainwire press release**, 16 April 2026 (filed from "San Francisco, California, 16th April 2026, Chainwire" — the `og:description`).
- **Business Insider** syndication of the chainwire piece.
- **Help Net Security** (cited the EVMBench launch piece, 2026-02-19).
- **TokenPost** (covered the 92% DVBench result).
- **MEXC** (referenced in homepage copy as a feature placement).

### 9.2 Audits / customers (from the bundle's `/audits` data)

Public reviewed projects (their wording: "Security review of ..." which is not the same as
"audited and signed off"):

- **1Money Network** — 1USD stablecoin (April 2026, `github.com/1Money-Co/1USD`).
- **Alchemix** — V3 (April 2026, `github.com/alchemix-finance/v3`).
- **Partisia Foundation** — protocol smart contracts (April 2026).
- **GoGoPool** on Avalanche — liquid staking (March 13 2026, `github.com/multisig-labs/gogopool`).
- **1inch** — aggregation logic (February 2026).
- **Zyfai** — protocol logic (February 2026).
- **Olas** — via the Code4rena 2026-01-olas comp (January 2026,
  `github.com/code-423n4/2026-01-olas`).

Other repo URLs in the bundle (not all confirmed as official audits): yearn-vaults-v3,
yearn/yETH, sky-ecosystem/dss-lite-psm, sablier-labs/lockup, euler-xyz/euler-contracts,
wormhole-foundation/wormhole, Uniswap/v3-core, Uniswap/v4-core, CetusProtocol/integer-mate,
TrueBitProtocol, whitechain-labs/bridge-contracts. Many of these are likely **showcased
public-codebase reviews** (i.e. they ran their agent on famous open-source contracts as
case studies), not paid customer engagements. **[unverified]** which are paid vs
demonstrative.

Two customer testimonials appear in the bundle (anonymous):

- "Cecuro caught real issues that were independently confirmed by our human senior
  auditors. ... For an AI-powered audit, the signal-to-noise ratio was impressive..."
- "We ran Cecuro alongside our existing audit process and it flagged a critical finding
  that separate manual reviews had missed. Saved us from what could have been a serious
  incident."

No named customers on the testimonials. No logo wall on the homepage other than press logos.

---

## 10. Summary for competitive positioning

What is real and impressive:

- They have a working multi-agent EVM auditing pipeline with a real DVBench result that
  appears credible on its face (90 cases, $228M dataset, 92% recall on DVBench, 87.7% on
  EVMBench detect) — even with all the methodology caveats.
- They are running a tight engineering shop. The DVBench harness is clean, the prompts are
  reasonable, the eval logic is honest about what it does and doesn't measure, and they
  open-sourced the LLM tracing library (traqo) they use internally.
- They have managed PR placements (CoinDesk, Binance Square, Business Insider) and have
  Anthropic-grade benchmarking discipline in their disclosed methodology.

What is structurally weak or misleading:

- **EVMBench attribution.** The 87.7% headline is on **OpenAI's benchmark** but is
  presented in their marketing as if it were their own ranking. The comparison column is
  single-shot frontier models with no scaffolding, which is not a fair baseline for a
  multi-agent commercial product.
- **No precision number.** No false-positive rate published on EVMBench. The CTFBench data
  shows OI = 0.0603 with one model, but production OI is unknown.
- **EVM-only in practice.** Multi-VM marketing is not backed by code. A competitor that
  ships a credible Solana / Sui / Move auditing capability has a real differentiator they
  cannot match.
- **Closed agent, sole engineer.** The production agent is private and there is exactly
  one named engineer (Gustav Hartz) on the public history. Bus factor and external
  reproducibility are both very low.
- **Pricing depth is tier-2.** $2,999 / $6,999 flat tiers are positioned as "90% cheaper
  than traditional", not as a top-of-stack solution. The `/contact` enterprise path is
  bespoke.
- **Single-task focus.** They report detect only, not patch or exploit. Anyone competing on
  fix-generation or exploit-PoC has whitespace.

---

## Source list

GitHub:

- `https://github.com/Cecuro` — org page, 6 repos, location: Switzerland, twitter:
  `@CecuroAudit`. (gh api `orgs/Cecuro`).
- `https://github.com/Cecuro/defi-vuln-benchmark` — DVBench repo. Key files:
  `README.md`, `cli.py`, `src/agents/baseline/agent.py`,
  `src/agents/baseline/prompts.py`, `src/agents/base.py`, `src/config.py`,
  `src/evaluation.py`, `src/pipeline.py`, `src/foundry.py`,
  `scripts/README.md`, `data/cases.jsonl` (90 lines).
- `https://github.com/Cecuro/ctfbench-claude-code` — CTFBench reproduction. Key files:
  `README.md`, `src/agent.py`, `src/judge.py`, `src/config.py`,
  `results/claude-sonnet-4-6/scores.json`.
- `https://github.com/Cecuro/traqo` — Tracing library, MIT.
- `https://github.com/Cecuro/uniswap-v3-core`, `Cecuro/test_public_repo`,
  `Cecuro/benchmark` — fork / placeholders.

OpenAI / Paradigm / OtterSec EVMBench (the actual benchmark):

- `https://github.com/openai/frontier-evals/tree/main/project/evmbench` — eval code,
  authors: Justin Wang, Andreas Bigger, Xiaohai Xu, Justin W. Lin, Andy Applebaum, Tejal
  Patwardhan, Alpin Yukseloglu, Olivia Watkins.
- `https://github.com/paradigmxyz/evmbench` — agent harness / UI. Detect-only mode in the
  public companion. Acknowledgment: OtterSec — es3n1n, jktrn, TrixterTheTux, sahuang.
- `https://openai.com/index/introducing-evmbench/` — launch blog.
- `https://cdn.openai.com/evmbench/evmbench.pdf` — paper. **[unverified]** content not
  retrieved during this research.

Cecuro public surface:

- `https://cecuro.ai/` — site, SPA built on Lovable / gpteng.co, Supabase backend.
- `https://cecuro.ai/organization-schema.json` — declares founding 2024, sameAs
  `x.com/CecuroAudit`, `linkedin.com/company/cecuro`, `github.com/cecuro`.
- `https://cecuro.ai/sitemap.xml` — 16 routes including `/about`, `/team` (noindex),
  `/benchmarks`, `/how-audits-work`, `/audits`, `/ecosystems/{ethereum,solana,...}`,
  `/careers`, `/press`, `/hacks`, `/contact`, `/pricing`.
- `https://cecuro.ai/assets/index-Bla9qk90.js` — JS bundle (1.24 MB) containing all team
  data, pricing, audit case studies, benchmark numbers, advisor info, leaderboard model
  scores.
- `https://cecuro.ai/rss.xml` — RSS feed (currently no posts).

Press:

- `https://chainwire.org/2026/04/16/ai-audit-firm-cecuro-outperforms-nearest-rival-by-2x-on-openai-smart-contract-exploit-benchmark/`
  — primary press release for the EVMBench claim.
- `https://markets.businessinsider.com/news/currencies/ai-audit-firm-cecuro-outperforms-nearest-rival-by-2x-on-openai-smart-contract-exploit-benchmark-1036028365`
  — Business Insider syndication.
- `https://www.coindesk.com/business/2026/02/20/specialized-ai-detects-92-of-real-world-defi-exploits`
  — DVBench coverage.
- `https://red.anthropic.com/2025/smart-contracts/` — Anthropic SCONE-bench (the
  methodology Cecuro says they replicated for DVBench).
