import { describe, expect, it } from 'vitest';
import {
  buildFundProfileSummary,
  resolveFundOperationMode,
  shouldCacheFundProfile,
} from '../src/shared/market/fund-profile';

describe('fund profile', () => {
  it('detects open-end OTC fund', () => {
    const profile = {
      FUNDTYPE: '001',
      FTYPE: '指数型-股票',
      SGZT: '开放申购',
      SHZT: '开放赎回',
    };
    expect(resolveFundOperationMode(profile)).toBe('open');
    expect(buildFundProfileSummary(profile).operationModeLabel).toBeNull();
  });

  it('detects closed-end fund by FUNDTYPE 002', () => {
    const profile = {
      FUNDTYPE: '002',
      SGZT: '开放申购',
      SHZT: '开放赎回',
      ISLIST: '1',
    };
    expect(resolveFundOperationMode(profile)).toBe('closed_end');
    expect(buildFundProfileSummary(profile).operationModeLabel).toBe('封闭式');
    expect(buildFundProfileSummary(profile).isListed).toBe(true);
  });

  it('detects closed period by FUNDTYPE 003 and redemption status', () => {
    const profile = {
      FUNDTYPE: '003',
      SGZT: '封闭期',
      SHZT: '封闭期',
      FTYPE: '债券型-长债',
      JJGS: '惠升基金',
    };
    expect(resolveFundOperationMode(profile)).toBe('closed_period');
    expect(buildFundProfileSummary(profile).operationModeLabel).toBe('封闭期');
    expect(buildFundProfileSummary(profile).fundCompany).toBe('惠升基金');
  });

  it('only caches fund-like instrument kinds', () => {
    expect(shouldCacheFundProfile('otc_fund')).toBe(true);
    expect(shouldCacheFundProfile('lof')).toBe(true);
    expect(shouldCacheFundProfile('etf')).toBe(true);
    expect(shouldCacheFundProfile('stock')).toBe(false);
  });
});
