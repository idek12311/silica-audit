import { describe, it, expect, vi } from 'vitest';
import { SvmSpecialistAgent } from '../../../src/agents/svm-shared.js';
import { CpiAuthorityAgent } from '../../../src/agents/svm-cpi-authority.js';
import { MissingSignerAgent } from '../../../src/agents/svm-missing-signer.js';
import { AccountCosplayAgent } from '../../../src/agents/svm-account-cosplay.js';
import { SysvarSpoofingAgent } from '../../../src/agents/svm-sysvar-spoofing.js';
import { ArbitraryCpiAgent } from '../../../src/agents/svm-arbitrary-cpi.js';
import { MissingOwnerAgent } from '../../../src/agents/svm-missing-owner.js';
import { DuplicateAccountMutableAgent } from '../../../src/agents/svm-duplicate-account-mutable.js';
import type { GatewayResponse } from '../../../src/llm/anthropic-gateway.js';

function makeGatewayResponse(content: string): GatewayResponse {
  return {
    content,
    inputTokens: 100,
    outputTokens: 50,
    cacheWriteInputTokens: 0,
    cacheReadInputTokens: 0,
    model: 'claude-sonnet-4-6',
    trustTierUsed: 'anthropic-no-retention',
    stopReason: 'end_turn',
  };
}

describe('SVM specialist agents — 7 bug classes', () => {
  const agentInstances = [
    { name: 'CpiAuthorityAgent', agent: (gw: any) => new CpiAuthorityAgent(gw), bugClass: 'SVM-CPI-AUTHORITY-CONFUSION' },
    { name: 'MissingSignerAgent', agent: (gw: any) => new MissingSignerAgent(gw), bugClass: 'SVM-MISSING-SIGNER-CHECK' },
    { name: 'AccountCosplayAgent', agent: (gw: any) => new AccountCosplayAgent(gw), bugClass: 'SVM-ACCOUNT-TYPE-COSPLAY' },
    { name: 'SysvarSpoofingAgent', agent: (gw: any) => new SysvarSpoofingAgent(gw), bugClass: 'SVM-SYSVAR-SPOOFING' },
    { name: 'ArbitraryCpiAgent', agent: (gw: any) => new ArbitraryCpiAgent(gw), bugClass: 'SVM-ARBITRARY-CPI' },
    { name: 'MissingOwnerAgent', agent: (gw: any) => new MissingOwnerAgent(gw), bugClass: 'SVM-MISSING-OWNER-CHECK' },
    { name: 'DuplicateAccountMutableAgent', agent: (gw: any) => new DuplicateAccountMutableAgent(gw), bugClass: 'SVM-DUPLICATE-ACCOUNT-MUTABLE' },
  ];

  it('exactly 7 SVM specialist agent classes exist', () => {
    expect(agentInstances).toHaveLength(7);
  });

  for (const { name, agent: createAgent, bugClass } of agentInstances) {
    it(`${name} calls gateway with correct bugClass=${bugClass}`, async () => {
      const mockGateway = { complete: vi.fn().mockResolvedValue(makeGatewayResponse('[]')) };
      const a = createAgent(mockGateway);
      expect(a.bugClass).toBe(bugClass);

      await a.analyze({
        auditId: 'aud_001',
        tenantId: 'tnt_001',
        trustTier: 'anthropic-no-retention',
      });

      expect(mockGateway.complete).toHaveBeenCalledOnce();
    });

    it(`${name} tags [UNTRUSTED-INPUT] in prompt for anchor IDL`, async () => {
      const mockGateway = { complete: vi.fn().mockResolvedValue(makeGatewayResponse('[]')) };
      const a = createAgent(mockGateway);

      await a.analyze({
        auditId: 'aud_001',
        tenantId: 'tnt_001',
        trustTier: 'anthropic-no-retention',
        anchorIdl: '{"version":"0.1.0","instructions":[]}',
      });

      const req = mockGateway.complete.mock.calls[0]?.[0];
      expect(req?.messages[0]?.content).toContain('[UNTRUSTED-INPUT]');
    });

    it(`${name} system prompt contains injection defense`, async () => {
      const mockGateway = { complete: vi.fn().mockResolvedValue(makeGatewayResponse('[]')) };
      const a = createAgent(mockGateway);

      await a.analyze({
        auditId: 'aud_001',
        tenantId: 'tnt_001',
        trustTier: 'anthropic-no-retention',
      });

      const req = mockGateway.complete.mock.calls[0]?.[0];
      expect(req?.systemPrompt).toContain('UNTRUSTED-INPUT');
    });

    it(`${name} records trustTierUsed in output`, async () => {
      const mockGateway = { complete: vi.fn().mockResolvedValue(makeGatewayResponse('[]')) };
      const a = createAgent(mockGateway);
      const result = await a.analyze({
        auditId: 'aud_001',
        tenantId: 'tnt_001',
        trustTier: 'anthropic-no-retention',
      });
      expect(result.trustTierUsed).toBe('anthropic-no-retention');
    });
  }

  it('self-hosted-vllm trust tier is routable through SVM agents', async () => {
    const vllmResponse: GatewayResponse = { ...makeGatewayResponse('[]'), trustTierUsed: 'self-hosted-vllm' };
    const mockGateway = { complete: vi.fn().mockResolvedValue(vllmResponse) };
    const agent = new CpiAuthorityAgent(mockGateway, 'self-hosted-vllm');

    const result = await agent.analyze({
      auditId: 'aud_001',
      tenantId: 'tnt_001',
      trustTier: 'self-hosted-vllm',
    });

    expect(result.trustTierUsed).toBe('self-hosted-vllm');
  });
});
