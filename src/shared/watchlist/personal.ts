import type { TradeAlertCondition, TradeAlertStatus } from '../api.types';
import type { InstrumentKind } from '../market/types';
import type { InstrumentVenue, QuoteCurrency } from '../market/venues';

export interface WatchlistGroup {
  id: string;
  name: string;
}
export interface TrackingLog {
  id: string;
  itemId: string;
  date: string;
  review: string;
  feeling: string;
  createdAt: string;
  updatedAt: string;
}
export interface WatchlistReminder {
  id: string;
  condition: TradeAlertCondition;
  targetPrice: number;
  status: TradeAlertStatus;
}
export interface PersonalWatchlistItem {
  id: string;
  symbol: string;
  name: string;
  venue: InstrumentVenue;
  quoteCurrency: QuoteCurrency;
  kind: InstrumentKind;
  starred: boolean;
  position: number;
  groupIds: string[];
  tags: string[];
  waitingFor: string;
  invalidation: string;
  addedPrice: number | null;
  addedPriceAt: string | null;
  createdAt: string;
  reminder: WatchlistReminder | null;
  logCount: number;
  latestLog: string | null;
  latestLogDate: string | null;
  holding: boolean;
}
export interface WatchlistItemChanges {
  starred?: boolean;
  groupIds?: string[];
  tags?: string[];
  waitingFor?: string;
  invalidation?: string;
}
export interface AddWatchlistItemInput extends WatchlistItemChanges {
  symbol: string;
}
export interface SaveTrackingLogInput {
  id?: string;
  itemId: string;
  date: string;
  review: string;
  feeling: string;
}
export interface SetWatchlistReminderInput {
  id: string;
  reminder: { condition: TradeAlertCondition; targetPrice: number } | null;
}
export interface PersonalWatchlistSnapshot {
  items: PersonalWatchlistItem[];
  groups: WatchlistGroup[];
}
export interface PersonalWatchlistMethods {
  'watchlist.listPersonal': { params: Record<string, never>; result: PersonalWatchlistSnapshot };
  'watchlist.add': { params: AddWatchlistItemInput; result: { item: PersonalWatchlistItem; alreadyExists: boolean } };
  'watchlist.update': { params: { id: string; changes: WatchlistItemChanges }; result: PersonalWatchlistItem };
  'watchlist.remove': { params: { id: string }; result: void };
  'watchlist.move': { params: { id: string; direction: 'up' | 'down' }; result: void };
  'watchlist.saveGroup': { params: { id?: string; name: string }; result: WatchlistGroup };
  'watchlist.removeGroup': { params: { id: string }; result: void };
  'watchlist.listLogs': { params: { itemId: string }; result: TrackingLog[] };
  'watchlist.saveLog': { params: SaveTrackingLogInput; result: TrackingLog };
  'watchlist.removeLog': { params: { id: string; itemId: string }; result: void };
  'watchlist.setReminder': { params: SetWatchlistReminderInput; result: PersonalWatchlistItem };
}
export interface PersonalWatchlistApi {
  listPersonal: () => Promise<PersonalWatchlistSnapshot>;
  add: (input: AddWatchlistItemInput) => Promise<{ item: PersonalWatchlistItem; alreadyExists: boolean }>;
  update: (id: string, changes: WatchlistItemChanges) => Promise<PersonalWatchlistItem>;
  remove: (id: string) => Promise<void>;
  move: (id: string, direction: 'up' | 'down') => Promise<void>;
  saveGroup: (input: { id?: string; name: string }) => Promise<WatchlistGroup>;
  removeGroup: (id: string) => Promise<void>;
  listLogs: (itemId: string) => Promise<TrackingLog[]>;
  saveLog: (input: SaveTrackingLogInput) => Promise<TrackingLog>;
  removeLog: (id: string, itemId: string) => Promise<void>;
  setReminder: (input: SetWatchlistReminderInput) => Promise<PersonalWatchlistItem>;
}
