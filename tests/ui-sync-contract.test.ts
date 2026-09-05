import { describe, expect, it } from 'vitest';
import { serviceRequestSchema } from '../src/shared/service.schemas';

const id = '00000000-0000-4000-8000-000000000001';
describe('calendar sync request contract', () => {
  it('accepts account-wide and individual symbol synchronization', () => {
    expect(serviceRequestSchema.parse({ id, method: 'portfolio.syncPnlCalendarBars', params: {} }).method).toBe(
      'portfolio.syncPnlCalendarBars',
    );
    expect(
      serviceRequestSchema.parse({ id, method: 'portfolio.syncPnlCalendarBar', params: { accountId: 'all', symbol: '600000' } })
        .method,
    ).toBe('portfolio.syncPnlCalendarBar');
  });
  it('rejects a missing symbol or unexpected parameters', () => {
    expect(serviceRequestSchema.safeParse({ id, method: 'portfolio.syncPnlCalendarBar', params: {} }).success).toBe(false);
    expect(
      serviceRequestSchema.safeParse({ id, method: 'portfolio.syncPnlCalendarBars', params: { overwrite: true } }).success,
    ).toBe(false);
  });
});
