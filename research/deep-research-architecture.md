# Deep Research — Production-Grade AI Security Harness Architecture

> **Provenance:** External deep-research-agent output, supplied 2026-05-08. Captured verbatim below for reference. Critical integration notes are at the bottom of this file (§ "Silica integration review"). Read the review before lifting wholesale — this document has both concrete tactical value and strategically stale framing relative to what we found in our own primary-source research on Cecuro (see [`cecuro-deep-dive.md`](cecuro-deep-dive.md)).

---

# Building a Production-Grade AI Security Harness: Multi-Agent Architecture for Smart Contract Vulnerability Discovery

## 1. Core Architectural Philosophy

### 1.1 Orchestration Over Models

#### 1.1.1 Harness as the Product, LLM as Commodity

The foundational insight driving this architecture is that **frontier large language models are interchangeable commodities**, while the orchestration harness that constrains, directs, and validates their outputs constitutes the actual product and competitive moat. This represents a deliberate inversion of common AI tooling narratives where the model itself is treated as the centerpiece. In reality, models from OpenAI, Anthropic, and Google are rapidly converging in capability, with API improvements delivering automatic performance gains without engineering investment. The harness architecture must therefore be **model-agnostic at its core**, with LLM selection becoming a runtime configuration decision based on agent role, cost constraints, and latency requirements.

This philosophy has concrete architectural implications. **Strict separation between model interface and orchestration logic** enables rapid A/B testing and provider failover without structural changes. Investment flows disproportionately into tooling integration—Foundry for EVM execution, Slither for static analysis, Docker for sandboxing—rather than fine-tuning or custom model training. Evaluation metrics measure end-to-end harness performance (vulnerability discovery rate, false positive rate, time to validated PoC) rather than model perplexity or benchmark scores. The product is the system that turns model outputs into reproducible security findings, not the model itself.

The economic logic reinforces this priority. A harness built around GPT-4 in 2024 automatically benefits from GPT-5 capabilities in 2025 without engineering investment. Conversely, systems embedding model-specific assumptions—custom fine-tunes, provider-specific prompt formats, hardcoded token limits—create compounding technical debt with each model generation. The Cecuro approach exemplifies this discipline: **180 specialized agents running in parallel** achieve comprehensive coverage through orchestration design—agent specialization, cross-referencing stages, and structured state management—rather than through superior base model capabilities.

#### 1.1.2 Emergent Behavior from Agent Interactions Versus Fixed Pipelines

Traditional security automation follows **fixed pipelines**: static analysis → manual review → dynamic testing → report generation. Each stage assumes the completeness of prior stages, and information discovered late cannot revise early decisions. The multi-agent architecture replaces this with **dynamic networks where global behavior emerges from local interactions**. No single agent possesses the complete audit plan; instead, the Planning Agent maintains beliefs about contract state that are continuously revised as Execution Agents, Analytical Agents, and Validation Agents contribute findings.

This emergence manifests in concrete operational patterns. When an Access Control Agent discovers that `emergencyWithdraw` lacks modifier protection, this finding does not simply flow to a report queue. It triggers **cascading adaptation**: the Planning Agent reprioritizes the State Manipulation Agent to trace what `emergencyWithdraw` can modify; deprioritizes agents analyzing functions that require `emergencyWithdraw` to be called first (since the unprotected path is now directly reachable); spawns a Cross-Contract Agent to identify all contracts that call `emergencyWithdraw`; and potentially aborts entire audit branches if a critical invariant is broken. These effects are **not hardcoded**—they arise from the Planning Agent's belief model and the Coordinator's conflict resolution logic.

The technical mechanism enabling this emergence is **structured message passing with typed findings**. Agents communicate through JSON messages with explicit `severity`, `confidence`, `target`, and `evidence` fields—not raw text requiring re-parsing. This structure enables the Planning Agent to mechanically update its belief state without natural language understanding, and enables the Coordinator to detect conflicts and redundancies through message comparison rather than semantic analysis.

#### 1.1.3 Belief Revision Driving Dynamic Audit Plan Adaptation

The Planning Agent implements **belief revision following the AGM (Alchourrón, Gärdenfors, Makinson) model**, maintaining a formal representation of propositions about contract security properties and their associated confidence levels. When new evidence arrives—particularly findings from analytical or exploratory agents—the Planning Agent updates its belief state through **expansion** (adding new beliefs), **revision** (updating existing beliefs with new evidence), and **contraction** (removing beliefs that new evidence contradicts). This formal grounding prevents erratic plan changes and ensures that the system's adaptation to findings remains logically coherent.

