import Anthropic from '@anthropic-ai/sdk';
import type { Message, MessageParam, TextBlock } from '@anthropic-ai/sdk/resources/messages.js';

// ---------------------------------------------------------------------------
// Trust tier model (notes.md §17.3)
// ---------------------------------------------------------------------------

export type TrustTier = 'anthropic-no-retention' | 'self-hosted-vllm';

export interface ModelConfig {
  modelId: string;
  maxTokens: number;
  trustTier: TrustTier;
}

/** Default model mapping per trust tier */
const DEFAULT_MODELS: Record<TrustTier, string> = {
  'anthropic-no-retention': 'claude-sonnet-4-6',
  'self-hosted-vllm': process.env['VLLM_DEFAULT_MODEL'] ?? 'meta-llama/Llama-4-Scout-17B-16E-Instruct',
};

// ---------------------------------------------------------------------------
// Prompt message and caching types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Gateway errors
// ---------------------------------------------------------------------------

export class GatewayError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'GatewayError';
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// LLM Gateway client interface (port — owned by the application layer)
// ---------------------------------------------------------------------------

export interface LlmGateway {
  complete(request: GatewayRequest): Promise<GatewayResponse>;
}

// ---------------------------------------------------------------------------
// Anthropic SDK implementation
// ---------------------------------------------------------------------------

export class AnthropicGateway implements LlmGateway {
  private readonly client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env['ANTHROPIC_API_KEY'],
    });
  }

  async complete(request: GatewayRequest): Promise<GatewayResponse> {
    if (request.trustTier !== 'anthropic-no-retention') {
      throw new GatewayError(
        `AnthropicGateway only handles 'anthropic-no-retention' tier. ` +
        `Got: '${request.trustTier}'. Use VllmGateway for self-hosted tier.`,
      );
    }

    const modelId = DEFAULT_MODELS['anthropic-no-retention'];
    const maxTokens = request.maxTokens ?? 4096;

    const messages: MessageParam[] = request.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const systemContent = request.systemPrompt
      ? request.cacheSystemPrompt
        ? [{
            type: 'text' as const,
            text: request.systemPrompt,
            cache_control: { type: 'ephemeral' as const },
          }]
        : request.systemPrompt
      : undefined;

    try {
      const response: Message = await this.client.messages.create({
        model: modelId,
        max_tokens: maxTokens,
        messages,
        ...(systemContent ? { system: systemContent } : {}),
      });

      const textContent = response.content
        .filter((b): b is TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');

      const usage = response.usage as {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };

      return {
        content: textContent,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheWriteInputTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
        model: modelId,
        trustTierUsed: 'anthropic-no-retention',
        stopReason: response.stop_reason ?? 'end_turn',
      };
    } catch (err) {
      throw new GatewayError(`Anthropic API call failed: ${String(err)}`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// vLLM (self-hosted) gateway — stub implementation
// ---------------------------------------------------------------------------

/**
 * Routes to a self-hosted vLLM endpoint.
 * Used for IP-sensitive / high-trust-tier requests (notes.md §17.3).
 */
export class VllmGateway implements LlmGateway {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env['VLLM_BASE_URL'] ?? 'http://localhost:8000';
  }

  async complete(request: GatewayRequest): Promise<GatewayResponse> {
    if (request.trustTier !== 'self-hosted-vllm') {
      throw new GatewayError(
        `VllmGateway only handles 'self-hosted-vllm' tier. Got: '${request.trustTier}'.`,
      );
    }

    const modelId = DEFAULT_MODELS['self-hosted-vllm'];
    const maxTokens = request.maxTokens ?? 4096;

    // OpenAI-compatible /v1/chat/completions endpoint
    const body = {
      model: modelId,
      messages: [
        ...(request.systemPrompt
          ? [{ role: 'system', content: request.systemPrompt }]
          : []),
        ...request.messages,
      ],
      max_tokens: maxTokens,
    };

    try {
      const resp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        throw new GatewayError(`vLLM HTTP ${resp.status}: ${await resp.text()}`);
      }

      const data = await resp.json() as {
        choices: Array<{ message: { content: string }; finish_reason: string }>;
        usage: { prompt_tokens: number; completion_tokens: number };
        model: string;
      };

      const choice = data.choices[0];
      if (!choice) throw new GatewayError('vLLM returned no choices');

      return {
        content: choice.message.content,
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        cacheWriteInputTokens: 0,
        cacheReadInputTokens: 0,
        model: data.model ?? modelId,
        trustTierUsed: 'self-hosted-vllm',
        stopReason: choice.finish_reason ?? 'stop',
      };
    } catch (err) {
      if (err instanceof GatewayError) throw err;
      throw new GatewayError(`vLLM call failed: ${String(err)}`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Trust-tier router (selects gateway based on trust tier)
// ---------------------------------------------------------------------------

export class TrustTierRouter implements LlmGateway {
  constructor(
    private readonly anthropicGateway: AnthropicGateway,
    private readonly vllmGateway: VllmGateway,
  ) {}

  complete(request: GatewayRequest): Promise<GatewayResponse> {
    if (request.trustTier === 'anthropic-no-retention') {
      return this.anthropicGateway.complete(request);
    }
    return this.vllmGateway.complete(request);
  }
}

// ---------------------------------------------------------------------------
// Factory — creates the default production gateway
// ---------------------------------------------------------------------------

export function createGateway(): TrustTierRouter {
  return new TrustTierRouter(
    new AnthropicGateway(),
    new VllmGateway(),
  );
}
