import { useState } from 'react';
import { App } from 'antd';
import type { MarketQuote } from '../../../shared/market/types';
import type { PersonalWatchlistItem } from '../../../shared/watchlist/personal';
import { queryClient } from '../../lib/query-client';
import { queryKeys } from '../../lib/queries/keys';

export function isWatchlistQuoteFresh(quote: MarketQuote | undefined): boolean {
  if (!quote || quote.price === null || !Number.isFinite(quote.price) || quote.price <= 0) return false;
  const age = Date.now() - Date.parse(quote.fetchedAt);
  return age >= -5000 && age < 120_000;
}

export function hasReachedReminder(item: PersonalWatchlistItem, quote: MarketQuote | undefined): boolean {
  const reminder = item.reminder;
  if (!reminder || !['active', 'triggered'].includes(reminder.status) || !isWatchlistQuoteFresh(quote)) return false;
  return reminder.condition === 'at_or_above' ? quote!.price! >= reminder.targetPrice : quote!.price! <= reminder.targetPrice;
}

export function useWatchlistAction() {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>, success?: string): Promise<boolean> => {
    setBusy(true);
    try {
      await action();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.watchlist.personal() }),
        queryClient.invalidateQueries({ queryKey: [...queryKeys.watchlist.all, 'logs'] }),
      ]);
      if (success) void message.success(success);
      return true;
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '保存失败，请重试');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}