The operational impact of belief revision is **dynamic audit plan adaptation**. Consider a protocol with 20 contracts and 200 functions. The initial audit plan assigns agents based on surface heuristics: public functions before internal, state-modifying before view functions. When the Access Control Agent reports that `governance.executeProposal` lacks proper role verification, the Planning Agent's belief state updates to include this critical finding. This triggers multiple plan revisions: the State Manipulation Agent is immediately reassigned to trace all state changes reachable through `executeProposal`; the Economic Agent is deprioritized for functions requiring successful governance execution; a new task is created for the Cross-Contract Agent to identify dependent contracts.

The AGM model provides **theoretical guarantees** for this process: consistency preservation, minimal change, and success. In practice, these properties ensure that the audit plan evolves coherently rather than oscillating between conflicting priorities.

### 1.2 Reference Architectures

#### 1.2.1 SPEAR Pattern: Planning, Execution, Repair, Command Execution, Coordinator Agents

| Agent Role | Primary Responsibility | Key Failure Mode Addressed |
|-----------|----------------------|---------------------------|
| **Planning Agent** | Constructs risk-aware audit plans; maintains evolving belief state about contract security | Prevents static, unadaptable analysis strategies |
| **Execution Agent** | Selects/schedules analysis tasks across static analysis, fuzzing, symbolic execution | Optimizes resource allocation across competing tool demands |
| **Repair Agent** | Self-heals when generated artifacts fail (compilation errors, unexpected reverts) | Prevents pipeline stalls from imperfect LLM code generation |
| **Command Execution Agent** | Sandboxes tool execution in Docker with CPU/memory/timeout limits | Prevents resource exhaustion and container escape attacks |
| **Coordinator Agent** | Mediates conflicts; allocates shared resources; prevents redundant work | Resolves contradictory findings and eliminates duplicate effort |

#### 1.2.2 Cecuro's 180-Agent Parallel Investigation Model

Cecuro represents the **scaling extreme of the SPEAR pattern**, demonstrating that the architecture supports massive parallelization without fundamental redesign. The 180-agent configuration operates through **structured cross-referencing stages** where findings from parallel investigations are systematically validated against each other.

The cross-referencing mechanism ensures that agents do not operate in isolation. A finding reported by only one agent, without corroboration from complementary analysis perspectives, receives lower confidence and triggers targeted verification tasks. The critical innovation is **staged validation**: findings must survive initial agent detection, cross-agent corroboration, and execution-based proof before entering the belief state.

#### 1.2.3 SmartGuard's Validated Pipeline: Analyzer → Skeptic → Exploiter → Generator → ExploitRunner

| Stage | Agent | Function | Gate Criteria |
|-------|-------|----------|---------------|
| **Analyzer** | AnalyzerAgent | Initial vulnerability identification through static analysis + LLM reasoning | Structured finding with confidence score |
| **Skeptic** | SkepticAgent | Adversarial review attempting to disprove findings | Survives disproof attempts |
| **Exploiter** | ExploiterAgent | Concrete attack strategy development | Actionable exploit path identified |
| **Generator** | GeneratorAgent | Foundry test contract translation | Compiles successfully |
| **ExploitRunner** | ExploitRunner | Automatic execution on forked mainnet | Executes without revert; state change verified |

SmartGuard's integration with Foundry for PoC execution confirms the critical importance of live EVM execution in the validation loop. The project uses Anvil for mainnet forking, enabling PoCs to be tested against actual protocol state rather than mock environments. SmartGuard's RAG system enables agents to query historical vulnerability patterns before analysis, reducing the search space and improving finding relevance.

### 1.3 Proof-of-Concept Scope

#### 1.3.1 Minimum Viable Agent Set

| Agent | Primary Function | Model Tier | Validation Criteria |
|-------|---------------|------------|---------------------|
| **Access Control Agent** | Function-to-modifier mapping; `msg.sender` bypass detection; proxy/delegatecall analysis | Analytical (fast, cheap) | Identifies unprotected functions with confidence scores |
| **State Manipulation Agent** | `SSTORE` tracing; critical state identification; checks-effects-interactions validation | Analytical (fast, cheap) | Traces state changes from unprotected functions |
| **PoC Generator** | Foundry test authoring; compilation repair; fork execution validation | Code-specialized | Generates executing proof on forked mainnet |
| **Coordinator** | Belief revision; task reprioritization; conflict mediation | N/A (orchestration logic) | Manages agent interactions without human intervention |

#### 1.3.2 Single Real Exploited Contract as Validation Target

