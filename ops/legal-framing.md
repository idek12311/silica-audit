# Legal & Compliance — v0 framing

> Audit firms get sued. Off-chain agents touch other people's infra. Findings can be weaponized. This doc enumerates the risks and proposes mitigations. Not legal advice — counsel review required before launch.

## Risk 1 — Audit liability

**Risk:** Client claims our audit missed a bug, sues for protocol losses.

**Mitigations:**
- Standard scope-of-work contract with limitation-of-liability clause (cap at audit fee × N, typical N=1–3).
- Explicit "audit is not insurance" disclaimer.
- Versioning: every report includes the toolchain manifest, agent versions, and rung depth — defense against "you should have caught X" requires showing the audit covered the relevant rung.
- Insurance: E&O insurance (Hiscox / professional indemnity) at $5M–$25M coverage range typical for tech audits.

**Open question for counsel:** can we disclaim liability for findings cleared at lower rungs (e.g., R3) but not higher (e.g., R5)? Tier-graded liability is unusual; may not survive scrutiny.

**Comparison reference:** Cecuro's ToS fully disclaim liability (per `research/cecuro-deep-dive.md`). Industry-standard. We'd match that floor.

## Risk 2 — PoC artifact misuse

**Risk:** Our PoC artifacts (working exploits) get lifted from our storage and weaponized against the client (or a similar protocol).

**Mitigations:**
- PoC storage is encrypted at rest with per-tenant keys.
- PoC artifacts auto-expire after audit completion + retention period (default 90 days).
- Public report scrubs PoC concrete addresses and tx-construction details; replaces with abstract descriptions and gas/state-change summaries.
- Internal-only PoCs available to client only via authenticated dashboard.
- Watermarking: every PoC artifact carries an internal client-id watermark; if leaked, source is identifiable.
- We do NOT publish PoCs to the heuristic library before patches are deployed.

## Risk 3 — Off-chain unauthorized access

**Risk:** Scanning client's infra without explicit authorization = CFAA / equivalent international exposure (UK Computer Misuse Act, EU Cybersecurity Act, etc.).

**Mitigations:**
- Mandatory `scope_artifact_id` for every off-chain agent run.
- Off-chain agents refuse to start without active scope.
- Scope artifact includes: explicit list of in-scope assets, permitted depth, time window, signed authorization from client.
- Scope artifacts have a max time-to-live (default 30 days) and are revocable.
- Out-of-scope finding paths emit `status: informational` only — no exploit validation.

**Hard policy:** Silica never runs off-chain agents on protocols not in active engagement, regardless of how interesting the public surface looks.

## Risk 4 — Bug bounty interference

**Risk:** Discovering a bug in a protocol that's not engaging us, on the open internet (e.g., as part of competitor research), creates an awkward disclosure dynamic. Bug-bounty programs may not recognize automated discoveries; some clients view disclosure pressure as adversarial.

**Mitigation policy:**
- Silica does not run audit pipelines on protocols not under active engagement. Period.
- Internal research / benchmark runs use historical state of contracts already exploited (the bench corpus). No live unverified findings against active protocols.
- If a bench-corpus run incidentally surfaces a *new* (not-yet-public) vulnerability in a *related* contract, immediate disclosure to that protocol via responsible-disclosure channels — never publication.

## Risk 5 — Pre-launch source-code leak via LLM training

**Risk:** Client sends pre-launch proprietary source. We feed it to a hosted LLM. The hosted LLM provider has data-retention or training policies that retain the source in some form.

**Mitigations:**
- **Default tier (paid audits):** Anthropic / OpenAI no-retention enterprise contract; no training on inputs. Both providers offer this.
- **High-trust tier (pre-launch / IP-sensitive):** self-hosted inference (vLLM with open-weights model: Llama 4, Mistral, DeepSeek). Performance trade-off documented; client signs off on capability difference.
- **Audit Records:** Silica records (per finding) which LLM tier was used and the data-handling policy that applied.

## Risk 6 — Heuristic library cross-tenant contamination

**Risk:** A heuristic minted from Tenant A's audit reveals Tenant A's specific code patterns, and another tenant queries it.

