import { describe, expect, it } from 'vitest';
import {
  formatCommissionWan,
  roundCommissionWan,
} from '../src/shared/accounts/fee-utils';

describe('commission wan precision', () => {
  it('preserves wan 1.054 with 4 decimal places', () => {
    expect(roundCommissionWan(1.054)).toBe(1.054);
    expect(formatCommissionWan(1.054)).toBe('万1.054');
  });

  it('keeps common whole wan rates exact', () => {
    expect(roundCommissionWan(2.5)).toBe(2.5);
    expect(roundCommissionWan(1.05)).toBe(1.05);
  });
});