| Exploit Class | Example Targets | Agents Exercised |
|-------------|---------------|----------------|
| Reentrancy | The DAO, Cream Finance, Euler Finance | Access Control, State Manipulation, PoC Generator |
| Access Control | Parity Multisig, Compound governance | Access Control, PoC Generator |
| Oracle Manipulation | Mango Markets, Venus Protocol, Warp Finance | All three (with manual proxy assistance) |
| Flash Loan | Aave, dYdX, Euler | All three (with manual economic setup) |

## 2. Execution Environment: Live EVM Integration

### 2.1 Foundry/Anvil as the Proof Engine

**Mainnet forking at specific block heights:**
```bash
anvil --fork-url <RPC> --fork-block-number <BLOCK>
```

This command creates a local EVM instance that **replicates mainnet state at a specific historical moment**, including all contract code, storage values, account balances, and external contract dependencies.

Anvil's `anvil_impersonateAccount` RPC method enables the harness to **act as any address without possessing private keys**, transforming vulnerability validation from theoretical to empirical.

**Solidity-Native Exploit Scripting via `forge test` and `forge script`:**

| Feature | `forge test` | `forge script` |
|---------|-----------|--------------|
| **Primary Use** | Single-transaction exploits with assertions | Multi-step attack sequences |
| **Assertion Support** | Built-in `assertEq`, `assertGt`, etc. | Manual state verification |
| **Cheatcode Access** | Full `vm.*` cheatcode library | Limited cheatcode availability |
| **Output** | Pass/fail with gas reporting | Transaction receipts with full traces |
| **Best For** | Access control bypasses, reentrancy proofs | Flash loan attacks, governance manipulation |

### 2.2 Vulnerability Proving Protocol

| Step | Action | Verification Method | Failure Interpretation |
|------|--------|---------------------|----------------------|
| 1 | **Fork mainnet** at deployment or relevant block | RPC connection success; state queries return expected values | RPC failure; contract not deployed at block |
| 2 | **Impersonate EOA** with appropriate characteristics | `anvil_impersonateAccount` success | Address type mismatch for test scenario |
| 3 | **Execute target function** with attack parameters | Transaction broadcast without network error | Function doesn't exist; parameters invalid |
| 4 | **Observe state changes** through multiple mechanisms | `eth_getBalance`, `eth_getStorageAt`, event log queries | No state change → false positive or wrong parameters |
| 5 | **Generate Foundry test file** encapsulating complete sequence | `forge build` success; test compiles independently | Generation error; missing dependencies |

### 2.3 Sandboxed Execution

| Resource | Typical Limit | Rationale |
|----------|-------------|-----------|
| **CPU** | 1-2 cores per analytical task; burst for critical path | Prevents analysis tasks from starving orchestration layer |
| **Memory** | 4GB for Slither; 8-16GB for Mythril; 2GB for compilation | Symbolic execution path explosion; prevents OOM kills |
| **Timeout** | 300s Slither; 600s Mythril; 60s compilation checks | Adaptive based on contract complexity and historical data |
| **Network** | Egress restricted to RPC endpoints only | Prevents data exfiltration; contains compromised contract code |

**Hardened Anvil configurations** disable debug methods (`anvil_setBalance`, `anvil_setStorageAt`, `anvil_setCode`) for validation execution, ensuring that PoCs succeed only through legitimate protocol interactions.

## 3. Static Analysis Pipeline: Structured Context for LLMs

### 3.1 Tool Integration Pattern

**Slither outputs:**

| Output Type | Content | LLM Agent Value |
|-------------|---------|---------------|
| **Function call graph** | Internal and external call relationships | Attack path construction; entry point identification |
| **Storage layout** | State variable to storage slot mapping | Proxy pattern analysis; direct storage manipulation attacks |
| **Modifier mapping** | Function-to-access-control associations | Access Control Agent primary input |
| **Detector results** | Reentrancy, unchecked calls, access control flags | Initial vulnerability hypotheses for investigation |

**Mythril outputs:**

| Output Type | Description | Agent Application |
|-------------|-------------|-----------------|
| **Reachable states** | Contract states accessible from given entry points | State Manipulation Agent priority targeting |
| **Path constraints** | Input conditions required to reach specific code locations | PoC parameter generation |
| **Potential vulnerable paths** | Execution sequences matching known vulnerability patterns | Cross-Contract Agent attack path construction |

**Echidna/Medusa fuzzing:**

| Tool | Implementation | Key Strength | Best Applied To |
|------|---------------|--------------|---------------|
| **Echidna** | Haskell | Mature invariant specification; coverage guidance | Standard ERC patterns; well-understood invariants |
| **Medusa** | Go | Enhanced parallelization; stateful fuzzing | Complex state machines; multi-contract protocols |

### 3.2 LLM Context Engineering

**Slither-MCP** (Trail of Bits) provides 23+ analysis tools as MCP server:

