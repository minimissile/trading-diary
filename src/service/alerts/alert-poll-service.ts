import type { AppDatabase } from '../database/database';
import { marketService } from '../market/market-service';
import type { AlertPollResult } from '../../shared/alerts/event-types';

export async function pollActiveAlerts(database: AppDatabase): Promise<AlertPollResult> {
  const activeSymbols = database.listActiveAlertSymbols();
  const newlyTriggered = [];

  for (const symbol of activeSymbols) {
    try {
      const quote = await marketService.getQuote(symbol);
      const price = quote.price ?? quote.nav;
      if (price === null || price <= 0) continue;
      const result = database.evaluatePrice(symbol, price);
      newlyTriggered.push(...result.newlyTriggeredEvents);
    } catch {
      // 单个标的行情失败时跳过，不影响其他提醒
    }
  }

  return {
    evaluatedSymbolCount: activeSymbols.length,
    newlyTriggered,
  };
}
