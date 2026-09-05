import { defineConfig } from 'vitest/config';

// Live quotes are opt-in; the default suite is deterministic and offline.
const liveTests = [
  'tests/eastmoney-quote-daily.test.ts',
  'tests/eastmoney-quote.integration.test.ts',
  'tests/fund-dividend-004598.test.ts',
  'tests/historical-price.integration.test.ts',
  'tests/kline-fetch.test.ts',
  'tests/market-router.test.ts',
  'tests/pnl-calendar-live.test.ts',
  'tests/portfolio-otc-fund-hold.test.ts',
  'tests/position-daily-pnl-002575-live.test.ts',
  'tests/position-filter-live.test.ts',
  'tests/resolve-instrument-fund.test.ts',
  'tests/search-008706.test.ts',
  'tests/tiankang-002100-live.test.ts',
];
const live = process.env.TRADING_DIARY_LIVE_TESTS === '1';

export default defineConfig({
  test: {
    environment: 'node',
    include: live ? liveTests : ['tests/**/*.test.ts'],
    exclude: live ? [] : liveTests,
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