| Tool | Purpose |
|------|---------|
| `get_project_overview` | Aggregate project statistics |
| `find_dead_code` | Detect uncalled functions |
| `export_call_graph` | Mermaid/DOT visualization |
| `get_contract_dependencies` | Map dependencies with circular detection |
| `analyze_state_variables` | Storage variable analysis |
| `get_storage_layout` | Storage slot layout computation |
| `analyze_events` | Event definition analysis |
| `analyze_modifiers` | Custom modifier usage |
| `analyze_low_level_calls` | Low-level call detection |
| `search_contracts` | Regex contract search |
| `search_functions` | Regex function search |

These tools enable agents to **query specific aspects of contract structure on demand**, rather than receiving a monolithic dump of all analysis output.

**Layered context assembly:**

| Layer | Content Source | Primary Consumers | Optimization Strategy |
|-------|---------------|-------------------|----------------------|
| 1. AST + Call Graph | Slither | All agents | Subgraph extraction for agent-specific focus |
| 2. Storage Layout | Slither | State Manipulation, Economic | Highlight proxy pattern slots |
| 3. Function Signatures + Modifiers | Slither | Access Control, State Manipulation | Filter by visibility and mutability |
| 4. External Dependencies | On-chain queries | Cross-Contract, Economic | Current state values from fork |
| 5. Prior Agent Findings | Coordinator state | All agents (filtered) | Confidence threshold gating |

### 3.3 RAG for Known Vulnerabilities

| Content Category | Sources | Update Frequency | Embedding Strategy |
|-----------------|---------|-----------------|-------------------|
| **Known CVEs** | MITRE, blockchain security databases | Real-time for critical | Code-aware + text hybrid |
| **Audit Reports** | Code4rena, Sherlock, Trail of Bits, OpenZeppelin | Weekly ingestion | Document chunking by finding |
| **Exploit PoCs** | DeFiHackLabs, Rekt News, Immunefi | Immediate for significant incidents | Code-first with description |
| **Common Patterns** | OpenZeppelin issues, Curve hacks, Compound/Aave bugs | Monthly refresh | Pattern template extraction |

| Database | Best For | Key Strength |
|----------|---------|--------------|
| **Pinecone** | Managed scaling; minimal ops | Low-latency ANN search; metadata filtering |
| **Weaviate** | Complex queries; hybrid search | GraphQL interface; BM25 + vector similarity |
| **Chroma** | Development; air-gapped deployments | Minimal configuration; local-first |

## 4. Specialized Agent Design

### 4.1 Analytical Agents (Fast, High-Context Models)

**Access Control Agent** — Function-to-modifier mapping; `msg.sender` bypass detection through `delegatecall` proxy patterns; custom access control implementations; cross-role contamination testing.

**State Manipulation Agent** — Every `SSTORE` operation tracing; checks-effects-interactions pattern validation; critical state by protocol type:

| Protocol Type | Critical State Variables | Common Manipulation Targets |
|-------------|------------------------|---------------------------|
| **Lending** | Collateral factors, liquidation thresholds, oracle prices | Price feeds for forced liquidation cascades |
| **DEX/AMM** | Pool reserves, price accumulators, fee tiers | Reserve ratios for price manipulation |
| **Governance** | Proposal states, voting power, timelock parameters | Voting power for proposal passage |
| **Vaults (ERC-4626)** | Total assets, total shares, share price | Share price for inflation attacks |
| **Bridges** | Validator sets, message nonces, mint allowances | Validator compromise for unauthorized minting |

### 4.2 Exploratory Agents (Strong Reasoning Models)

**Cross-Contract/Composition Agent** — Oracle dependency tracing:

| Oracle Type | Manipulation Vector | Cost | Detection Difficulty |
|-------------|-------------------|------|---------------------|
| **Chainlink** | Deviation threshold gaming; stale price exploitation | High | Low (on-chain deviation monitoring) |
| **Uniswap V2 TWAP** | Short-window price distortion | Medium | Medium (TWAP lag reduces real-time manipulation) |
| **Uniswap V3 TWAP** | Concentrated liquidity position manipulation | Variable | High (observation cardinality affects accuracy) |
| **Spot price (direct)** | Single-block price distortion | Low to medium (flash loan enabled) | Very low (no averaging protection) |

**Economic/Business Logic Agent** — Token flow modeling; precision loss; inflation/donation attacks:

