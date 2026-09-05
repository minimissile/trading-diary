import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { InstrumentInfo, MarketQuote } from '../../shared/market/types';
import { marketLookupKey } from '../../shared/market/instrument-id';
import type {
  PersonalWatchlistItem,
  SaveTrackingLogInput,
  SetWatchlistReminderInput,
  TrackingLog,
  WatchlistGroup,
  WatchlistItemChanges,
  WatchlistReminder,
} from '../../shared/watchlist/personal';

interface ItemRow {
  id: string;
  symbol: string;
  name: string;
  venue: PersonalWatchlistItem['venue'];
  quote_currency: PersonalWatchlistItem['quoteCurrency'];
  kind: PersonalWatchlistItem['kind'];
  starred: number;
  position: number;
  tags_json: string;
  waiting_for: string;
  invalidation: string;
  added_price_micros: number | null;
  added_price_at: string | null;
  created_at: string;
  reminder_id: string | null;
  condition: WatchlistReminder['condition'] | null;
  target_price_micros: number | null;
  status: WatchlistReminder['status'] | null;
  log_count: number;
  latest_log: string | null;
  latest_log_date: string | null;
  holding: number;
}
interface LogRow {
  id: string;
  item_id: string;
  record_date: string;
  review: string;
  feeling: string;
  created_at: string;
  updated_at: string;
}

const itemSelect = `SELECT w.*, a.condition, a.target_price_micros, a.status,
  (SELECT COUNT(*) FROM watchlist_tracking_logs l WHERE l.item_id = w.id) AS log_count,
  (SELECT trim(l.review || char(10) || l.feeling, char(10) || ' ') FROM watchlist_tracking_logs l WHERE l.item_id = w.id
    ORDER BY l.record_date DESC, l.created_at DESC, l.rowid DESC LIMIT 1) AS latest_log,
  (SELECT l.record_date FROM watchlist_tracking_logs l WHERE l.item_id = w.id
    ORDER BY l.record_date DESC, l.created_at DESC, l.rowid DESC LIMIT 1) AS latest_log_date,
  EXISTS(SELECT 1 FROM portfolio_ledger p WHERE p.symbol = w.symbol AND p.venue = w.venue
    GROUP BY p.account_id HAVING SUM(p.quantity_micros) > 0) AS holding
  FROM personal_watchlist w LEFT JOIN alert_rules a ON a.id = w.reminder_id`;

export class WatchlistDatabase {
  constructor(private readonly db: DatabaseSync) {}

  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  list(): PersonalWatchlistItem[] {
    const rows = this.db
      .prepare(`${itemSelect} WHERE w.removed_at IS NULL ORDER BY w.starred DESC, w.position, w.id`)
      .all() as unknown as ItemRow[];
    const memberships = this.db.prepare('SELECT item_id, group_id FROM watchlist_memberships').all() as Array<{
      item_id: string;
      group_id: string;
    }>;
    const groups = new Map<string, string[]>();
    for (const row of memberships) groups.set(row.item_id, [...(groups.get(row.item_id) ?? []), row.group_id]);
    return rows.map((row) => this.mapItem(row, groups.get(row.id) ?? []));
  }

  get(id: string): PersonalWatchlistItem {
    const row = this.db.prepare(`${itemSelect} WHERE w.id = ? AND w.removed_at IS NULL`).get(id) as unknown as
      ItemRow | undefined;
    if (!row) throw new Error('这只股票已不在自选中，请刷新列表');
    const groups = this.db.prepare('SELECT group_id FROM watchlist_memberships WHERE item_id = ?').all(id) as Array<{
      group_id: string;
    }>;
    return this.mapItem(
      row,
      groups.map((group) => group.group_id),
    );
  }

  find(symbol: string, venue: string): PersonalWatchlistItem | null {
    const row = this.db
      .prepare('SELECT id FROM personal_watchlist WHERE symbol = ? AND venue = ? AND removed_at IS NULL')
      .get(symbol, venue) as { id: string } | undefined;
    return row ? this.get(row.id) : null;
  }

