import { describe, it, expect, vi } from 'vitest';
import {
  AnthropicGateway,
  VllmGateway,
  TrustTierRouter,
  GatewayError,
} from '../../../src/llm/anthropic-gateway.js';
import type { GatewayRequest } from '../../../src/llm/anthropic-gateway.js';

// ---------------------------------------------------------------------------
// AnthropicGateway unit tests
// ---------------------------------------------------------------------------

describe('AnthropicGateway', () => {
  it('throws GatewayError for non-anthropic trust tier', async () => {
    const gateway = new AnthropicGateway('fake-key');
    const request: GatewayRequest = {
      trustTier: 'self-hosted-vllm',
      messages: [{ role: 'user', content: 'Hello' }],
    };
    await expect(gateway.complete(request)).rejects.toThrow(GatewayError);
    await expect(gateway.complete(request)).rejects.toThrow(/self-hosted-vllm/);
  });

  it('constructs a request to Anthropic and returns a GatewayResponse', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Analysis complete.' }],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 90,
        cache_read_input_tokens: 10,
      },
      stop_reason: 'end_turn',
    });

    const gateway = new AnthropicGateway('fake-key');
    // Inject mock
    (gateway as any).client = { messages: { create: mockCreate } };

    const request: GatewayRequest = {
      trustTier: 'anthropic-no-retention',
      systemPrompt: 'You are an analyzer.',
      cacheSystemPrompt: true,
      messages: [{ role: 'user', content: 'Analyze this contract.' }],
      agentRole: 'analyzer',
    };

    const result = await gateway.complete(request);

    expect(result.content).toBe('Analysis complete.');
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    expect(result.cacheWriteInputTokens).toBe(90);
    expect(result.cacheReadInputTokens).toBe(10);
    expect(result.trustTierUsed).toBe('anthropic-no-retention');
    expect(result.stopReason).toBe('end_turn');
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('passes cache_control when cacheSystemPrompt is true', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      stop_reason: 'end_turn',
    });

    const gateway = new AnthropicGateway('fake-key');
    (gateway as any).client = { messages: { create: mockCreate } };

    await gateway.complete({
      trustTier: 'anthropic-no-retention',
      systemPrompt: 'System prompt text',
      cacheSystemPrompt: true,
      messages: [{ role: 'user', content: 'Hello' }],
    });

    const callArgs = mockCreate.mock.calls[0]?.[0];
    expect(callArgs?.system).toBeDefined();
    // system should be an array with cache_control when cacheSystemPrompt = true
    expect(Array.isArray(callArgs?.system)).toBe(true);
    expect(callArgs?.system?.[0]?.cache_control).toBeDefined();
  });

  it('wraps SDK errors in GatewayError', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('Network error'));

    const gateway = new AnthropicGateway('fake-key');
    (gateway as any).client = { messages: { create: mockCreate } };

    await expect(gateway.complete({
      trustTier: 'anthropic-no-retention',
      messages: [{ role: 'user', content: 'Hello' }],
    })).rejects.toThrow(GatewayError);
  });
});

// ---------------------------------------------------------------------------
// VllmGateway unit tests
// ---------------------------------------------------------------------------

describe('VllmGateway', () => {
  it('throws GatewayError for non-vllm trust tier', async () => {
    const gateway = new VllmGateway('http://localhost:8000');
    await expect(gateway.complete({
      trustTier: 'anthropic-no-retention',
      messages: [{ role: 'user', content: 'Hello' }],
    })).rejects.toThrow(GatewayError);
  });

  it('calls the OpenAI-compatible completions endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: { content: 'vLLM response' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 50, completion_tokens: 20 },
        model: 'llama-4',
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const gateway = new VllmGateway('http://localhost:8000');
    const result = await gateway.complete({
      trustTier: 'self-hosted-vllm',
      messages: [{ role: 'user', content: 'Analyze this.' }],
    });

    expect(result.content).toBe('vLLM response');
    expect(result.trustTierUsed).toBe('self-hosted-vllm');
    expect(result.inputTokens).toBe(50);

    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// TrustTierRouter unit tests
// ---------------------------------------------------------------------------

describe('TrustTierRouter', () => {
  it('routes anthropic-no-retention to AnthropicGateway', async () => {
    const anthropicMock = { complete: vi.fn().mockResolvedValue({ content: 'anthropic', trustTierUsed: 'anthropic-no-retention', inputTokens: 1, outputTokens: 1, cacheWriteInputTokens: 0, cacheReadInputTokens: 0, model: 'claude', stopReason: 'end_turn' }) };
    const vllmMock = { complete: vi.fn() };

    const router = new TrustTierRouter(anthropicMock as any, vllmMock as any);
    await router.complete({
      trustTier: 'anthropic-no-retention',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(anthropicMock.complete).toHaveBeenCalledOnce();
    expect(vllmMock.complete).not.toHaveBeenCalled();
  });

  it('routes self-hosted-vllm to VllmGateway', async () => {
    const anthropicMock = { complete: vi.fn() };
    const vllmMock = { complete: vi.fn().mockResolvedValue({ content: 'vllm', trustTierUsed: 'self-hosted-vllm', inputTokens: 1, outputTokens: 1, cacheWriteInputTokens: 0, cacheReadInputTokens: 0, model: 'llama', stopReason: 'stop' }) };

    const router = new TrustTierRouter(anthropicMock as any, vllmMock as any);
    await router.complete({
      trustTier: 'self-hosted-vllm',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(vllmMock.complete).toHaveBeenCalledOnce();
    expect(anthropicMock.complete).not.toHaveBeenCalled();
  });
});
