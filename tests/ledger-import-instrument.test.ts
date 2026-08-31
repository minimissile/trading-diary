import { describe, expect, it } from 'vitest';
import {
  inferTradeChannelFromText,
  mergeRecognizedTradeChannel,
  parseTradeChannel,
  resolveEffectiveTradeChannel,
} from '../src/service/portfolio/ledger-import-instrument';

describe('ledger import trade channel', () => {
  it('infers otc from fund app keywords', () => {
    expect(inferTradeChannelFromText('蚂蚁财富 - 我的定投')).toBe('otc');
    expect(inferTradeChannelFromText('华泰证券 成交明细')).toBe('exchange');
  });

  it('parses ai tradeChannel aliases', () => {
    expect(parseTradeChannel('fund')).toBe('otc');
    expect(parseTradeChannel('broker')).toBe('exchange');
  });

  it('merges recognized channels with fallback', () => {
    expect(mergeRecognizedTradeChannel([null, null], 'otc')).toBe('otc');
    expect(mergeRecognizedTradeChannel(['otc', 'otc', 'exchange'], 'exchange')).toBe('otc');
    expect(mergeRecognizedTradeChannel(['otc', 'exchange'], 'exchange')).toBe('exchange');
  });

  it('resolves per-record override', () => {
    expect(
      resolveEffectiveTradeChannel({ tradeChannel: 'otc' }, 'exchange'),
    ).toBe('otc');
    expect(
      resolveEffectiveTradeChannel({ tradeChannel: null }, 'otc'),
    ).toBe('otc');
  });
});