  add(
    instrument: InstrumentInfo,
    quote: MarketQuote | null,
    changes: WatchlistItemChanges,
  ): { item: PersonalWatchlistItem; alreadyExists: boolean } {
    const existing = this.find(instrument.symbol, instrument.venue);
    if (existing) return { item: existing, alreadyExists: true };
    if (instrument.kind === 'otc_fund') throw new Error('请选择股票或场内基金');
    const archived = this.db
      .prepare('SELECT id FROM personal_watchlist WHERE symbol = ? AND venue = ?')
      .get(instrument.symbol, instrument.venue) as { id: string } | undefined;
    const id = archived?.id ?? randomUUID();
    const now = new Date().toISOString();
    const position = (
      this.db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM personal_watchlist').get() as { n: number }
    ).n;
    const quoteAge = quote ? Date.now() - Date.parse(quote.fetchedAt) : Infinity;
    const candidate =
      quote &&
      quote.symbol === instrument.symbol &&
      quote.venue === instrument.venue &&
      quoteAge >= -5000 &&
      quoteAge <= 120_000 &&
      quote.price !== null &&
      Number.isFinite(quote.price) &&
      quote.price > 0
        ? Math.round(quote.price * 10_000)
        : null;
    const price = candidate !== null && Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null;
    this.transaction(() => {
      if (archived) {
        this.db
          .prepare(
            `UPDATE personal_watchlist SET removed_at = NULL, name = ?, position = ?, created_at = ?,
          updated_at = ?, added_price_micros = ?, added_price_at = ? WHERE id = ?`,
          )
          .run(instrument.name, position, now, now, price, price ? quote!.fetchedAt : null, id);
      } else {
        this.db
          .prepare(
            `INSERT INTO personal_watchlist (id, symbol, name, venue, quote_currency, kind, position,
          added_price_micros, added_price_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            instrument.symbol,
            instrument.name,
            instrument.venue,
            instrument.quoteCurrency,
            instrument.kind,
            position,
            price,
            price ? quote!.fetchedAt : null,
            now,
            now,
          );
      }
      this.applyChanges(id, changes);
    });
    return { item: this.get(id), alreadyExists: false };
  }

  update(id: string, changes: WatchlistItemChanges): PersonalWatchlistItem {
    this.get(id);
    this.transaction(() => this.applyChanges(id, changes));
    return this.get(id);
  }

  private applyChanges(id: string, changes: WatchlistItemChanges): void {
    const current = this.get(id);
    this.db
      .prepare(
        `UPDATE personal_watchlist SET starred = ?, tags_json = ?, waiting_for = ?, invalidation = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        Number(changes.starred ?? current.starred),
        JSON.stringify([...new Set(changes.tags ?? current.tags)]),
        changes.waitingFor ?? current.waitingFor,
        changes.invalidation ?? current.invalidation,
        new Date().toISOString(),
        id,
      );
    if (changes.groupIds !== undefined) {
      this.db.prepare('DELETE FROM watchlist_memberships WHERE item_id = ?').run(id);
      const insert = this.db.prepare('INSERT INTO watchlist_memberships (item_id, group_id) VALUES (?, ?)');
      for (const groupId of new Set(changes.groupIds)) insert.run(id, groupId);
    }
  }

  remove(id: string): void {
    const item = this.get(id);
    this.transaction(() => {
      const now = new Date().toISOString();
      if (item.reminder) this.disableReminder(item.reminder.id, now);
      this.db
        .prepare('UPDATE personal_watchlist SET removed_at = ?, updated_at = ?, reminder_id = NULL WHERE id = ?')
        .run(now, now, id);
    });
  }

  move(id: string, direction: 'up' | 'down'): void {
    const item = this.get(id);
    const items = this.list().filter((row) => row.starred === item.starred);
    const index = items.findIndex((row) => row.id === id);
    const neighbor = items[index + (direction === 'up' ? -1 : 1)];
    if (!neighbor) return;
    this.transaction(() => {
      this.db.prepare('UPDATE personal_watchlist SET position = ? WHERE id = ?').run(neighbor.position, item.id);
      this.db.prepare('UPDATE personal_watchlist SET position = ? WHERE id = ?').run(item.position, neighbor.id);
    });
  }

  listGroups(): WatchlistGroup[] {
    return this.db.prepare('SELECT id, name FROM watchlist_groups ORDER BY rowid').all() as unknown as WatchlistGroup[];
  }

  saveGroup(input: { id?: string; name: string }): WatchlistGroup {
    const name = input.name.trim();
    if (!name) throw new Error('请输入分组名称');
    const duplicate = this.db.prepare('SELECT id FROM watchlist_groups WHERE name = ?').get(name) as { id: string } | undefined;
    if (duplicate && duplicate.id !== input.id) throw new Error('已有同名分组');
    const id = input.id ?? randomUUID();
    if (input.id) {
      if (!this.db.prepare('UPDATE watchlist_groups SET name = ? WHERE id = ?').run(name, id).changes)
        throw new Error('分组不存在');
    } else this.db.prepare('INSERT INTO watchlist_groups (id, name) VALUES (?, ?)').run(id, name);
    return { id, name };
  }

  removeGroup(id: string): void {
    this.db.prepare('DELETE FROM watchlist_groups WHERE id = ?').run(id);
  }

  listLogs(itemId: string): TrackingLog[] {
    this.get(itemId);
    const rows = this.db
      .prepare('SELECT * FROM watchlist_tracking_logs WHERE item_id = ? ORDER BY record_date DESC, created_at DESC, rowid DESC')
      .all(itemId) as unknown as LogRow[];
    return rows.map((row) => this.mapLog(row));
  }

  saveLog(input: SaveTrackingLogInput): TrackingLog {
    this.get(input.itemId);
    const review = input.review.trim();
    const feeling = input.feeling.trim();
    if (!review && !feeling) throw new Error('请填写复盘记录或盘感记录');
    const date = new Date(`${input.date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(input.date) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== input.date
    )
      throw new Error('记录日期无效');
    const id = input.id ?? randomUUID();
    const now = new Date().toISOString();
    if (input.id) {
      const result = this.db
        .prepare(
          'UPDATE watchlist_tracking_logs SET record_date = ?, review = ?, feeling = ?, updated_at = ? WHERE id = ? AND item_id = ?',
        )
        .run(input.date, review, feeling, now, id, input.itemId);
      if (!result.changes) throw new Error('日志不存在，请刷新后重试');
    } else {
      this.db
        .prepare(
          'INSERT INTO watchlist_tracking_logs (id, item_id, record_date, review, feeling, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(id, input.itemId, input.date, review, feeling, now, now);
    }
    return this.mapLog(this.db.prepare('SELECT * FROM watchlist_tracking_logs WHERE id = ?').get(id) as unknown as LogRow);
  }

  removeLog(id: string, itemId: string): void {
    this.get(itemId);
    this.db.prepare('DELETE FROM watchlist_tracking_logs WHERE id = ? AND item_id = ?').run(id, itemId);
  }

  setReminder(input: SetWatchlistReminderInput): PersonalWatchlistItem {
    const item = this.get(input.id);
    const target = input.reminder ? Math.round(input.reminder.targetPrice * 10_000) : null;
    if (target !== null && (!Number.isSafeInteger(target) || target <= 0))
      throw new Error('提醒价格必须大于 0，最多保留四位小数');
    this.transaction(() => {
      const now = new Date().toISOString();
      if (item.reminder && !input.reminder) this.disableReminder(item.reminder.id, now);
      let reminderId: string | null = null;
      if (input.reminder) {
        reminderId = item.reminder?.id ?? randomUUID();
        if (item.reminder) {
          this.db
            .prepare(
              `UPDATE alert_rules SET condition = ?, target_price_micros = ?, status = 'active',
            last_price_micros = NULL, triggered_at = NULL, updated_at = ? WHERE id = ?`,
            )
            .run(input.reminder.condition, target, now, reminderId);
        } else
          this.db
            .prepare(
              `INSERT INTO alert_rules (id, plan_id, symbol, title, condition, role, target_price_micros,
          last_price_micros, status, triggered_at, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, 'custom', ?, NULL, 'active', NULL, ?, ?)`,
            )
            .run(reminderId, marketLookupKey(item), `自选 · ${item.name}价格提醒`, input.reminder.condition, target, now, now);
      }
      this.db
        .prepare('UPDATE personal_watchlist SET reminder_id = ?, updated_at = ? WHERE id = ?')
        .run(reminderId, now, input.id);
    });
    return this.get(input.id);
  }

  private disableReminder(id: string, now: string): void {
    this.db.prepare("UPDATE alert_rules SET status = 'disabled', updated_at = ? WHERE id = ? AND status = 'active'").run(now, id);
  }

  private mapLog(row: LogRow): TrackingLog {
    return {
      id: row.id,
      itemId: row.item_id,
      date: row.record_date,
      review: row.review,
      feeling: row.feeling,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapItem(row: ItemRow, groupIds: string[]): PersonalWatchlistItem {
    return {
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      venue: row.venue,
      quoteCurrency: row.quote_currency,
      kind: row.kind,
      starred: Boolean(row.starred),
      position: row.position,
      groupIds,
      tags: JSON.parse(row.tags_json) as string[],
      waitingFor: row.waiting_for,
      invalidation: row.invalidation,
      addedPrice: row.added_price_micros === null ? null : row.added_price_micros / 10_000,
      addedPriceAt: row.added_price_at,
      createdAt: row.created_at,
      reminder:
        row.reminder_id && row.condition && row.target_price_micros !== null && row.status
          ? { id: row.reminder_id, condition: row.condition, targetPrice: row.target_price_micros / 10_000, status: row.status }
          : null,
      logCount: row.log_count,
      latestLog: row.latest_log,
      latestLogDate: row.latest_log_date,
      holding: Boolean(row.holding),
    };
  }
}
