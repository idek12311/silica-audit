/**
 * LLM gateway port — pure types only.
 *
 * Lives separate from anthropic-gateway.ts (the adapter) so consumers that
 * only need the trust-tier marker / port interface don't pull in the
 * Anthropic SDK runtime. Per CLAUDE.md "abstractions owned by policy":
 * agents and the orchestrator depend on this port; the adapter implements it.
 */

// notes.md §17.3 — trust-tier model
export type TrustTier = 'anthropic-no-retention' | 'self-hosted-vllm';

export interface ModelConfig {
  modelId: string;
  maxTokens: number;
  trustTier: TrustTier;
}

export interface GatewayMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GatewayRequest {
  trustTier: TrustTier;
  systemPrompt?: string;
  messages: GatewayMessage[];
  maxTokens?: number;
  /** If true, the system prompt is eligible for Anthropic prompt caching */
  cacheSystemPrompt?: boolean;
  /** Metadata for observability */
  agentRole?: string;
}

export interface GatewayResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteInputTokens: number;
  cacheReadInputTokens: number;
  model: string;
  trustTierUsed: TrustTier;
  stopReason: string;
}

export class GatewayError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'GatewayError';
    this.cause = cause;
  }
}

export interface LlmGateway {
  complete(request: GatewayRequest): Promise<GatewayResponse>;
}