| Attack Type | Mechanism | Preconditions | Detection Approach |
|-------------|-----------|---------------|------------------|
| **Inflation attack (ERC-4626)** | Donate underlying to inflate share price, then deposit at favorable rate | Small initial total assets; rounding in share calculation | Share price volatility analysis; first-depositor scenario modeling |
| **First-depositor attack** | Minimal initial deposit to establish unfavorable share ratio for subsequent depositors | Empty or near-empty vault | Empty vault edge case testing |
| **Donation attack** | Direct transfer to inflate apparent reserves without corresponding liability increase | Balance-based accounting without share tracking | Direct transfer detection; reserve-to-liability ratio monitoring |
| **Rounding exploitation** | Repeated small operations to accumulate rounding errors | Operations with asymmetric rounding directions | Rounding direction consistency checks |

### 4.3 Generation & Validation Agents

**PoC Generation Agent** — Foundry test authoring; import resolution; mock deployment; fork validation. Repair Agent handles:

| Challenge | Solution Approach |
|-----------|-----------------|
| **Import resolution** | Map contract imports to available packages; handle version conflicts |
| **Mock deployment** | Deploy minimal mock contracts for dependencies not present on fork |
| **Compilation errors** | Syntax fixes; version pragma adjustment; library compatibility |
| **Execution reverts** | Parameter tuning; state precondition adjustment; attack sequence refinement |

**Skeptic/Validation Agent** — Adversarial disproof:

| Disproof Strategy | Application | Success Indicator |
|-------------------|-------------|-----------------|
| **Alternative explanation** | Proposing benign interpretations of flagged code patterns | Finding reclassified or confidence reduced |
| **Precondition challenge** | Identifying impossible or unlikely attack prerequisites | Finding marked as theoretical only |
| **Counterexample construction** | Finding execution contexts where vulnerability doesn't manifest | Finding rejected as false positive |
| **Assumption audit** | Checking dependencies on specific compiler versions, optimization settings | Finding qualified with environmental constraints |

### 4.4 Model Selection Strategy

**Analytical Tier (cheap):**

| Model | Context Window | Optimal For |
|-------|--------------|-------------|
| **GPT-4o-mini** | 128K | Rapid pattern matching; high-volume processing |
| **Claude 3.5 Haiku** | 200K | Large codebase analysis; complex inheritance structures |

**Creative Tier (expensive):**

| Model | Key Strength | Typical Application |
|-------|-----------|---------------------|
| **o3** | Extended chain-of-thought; mathematical reasoning | Complex economic modeling; multi-step attack construction |
| **Claude Opus** | Analytical thoroughness; long-context coherence | Skeptic Agent disproof attempts; final review of critical findings |
| **GPT-5.3-Codex** | Code reasoning specialization; Solidity output quality | PoC Generation Agent; complex exploit contract authoring |

## 5. Orchestration & State Management

### 5.1 Message Passing Protocol

```json
{
  "agent_id": "access_control_01",
  "message_type": "FINDING",
  "severity": "HIGH",
  "confidence": 0.94,
  "target": {
    "contract": "0x...",
    "function": "emergencyWithdraw",
    "line": 142
  },
  "description": "Missing onlyOwner modifier",
  "evidence": {
    "static_analysis": "slither_output.json",
    "execution_trace": "anvil_trace_01.log",
    "poc_file": "exploit/emergencyWithdraw.t.sol"
  }
}
```

### 5.2 Belief Revision System (AGM Model)

| Operator | Action | Trigger Condition |
|----------|--------|-----------------|
| **Expansion** | Add new belief consistent with existing beliefs | New finding corroborates current model |
| **Revision** | Replace conflicting beliefs with new information | New evidence contradicts prior belief |
| **Contraction** | Remove beliefs when supporting evidence is undermined | Prior evidence invalidated by Skeptic or execution failure |

Belief revision triggers **dynamic task reprioritization** through cascading adjustments across the agent fleet.

### 5.3 Coordinator Responsibilities

| Resource | Constraint | Management Strategy |
|----------|-----------|---------------------|
| LLM API rate limits | Provider-specific tokens per minute | Queue-based request batching; model tier fallback |
| Anvil instance capacity | Memory and CPU per fork | Instance pooling; fresh fork per PoC; state caching for shared bases |
| Docker container pools | Total concurrent containers | Priority-based scheduling; preemption for critical path items |
| Database connections | Connection pool limits | Connection multiplexing; read replica routing |

## 6. Four-Tier Validation Framework

| Tier | Gate | Method | Failure Interpretation |
|------|------|--------|----------------------|
| **1. Compilation** | Foundry compilation succeeds | `forge build` | Repair Agent loop on imports/interfaces/mocks |
| **2. Execution** | Mainnet fork execution without revert | `forge test` | False positive: hypothesis doesn't match runtime behavior |
| **3. State** | Attacker balance increase / TVL decrease / ownership transfer | Pre/post state comparison with thresholds | Vulnerability triggered but no harm; threshold-fail |
| **4. Atomicity** | Single-tx flash loan sequence; no intermediate state commits | `vm.expectRevert` on split sequences | Attack requires multi-tx (front-runnable; weaker) |