**Mitigation:**
- Three-pool model from `design/heuristic-schema.md`: Private → Shared (with sanitization) → Public.
- Sanitization step strips:
  - Specific addresses
  - Specific contract names matching tenant naming conventions
  - Custom modifier / function names that could fingerprint a project
  - Private constants / magic numbers tied to the project's economy
- Heuristic name + abstract pattern remains; concrete instantiation is generalized.
- Sanitization is reviewed (manual at first; automated later) before promotion.

## Risk 7 — Findings dispute and rebuttal

**Risk:** Client disputes a finding. Public-report version differs from internal-report version. Heuristic library carries the disputed finding as a confirmed positive, polluting the prior over time.

**Mitigation:**
- Findings have explicit `status: disputed`; disputed findings don't promote heuristics.
- Rebuttal flow: client signs a structured rebuttal; the rebuttal is attached to the finding lifecycle.
- The skeptic agent re-runs against the rebuttal evidence and either accepts or holds.
- If a finding is later proven correct (e.g., the bug is exploited in production), the lifecycle event is appended; heuristic priors update.

## Risk 8 — Regulatory / sanctions

**Risk:** Audit a protocol that turns out to be on a sanctions list (OFAC) or operates under prohibited jurisdiction.

**Mitigation:**
- KYB (Know Your Business) intake: every client signs through a KYB process before audit begins.
- OFAC screening on client legal entity + on-chain address screening on operating addresses.
- Refusal policy for sanctioned/prohibited jurisdictions.

## Risk 9 — Findings publication and securities implications

**Risk:** Public disclosure of audit findings on a protocol with publicly-traded tokens may have securities implications. Selective disclosure to certain parties before others is a regulatory hazard.

**Mitigation:**
- Disclosure timing controlled by protocol team, not Silica.
- Embargo windows: standard 90 days from finding to public-disclosure-eligible.
- Parallel notification: when a finding is disclosure-eligible, all subscribed parties (protocol team + Silica's research feed if opted-in) receive simultaneously.

## Risk 10 — AI-generated content liability

**Risk:** LLM-generated findings include hallucinated function names / claims that don't match reality. Client acts on the bad finding, suffers damage, sues.

**Mitigation:**
- Skeptic agent re-validates every finding against actual evidence before report inclusion.
- Validation rung must be ≥ R2 for any finding included in a paid audit report.
- Toolchain manifest pins exact agent versions and prompt hashes — defense against "your AI hallucinated."
- Insurance covers AI-specific E&O exposure (insurance market is adapting; rates are increasing).

## Documentation requirements

Each engagement carries:
- Signed Master Service Agreement (MSA)
- Per-engagement Statement of Work (SOW) with explicit scope
- Scope artifact ID(s) for any off-chain work
- Data-handling tier election (no-retention LLM vs self-hosted)
- KYB completion record
- Insurance certificate of coverage

## Counsel review checklist

Before launch:
- MSA and SOW templates reviewed by tech-savvy IT counsel
- E&O insurance quote in hand
- Data-handling tier framework reviewed against GDPR / CCPA / equivalent
- Off-chain agent authorization flow reviewed against CFAA
- Heuristic-library sanitization policy reviewed for IP / trade-secret leakage
- Liability disclaimers reviewed for enforceability across target jurisdictions (US, EU, UK, Singapore, Cayman are common DeFi venues)
- AI-specific E&O coverage reviewed
- Disclosure-timing policy reviewed for securities-law sensitivity (US: SEC Reg FD, EU: MiFID II)
- Public benchmark / claims reviewed for unfair-competition-law sensitivity (FTC Act §5, EU UCPD)

## Open policy items

- Open-source licensing for the public components: MIT? Apache 2.0? GPL-equivalent for offensive tools? (HexStrike is GPL-3.0 — using it as adapter constrains downstream license.)
- Bug-bounty share program: if a Silica-discovered finding is later exploited, do we participate in any recovered-funds-bounty? Interplay with Sherlock / Immunefi.
- Coordinated disclosure with chain/L2 foundations on findings affecting their core infra.
- Government-engagement policy (FBI / NCA / Europol / etc. may request data on findings).
