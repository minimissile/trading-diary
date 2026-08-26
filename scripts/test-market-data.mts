#!/usr/bin/env node
/**
 * 联调：东方财富行情 / 分红 / 资讯（经 MarketService）。
 *
 * 用法：
 *   npx tsx scripts/test-market-data.mts
 *   npx tsx scripts/test-market-data.mts 601318 510300 110022
 */
import { marketService } from '../src/service/market/market-service';

const DEFAULT_SYMBOLS = ['601318', '600519', '510300', '110022'];

async function printSymbol(symbol: string): Promise<void> {
  console.log(`\n=== ${symbol} ===`);

  try {
    const snapshot = await marketService.getSnapshot(symbol);
    console.log('【标的】', snapshot.instrument.kind, snapshot.instrument.name);
    console.log('【行情】', {
      price: snapshot.quote.price,
      changePercent: snapshot.quote.changePercent,
      dividendYieldTtm: snapshot.quote.dividendYieldTtm,
      nav: snapshot.quote.nav,
      navDate: snapshot.quote.navDate,
    });

    if (snapshot.upcomingDividends.length > 0) {
      console.log('【待实施分红】');
      for (const item of snapshot.upcomingDividends) {
        console.log(`  - ${item.progress} | ${item.planText} | 除息 ${item.exDividendDate ?? '—'}`);
      }
    }
  } catch (error) {
    console.error('【快照失败】', error instanceof Error ? error.message : error);
  }

  try {
    const dividends = await marketService.listDividends(symbol, 1, 5);
    console.log(`【分红记录】共 ${dividends.total} 条，最近 ${dividends.items.length} 条`);
    for (const item of dividends.items) {
      console.log(`  - ${item.exDividendDate?.slice(0, 10) ?? '—'} | ${item.progress} | ${item.planText}`);
    }
  } catch (error) {
    console.error('【分红失败】', error instanceof Error ? error.message : error);
  }

  try {
    const news = await marketService.listNews(symbol, 3);
    if (news.length === 0) {
      console.log('【资讯】（无）');
    } else {
      console.log('【资讯】');
      for (const [index, item] of news.entries()) {
        console.log(`  ${index + 1}. ${item.title}`);
      }
    }
  } catch (error) {
    console.error('【资讯失败】', error instanceof Error ? error.message : error);
  }
}

async function main(): Promise<void> {
  const symbols = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_SYMBOLS;
  for (const symbol of symbols) {
    await printSymbol(symbol);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