For economic attacks: `Profit = Attacker_Final - Attacker_Initial - Gas - Flash_Loan_Fees > Threshold`.

## 7. Critical Implementation Challenges

### 7.1 False Positive Management

| Factor | Weight | Measurement |
|--------|--------|-------------|
| **Evidence strength** | 0.35 | Number and quality of supporting evidence types |
| **Agent agreement** | 0.25 | Corroboration from independent agents |
| **Historical validation rate** | 0.20 | Past accuracy of similar findings from same agent |
| **Execution tier reached** | 0.20 | Highest validation tier successfully completed |

### 7.2 Cross-Contract Complexity

**Proxy patterns and `delegatecall` resolution:**

| Proxy Pattern | Resolution Method | Critical Slot |
|-------------|-------------------|---------------|
| **EIP-1967 (Transparent)** | `bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)` | `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc` |
| **EIP-1822 (UUPS)** | `keccak256("PROXIABLE")` | `0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7` |
| **Custom/Upgradeable** | Event log parsing; constructor parameter tracing | Pattern-specific detection required |

### 7.3 Unverified Contract Handling

| Tool | Approach | Output Quality | Best For |
|------|---------|---------------|----------|
| **Gigahorse** | Logic-based decompilation; IR generation | High (structured control flow) | Complex contracts; formal analysis preparation |
| **Elipmoc** | Pattern-based decompilation; heuristic recovery | Medium (approximate structure) | Rapid assessment; known pattern matching |
| **Mythril** (direct) | Native EVM bytecode | SMT path constraints | When decompilation produces unusable output |
| **hevm** (direct) | Haskell EVM implementation | Formal property verification | High-assurance validation |

### 7.4 Economic State Fidelity

| Attack Type | Mock Value Risk | Real State Requirement |
|-------------|--------------|------------------------|
| **Oracle manipulation** | Artificial liquidity allows unrealistic price movement | Actual pool depth determines manipulation cost |
| **Flash loan** | Unlimited mock liquidity hides borrowing constraints | Available flash loan pool size limits attack scale |
| **Governance** | Simplified token distribution misses quorum edge cases | Actual token holder concentrations determine vote outcomes |
| **Liquidation cascade** | Fixed collateral factors ignore dynamic risk parameters | Real oracle staleness and price deviation enable cascade |

## 8. Required Knowledge Domains

### 8.1 EVM Internals

| Opcode | Function | Security Relevance |
|--------|----------|-------------------|
| `JUMP` | Unconditional control transfer | Control flow graph reconstruction; jump target validation |
| `JUMPI` | Conditional control transfer | Branch coverage analysis; path feasibility determination |
| `CALL` | External call with new context | Reentrancy detection; cross-contract interaction tracing |
| `DELEGATECALL` | External call in caller's context | **Proxy pattern analysis; implementation contract security** |
| `STATICCALL` | External call prohibiting state changes | View function validation; unexpected state modification detection |
| `SSTORE` | Persistent storage write | **Critical state modification tracing; reentrancy pattern detection** |
| `SLOAD` | Persistent storage read | Storage layout analysis; variable dependency tracking |

### 8.2 DeFi-Specific Mechanics

| Oracle Type | Update Mechanism | Manipulation Cost | Typical Exploit |
|-------------|-----------------|-------------------|---------------|
| **Chainlink (decentralized)** | Multiple independent node operators; deviation threshold triggers | Very high | Stale price exploitation during network congestion |
| **Uniswap V2 TWAP** | Time-weighted average over specified period | Medium | Short-window TWAP with insufficient liquidity |
| **Uniswap V3 TWAP** | Geometric mean of tick observations; configurable cardinality | Variable | Manipulation during low-observation periods |
| **Spot price (direct reserve)** | Current reserve ratio | Low | Direct reserve manipulation; no averaging protection |

| AMM Type | Price Formula | Key Vulnerability |
|----------|-------------|-------------------|
| **Constant product (Uniswap V2)** | `x * y = k` | Large trade price impact; liquidity exhaustion |
| **Concentrated liquidity (Uniswap V3)** | `L^2 = x * y` within tick range | Tick boundary manipulation; position value extraction |
| **Stable swap (Curve)** | Complex invariant near 1:1 | Amplification parameter manipulation; imbalance exploitation |

