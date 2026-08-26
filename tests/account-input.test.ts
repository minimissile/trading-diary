import { describe, expect, it } from 'vitest';
import { serviceRequestSchema } from '../src/shared/service.schemas';
import {
  normalizeCreateAccountInput,
  normalizeUpdateAccountInput,
} from '../src/shared/accounts/account-input';

describe('accounts.create schema', () => {
  const base = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    method: 'accounts.create' as const,
  };

  it('accepts alias payload', () => {
    const parsed = serviceRequestSchema.safeParse({
      ...base,
      params: {
        alias: '养殖行业持仓',
        broker: 'hwabao',
        accountKind: 'securities',
        customFee: { commissionWan: 0.854, commissionMinYuan: 1, noCommissionMin: true },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts legacy name payload', () => {
    const parsed = serviceRequestSchema.safeParse({
      ...base,
      params: {
        name: '养殖行业持仓',
        broker: 'hwabao',
        customFee: { commissionWan: 0.854 },
      },
    });
    expect(parsed.success).toBe(true);
  });
});

describe('normalize account input', () => {
  it('maps legacy name to alias on create', () => {
    expect(normalizeCreateAccountInput({ name: ' 主账户 ', broker: 'huatai' })).toEqual({
      broker: 'huatai',
      alias: '主账户',
    });
  });

  it('prefers alias over legacy name', () => {
    expect(normalizeCreateAccountInput({ alias: 'A', name: 'B', broker: 'huatai' })).toEqual({
      broker: 'huatai',
      alias: 'A',
    });
  });

  it('clears alias when update sends empty string', () => {
    expect(normalizeUpdateAccountInput({ alias: '  ' })).toEqual({ alias: '' });
  });
});
