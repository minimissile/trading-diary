import { describe, expect, it } from 'vitest';
import { serviceRequestSchema } from '../src/shared/service.schemas';

describe('serviceRequestSchema accounts.update', () => {
  it('accepts sh/sz etf custom fee fields', () => {
    const result = serviceRequestSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
      method: 'accounts.update',
      params: {
        id: 'acc-1',
        input: {
          customFee: {
            commissionWan: 2.5,
            commissionMinYuan: 5,
            etfShCommissionWan: 0.5,
            etfShNoCommissionMin: true,
            etfSzCommissionWan: 0.8,
            etfSzCommissionMinYuan: 5,
          },
        },
      },
    });

    expect(result.success).toBe(true);
  });
});