| Standard | Vulnerability | Mechanism |
|----------|--------------|-----------|
| **ERC-20** | Unlimited allowance | `approve(spender, type(uint256).max)` enables complete balance theft |
| **ERC-721/1155** | `safeTransfer` callback reentrancy | `onERC721Received`/`onERC1155Received` hooks enable reentrancy |
| **ERC-4626** | **Inflation attack** | Direct donation inflates `totalAssets` without minting shares |
| **ERC-4626** | Rounding exploitation | Division before multiplication; asymmetric rounding directions |

### 8.3 Multi-Agent Systems Theory

**Contract Net Protocol** for task bidding; **Blackboard architecture** for shared findings workspace.

## 9. Production Tech Stack

| Layer | Tool | Critical Capability |
|-------|------|-------------------|
| **EVM Execution** | Foundry (Forge + Anvil + Cast) | `forge test` cheatcodes; `--fork-block-number` |
| **Static Analysis** | Slither, Mythril, hevm | AST parsing; symbolic execution; formal verification |
| **Fuzzing** | Echidna, Medusa | Property-based testing; counterexample generation |
| **Orchestration** | Custom / Temporal / Cadence | Workflow-as-code; durable execution |
| **LLM API** | OpenAI, Anthropic, vLLM | Model abstraction; per-task tier selection |
| **State Storage** | PostgreSQL + Redis | ACID findings; ephemeral coordination |
| **Sandboxing** | Docker + cgroups | Isolation; resource limits |

---

## Silica integration review

> Critical companion notes added by Silica. The deep-research doc above is verbatim external research; the analysis in this section is Silica-specific and weighs the external doc against our primary-source findings.

### What this doc adds (worth lifting into Silica)

These are **concrete tactical assets** that improve our existing design docs:

1. **Slither-MCP tool inventory (§3.2.1)** — 23+ tools with names. Maps directly into Silica's tool plugin contract. Should be referenced in `design/cost-model.md` and incorporated as the EVM static-analysis baseline tool layer.
2. **Oracle architecture comparison table (§4.2.1, §8.2.1)** — manipulation cost vs detection difficulty per oracle type. Lift into `research/bug-taxonomy.md` (oracle category) as detection signal.
3. **AMM mathematics taxonomy (§8.2.2)** — constant product / concentrated liquidity / stable swap with vulnerability vectors. Same.
4. **ERC-4626 inflation attack subtypes (§4.2.2)** — inflation / first-depositor / donation / rounding distinguished cleanly. Should be 3-4 separate entries in the bug taxonomy.
5. **Storage slot collisions for proxy patterns (§7.2.2)** — exact EIP-1967 / EIP-1822 magic slots. Concrete reference for Silica's proxy-resolution code.
6. **SmartGuard pipeline reference (§1.2.3)** — Analyzer → Skeptic → Exploiter → Generator → ExploitRunner. Useful as a reference framework alongside our 3-agent MVP. Worth a citation in `notes.md`.
7. **Confidence-scoring weights (§7.1)** — evidence 0.35 / agreement 0.25 / history 0.20 / tier 0.20. Reasonable starting prior for our heuristic algebra. Recorded in `design/heuristic-schema.md` open items.
8. **Aether framework's chain-of-thought enforcement** — useful pattern for prompt engineering of generation agents.
9. **Resource-limits table (§2.3)** — explicit CPU/memory/timeout numbers per tool. Lift into our docker sandbox spec.
10. **EVM opcode security relevance table (§8.1)** — useful onboarding reference for new agents/engineers; not load-bearing for spec but high-quality context.

### Where this doc is stale or wrong (do not lift)

Cross-checked against our [`research/cecuro-deep-dive.md`](cecuro-deep-dive.md):

1. **"Cecuro's 180 specialized agents"** (§1.1.1, §1.2.2) — **likely false or misleading.** Cecuro's open-source baseline is a single LangChain agent over 222 lines (`Cecuro/defi-vuln-benchmark/src/agents/baseline/agent.py`). Their marketing says "multi-agent" without specifying numbers; the "180" figure does not appear in any open-source artifact and may be borrowed from elsewhere or fabricated. The deep-research doc treats this as an established architectural reference, which is unsupportable.
2. **"OpenAI's smart-contract exploit benchmark"** (implicit framing throughout) — **misattribution.** EVMBench is OpenAI/Paradigm/OtterSec's, not Cecuro's. Cecuro's own bench is DVBench (90 cases, recall-only, synthetic LLM-generated reference findings). Any strategy modeled on "matching Cecuro's EVMBench performance" is targeting a benchmark Cecuro doesn't own.
3. **AGM belief revision (§1.1.3, §5.2.1)** — academic flavor, premature. Useful as a north-star concept but not load-bearing for MVP. Silica's design (`notes.md` §6, `design/heuristic-schema.md`) treats this as deferred; a shared JSON state document is sufficient until ≥6 agents and observable contention.
4. **"180-agent scaling"** as success metric — **strategically wrong** per our prior conversation. Cecuro doesn't win on agent count; they win because their benchmark numbers move (and the validity of those numbers is in question per the deep dive). Optimize for findings/$ on a held-out exploit set, not agent count.
5. **EVM-only framing** — the doc never mentions Solana, Move, Cairo, multi-VM. Silica's compete-on-all-fronts thesis explicitly differentiates here. Lifting this doc wholesale would re-encode EVM bias the Silica spine specifically rejected (see `design/multi-vm-svm-sketch.md`).
6. **No off-chain perimeter** — the doc treats security as on-chain-only. Silica's hybrid-perimeter differentiation (frontend XSS, RPC exposure, CI key leaks, multisig OSINT) is absent. See `ops/perimeter-playbook.md`.
7. **No heuristic library / self-improving framing** — the doc has RAG over CVEs but no concept of a versioned, citable, growing heuristic library that is the actual moat per our strategy. See `design/heuristic-schema.md`.
8. **No open-eval differentiation** — the doc has no posture about reproducible benchmarks as a credibility weapon against closed-eval competitors. See `ops/business-model.md` "credibility wedge."
9. **Specific model name accuracy** — references like `GPT-5.3-Codex` may not match production model names; treat the analytical/creative tier *roles* as load-bearing, the specific model names as illustrative.

### Mapping deep-research → Silica equivalents

| Deep-research concept | Silica equivalent | Notes |
|---|---|---|
| Four-tier validation framework | 11-rung validation tier ladder (`design/validation-tiers.md`) | Silica's ladder is a superset; tier 1=R1, tier 2=R2, tier 3=R3, tier 4=R5/R8 |
| Structured JSON message schema | Finding schema v0 (`design/schema-draft-v0.md`) | Silica's schema is VM-agnostic and supports composite findings; deep-research is EVM-only |
| Confidence scoring | Confidence + Validation in Finding schema | Silica caps confidence by rung cleared (D-07) |
| Agent specialization (Access / State / Cross / Economic / PoC / Skeptic) | 6 of these are Silica's "agent plugin" surface | Silica also adds: per-VM specialists (SVM-PDA-checker, etc.), off-chain perimeter agents |
| RAG over CVEs / audit reports | Heuristic library (`design/heuristic-schema.md`) | Heuristic library is structured + versioned + cite-able + self-improving; RAG-over-text is the weaker form |
| SPEAR pattern (Planning/Execution/Repair/Coordinator/CommandExec) | Silica's 5 routers + agent plugin contract | The routers are Silica's mechanism for what SPEAR calls Planning + Coordinator; Repair maps to the analyzer→prover→skeptic loop with retry |
| Sandboxed Docker tool execution | Tool plugin contract + sandbox policy (in `ops/legal-framing.md` and `ops/perimeter-playbook.md`) | Silica adds tenant-isolation and prompt-injection defense |

### Strategic warning

The deep-research doc is essentially "build a system that does what Cecuro's marketing claims to do." Two problems:

1. **Cecuro's marketing claims are not all backed by their open-source code.** Building toward their claimed architecture means building toward a moving target that may not exist as described.
2. **Going head-on with Cecuro on EVM is the wrong axis.** Silica's compete-on-all-fronts thesis explicitly differentiates on multi-VM, off-chain perimeter, continuous monitoring, heuristic library, and open eval — none of which are addressed in this doc.

If we lifted this document wholesale into our spec, we'd be on track to ship a Cecuro clone. The actionable lift is **tactical components only** (the Slither-MCP tool list, oracle/AMM/ERC tables, opcode reference, resource limits) — not strategic framing.

### Recommended actions

1. **Lift into bug-taxonomy.md:** ERC-4626 inflation subtypes, oracle architecture comparison, AMM mathematics taxonomy.
2. **Lift into design/cost-model.md:** Slither-MCP as a baseline EVM static-analysis tool layer; resource-limits-per-tool table.
3. **Lift into design/heuristic-schema.md:** confidence scoring weights as a starting prior.
4. **Reference in notes.md:** SmartGuard as a comparable pipeline; Aether's chain-of-thought enforcement as a prompt pattern.
5. **Do not lift:** the "180 agents" framing, the SPEAR architecture as load-bearing, the EVM-only worldview, the AGM belief revision as MVP requirement, the Cecuro-as-gold-standard framing.

The doc earns its place in `/research/` as a useful tactical reference. It does not change Silica's strategic direction.
