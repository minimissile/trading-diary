import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { InstrumentKind } from '../../shared/market/types';
import type {
  CreateFundSipPlanInput,
  FundSipOccurrence,
  FundSipPlan,
  SipOccurrenceStatus,
  SipPlanStatus,
  UpdateFundSipPlanInput,
} from '../../shared/sip/types';
import { compareIsoDate, generateOccurrenceDates, resolveDueTransitions, rollingHorizonForFrequency } from './sip-scheduler';

const MONEY_SCALE = 100;
const PRICE_SCALE = 10_000;
const QUANTITY_SCALE = 10_000;

function toCents(value: number): number {
  return Math.round(value * MONEY_SCALE);
}

function fromCents(value: number): number {
  return value / MONEY_SCALE;
}

function toPriceMicros(value: number): number {
  return Math.round(value * PRICE_SCALE);
}

function fromPriceMicros(value: number): number {
  return value / PRICE_SCALE;
}

function toQuantityMicros(value: number): number {
  return Math.round(value * QUANTITY_SCALE);
}

function fromQuantityMicros(value: number): number {
  return value / QUANTITY_SCALE;
}

function normalizeSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) throw new Error('标的代码不能为空');
  return normalized;
}

interface FundSipPlanRow {
  id: string;
  account_id: string;
  symbol: string;
  name: string;
  kind: InstrumentKind;
  amount_cents: number;
  frequency: FundSipPlan['frequency'];
  day_of_week: number | null;
  day_of_month: number | null;
  start_date: string;
  end_date: string | null;
  thesis: string;
  status: SipPlanStatus;
  pause_from_date: string | null;
  created_at: string;
  updated_at: string;
}

interface FundSipOccurrenceRow {
  id: string;
  plan_id: string;
  scheduled_date: string;
  status: SipOccurrenceStatus;
  amount_cents: number | null;
  quantity_micros: number | null;
  nav_micros: number | null;
  fees_cents: number | null;
  ledger_entry_id: string | null;
  skip_reason: string;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

const planTransitions: Readonly<Record<SipPlanStatus, readonly SipPlanStatus[]>> = {
  draft: ['active', 'cancelled'],
  active: ['paused', 'completed', 'cancelled'],
  paused: ['active', 'cancelled'],
  completed: [],
  cancelled: [],
};

export class SipDatabase {
  constructor(private readonly db: DatabaseSync) {}

  listPlans(statuses?: SipPlanStatus[]): FundSipPlan[] {
    let sql = 'SELECT * FROM fund_sip_plans';
    const params: string[] = [];
    if (statuses && statuses.length > 0) {
      sql += ` WHERE status IN (${statuses.map(() => '?').join(', ')})`;
      params.push(...statuses);
    }
    sql += ' ORDER BY updated_at DESC';
    const rows = this.db.prepare(sql).all(...params) as unknown as FundSipPlanRow[];
    return rows.map((row) => this.mapPlan(row));
  }

  getPlan(id: string): FundSipPlan {
    const row = this.db.prepare('SELECT * FROM fund_sip_plans WHERE id = ?').get(id) as unknown as
      | FundSipPlanRow
      | undefined;
    if (!row) throw new Error('定投计划不存在');
    return this.mapPlan(row);
  }

  listOccurrences(planId?: string, from?: string, to?: string, statuses?: SipOccurrenceStatus[]): FundSipOccurrence[] {
    const params: Array<string> = [];
    let sql = 'SELECT * FROM fund_sip_occurrences WHERE 1=1';
    if (planId) {
      sql += ' AND plan_id = ?';
      params.push(planId);
    }
    if (from) {
      sql += ' AND scheduled_date >= ?';
      params.push(from);
    }
    if (to) {
      sql += ' AND scheduled_date <= ?';
      params.push(to);
    }
    if (statuses && statuses.length > 0) {
      sql += ` AND status IN (${statuses.map(() => '?').join(', ')})`;
      params.push(...statuses);
    }
    sql += ' ORDER BY scheduled_date DESC, created_at DESC';
    const rows = this.db.prepare(sql).all(...params) as unknown as FundSipOccurrenceRow[];
    return rows.map((row) => this.mapOccurrence(row));
  }

  listDueOccurrences(): FundSipOccurrence[] {
    return this.listOccurrences(undefined, undefined, undefined, ['due']);
  }

  createPlan(input: CreateFundSipPlanInput, resolved: { name: string; kind: InstrumentKind; accountId: string }): FundSipPlan {
    this.assertScheduleInput(input);
    const id = randomUUID();
    const now = new Date().toISOString();
    const status: SipPlanStatus = input.activateNow ? 'active' : 'draft';
    const symbol = normalizeSymbol(input.symbol);

    this.db
      .prepare(
        `INSERT INTO fund_sip_plans (
          id, account_id, symbol, name, kind, amount_cents, frequency,
          day_of_week, day_of_month, start_date, end_date, thesis, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        resolved.accountId,
        symbol,
        resolved.name,
        resolved.kind,
        toCents(input.amount),
        input.frequency,
        input.frequency === 'weekly' || input.frequency === 'biweekly' ? (input.dayOfWeek ?? null) : null,
        input.frequency === 'monthly' ? (input.dayOfMonth ?? null) : null,
        input.startDate,
        input.endDate ?? null,
        input.thesis.trim(),
        status,
        now,
        now,
      );

    const plan = this.getPlan(id);
    if (status === 'active') this.ensureRollingOccurrences(plan);
    return plan;
  }

  updatePlan(id: string, input: UpdateFundSipPlanInput): FundSipPlan {
    const current = this.getPlan(id);
    if (current.status === 'completed' || current.status === 'cancelled') {
      throw new Error('已结束的计划不可修改');
    }

    const now = new Date().toISOString();
    const amount = input.amount ?? current.amount;
    const frequency = input.frequency ?? current.frequency;
    const dayOfWeek =
      input.dayOfWeek !== undefined
        ? input.dayOfWeek
        : frequency === 'weekly' || frequency === 'biweekly'
          ? current.dayOfWeek
          : null;
    const dayOfMonth =
      input.dayOfMonth !== undefined
        ? input.dayOfMonth
        : frequency === 'monthly'
          ? current.dayOfMonth
          : null;
    const endDate = input.endDate !== undefined ? input.endDate : current.endDate;
    const thesis = input.thesis?.trim() ?? current.thesis;

    if (frequency === 'weekly' || frequency === 'biweekly') {
      if (!dayOfWeek) throw new Error('每周/每两周定投需要指定 weekday');
    } else if (frequency === 'monthly' && !dayOfMonth) {
      throw new Error('每月定投需要指定 dayOfMonth');
    }

    this.db
      .prepare(
        `UPDATE fund_sip_plans SET
          amount_cents = ?, frequency = ?, day_of_week = ?, day_of_month = ?,
          end_date = ?, thesis = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(toCents(amount), frequency, dayOfWeek, dayOfMonth, endDate, thesis, now, id);

    return this.getPlan(id);
  }

  setPlanStatus(id: string, status: SipPlanStatus): FundSipPlan {
    const current = this.getPlan(id);
    if (!planTransitions[current.status].includes(status)) {
      throw new Error(`计划状态不能从 ${current.status} 变更为 ${status}`);
    }
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    if (status === 'active') {
      this.db
        .prepare(`UPDATE fund_sip_plans SET status = 'active', pause_from_date = NULL, updated_at = ? WHERE id = ?`)
        .run(now, id);
      const plan = this.getPlan(id);
      this.ensureRollingOccurrences(plan, today);
      return plan;
    }

    if (status === 'paused') {
      return this.applyPlanPause(id, today);
    }

    this.db
      .prepare(`UPDATE fund_sip_plans SET status = ?, pause_from_date = NULL, updated_at = ? WHERE id = ?`)
      .run(status, now, id);
    return this.getPlan(id);
  }

  schedulePlanPause(id: string, fromDate: string): { plan: FundSipPlan; removedOccurrences: number; removedLedgerEntries: number } {
    const plan = this.getPlan(id);
    if (plan.status !== 'active' && plan.status !== 'paused') {
      throw new Error('只能暂停执行中或已暂停的计划');
    }
    this.assertIsoDate(fromDate);
    if (compareIsoDate(fromDate, plan.startDate) < 0) {
      throw new Error('暂停日不能早于计划开始日');
    }

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const { removedOccurrences, removedLedgerEntries } = this.purgeOccurrencesFromDate(id, fromDate);

    if (compareIsoDate(fromDate, today) <= 0) {
      this.db
        .prepare(`UPDATE fund_sip_plans SET status = 'paused', pause_from_date = ?, updated_at = ? WHERE id = ?`)
        .run(fromDate, now, id);
    } else {
      this.db
        .prepare(`UPDATE fund_sip_plans SET status = 'active', pause_from_date = ?, updated_at = ? WHERE id = ?`)
        .run(fromDate, now, id);
    }

    return {
      plan: this.getPlan(id),
      removedOccurrences,
      removedLedgerEntries,
    };
  }

  cancelScheduledPause(id: string): FundSipPlan {
    const plan = this.getPlan(id);
    if (plan.status !== 'active' || !plan.pauseFromDate) {
      throw new Error('当前没有预约暂停');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (compareIsoDate(plan.pauseFromDate, today) <= 0) {
      throw new Error('预约暂停已生效，请直接恢复计划');
    }

    const fromDate = plan.pauseFromDate;
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE fund_sip_plans SET pause_from_date = NULL, updated_at = ? WHERE id = ?`).run(now, id);
    const next = this.getPlan(id);
    this.ensureRollingOccurrences(next, today);
    return next;
  }

  applyScheduledPauses(today = new Date().toISOString().slice(0, 10)): number {
    const plans = this.listPlans(['active']).filter(
      (plan) => plan.pauseFromDate && compareIsoDate(plan.pauseFromDate, today) <= 0,
    );
    for (const plan of plans) {
      this.applyPlanPause(plan.id, plan.pauseFromDate!);
    }
    return plans.length;
  }

  deletePlan(id: string): void {
    this.getPlan(id);
    this.db.prepare('DELETE FROM fund_sip_plans WHERE id = ?').run(id);
  }

  scanDue(today = new Date().toISOString().slice(0, 10)): {
    newlyDue: number;
    newlyMissed: number;
    dueCount: number;
    newlyDueIds: string[];
  } {
    const open = this.listOccurrences(undefined, undefined, undefined, ['scheduled', 'due']);
    const { toDue, toMissed } = resolveDueTransitions(open, today);
    const now = new Date().toISOString();

    for (const id of toDue) {
      this.db.prepare(`UPDATE fund_sip_occurrences SET status = 'due', updated_at = ? WHERE id = ?`).run(now, id);
    }
    for (const id of toMissed) {
      this.db.prepare(`UPDATE fund_sip_occurrences SET status = 'missed', updated_at = ? WHERE id = ?`).run(now, id);
    }

    this.applyScheduledPauses(today);

    for (const plan of this.listPlans(['active'])) {
      this.ensureRollingOccurrences(plan, today);
    }

    const dueCount = this.listOccurrences(undefined, undefined, undefined, ['due']).length;
    return { newlyDue: toDue.length, newlyMissed: toMissed.length, dueCount, newlyDueIds: toDue };
  }

  /** 统计各标的定投买入次数（已确认流水）。 */
  countSipBuysBySymbol(accountId?: string): Map<string, number> {
    const params: string[] = [];
    let sql = `SELECT symbol, COUNT(*) AS count FROM portfolio_ledger
         WHERE source = 'sip' AND side = 'buy'`;
    if (accountId) {
      sql += ' AND account_id = ?';
      params.push(accountId);
    }
    sql += ' GROUP BY symbol';
    const rows = this.db.prepare(sql).all(...params) as unknown as Array<{ symbol: string; count: number }>;
    return new Map(rows.map((row) => [row.symbol, row.count]));
  }

  /** 列出指定账户下仍活跃的定投标的。 */
  listActivePlanNamesBySymbol(accountId?: string): Map<string, string[]> {
    const params: string[] = [];
    let sql = `SELECT symbol, name FROM fund_sip_plans WHERE status = 'active'`;
    if (accountId) {
      sql += ' AND account_id = ?';
      params.push(accountId);
    }
    const rows = this.db.prepare(sql).all(...params) as unknown as Array<{ symbol: string; name: string }>;
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const bucket = map.get(row.symbol) ?? [];
      bucket.push(row.name);
      map.set(row.symbol, bucket);
    }
    return map;
  }

  skipOccurrence(id: string, reason: string): FundSipOccurrence {
    const occurrence = this.getOccurrence(id);
    if (occurrence.status !== 'due' && occurrence.status !== 'scheduled') {
      throw new Error('只能跳过待执行或已到期期次');
    }
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE fund_sip_occurrences SET status = 'skipped', skip_reason = ?, updated_at = ? WHERE id = ?`)
      .run(reason.trim(), now, id);
    return this.getOccurrence(id);
  }

  markOccurrenceCompleted(
    id: string,
    payload: {
      amount: number;
      quantity: number;
      nav: number;
      fees: number;
      ledgerEntryId: string;
      confirmedAt: string;
    },
  ): FundSipOccurrence {
    const occurrence = this.getOccurrence(id);
    if (occurrence.status !== 'due' && occurrence.status !== 'scheduled') {
      throw new Error('只能确认待执行期次');
    }
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE fund_sip_occurrences SET
          status = 'completed', amount_cents = ?, quantity_micros = ?, nav_micros = ?,
          fees_cents = ?, ledger_entry_id = ?, confirmed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        toCents(payload.amount),
        toQuantityMicros(payload.quantity),
        toPriceMicros(payload.nav),
        toCents(payload.fees),
        payload.ledgerEntryId,
        payload.confirmedAt,
        now,
        id,
      );
    return this.getOccurrence(id);
  }

  getOccurrence(id: string): FundSipOccurrence {
    const row = this.db.prepare('SELECT * FROM fund_sip_occurrences WHERE id = ?').get(id) as unknown as
      | FundSipOccurrenceRow
      | undefined;
    if (!row) throw new Error('定投期次不存在');
    return this.mapOccurrence(row);
  }

  ensureRollingOccurrences(plan: FundSipPlan, today = new Date().toISOString().slice(0, 10)): void {
    if (plan.status !== 'active') return;

    const existing = this.listOccurrences(plan.id);
    const existingDates = new Set(existing.map((item) => item.scheduledDate));
    const futureCount = existing.filter(
      (item) => compareIsoDate(item.scheduledDate, today) >= 0 && ['scheduled', 'due'].includes(item.status),
    ).length;

    const horizon = rollingHorizonForFrequency(plan.frequency);
    if (futureCount >= horizon) return;

    const need = horizon - futureCount;
    const dates = generateOccurrenceDates({
      frequency: plan.frequency,
      startDate: plan.startDate,
      endDate: plan.endDate,
      dayOfWeek: plan.dayOfWeek,
      dayOfMonth: plan.dayOfMonth,
      count: existing.length + need + 24,
    }).filter((date) => !existingDates.has(date));

    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT INTO fund_sip_occurrences (
        id, plan_id, scheduled_date, status, amount_cents, quantity_micros, nav_micros,
        fees_cents, ledger_entry_id, skip_reason, confirmed_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'scheduled', NULL, NULL, NULL, NULL, NULL, '', NULL, ?, ?)`,
    );

    let addedFuture = 0;
    for (const scheduledDate of dates) {
      if (plan.endDate && compareIsoDate(scheduledDate, plan.endDate) > 0) break;
      if (plan.pauseFromDate && compareIsoDate(scheduledDate, plan.pauseFromDate) >= 0) break;
      insert.run(randomUUID(), plan.id, scheduledDate, now, now);
      existingDates.add(scheduledDate);
      if (compareIsoDate(scheduledDate, today) >= 0) {
        addedFuture += 1;
        if (addedFuture >= need) break;
      }
    }
  }

  countPlans(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM fund_sip_plans').get() as { count: number };
    return row.count;
  }

  /** 按账户与标的查找可关联的定投计划。 */
  findPlanForImport(accountId: string, symbol: string, planId?: string): FundSipPlan | null {
    if (planId) {
      const plan = this.getPlan(planId);
      if (plan.accountId !== accountId || plan.symbol !== symbol) return null;
      return plan;
    }
    const plans = this.listPlans(['active', 'paused', 'completed']).filter(
      (plan) => plan.accountId === accountId && plan.symbol === symbol,
    );
    return plans[0] ?? null;
  }

  findOccurrenceByPlanAndDate(planId: string, scheduledDate: string): FundSipOccurrence | null {
    const rows = this.db
      .prepare('SELECT * FROM fund_sip_occurrences WHERE plan_id = ? AND scheduled_date = ? LIMIT 1')
      .all(planId, scheduledDate) as unknown as FundSipOccurrenceRow[];
    const row = rows[0];
    return row ? this.mapOccurrence(row) : null;
  }

  /** 导入历史扣款：创建或更新期次为已完成。 */
  importCompletedOccurrence(
    planId: string,
    scheduledDate: string,
    payload: {
      amount: number;
      quantity: number;
      nav: number;
      fees: number;
      ledgerEntryId: string;
      confirmedAt: string;
    },
  ): FundSipOccurrence {
    const existing = this.findOccurrenceByPlanAndDate(planId, scheduledDate);
    if (existing?.status === 'completed') {
      throw new Error('该期次已导入');
    }

    const now = new Date().toISOString();
    if (existing) {
      this.db
        .prepare(
          `UPDATE fund_sip_occurrences SET
            status = 'completed', amount_cents = ?, quantity_micros = ?, nav_micros = ?,
            fees_cents = ?, ledger_entry_id = ?, confirmed_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          toCents(payload.amount),
          toQuantityMicros(payload.quantity),
          toPriceMicros(payload.nav),
          toCents(payload.fees),
          payload.ledgerEntryId,
          payload.confirmedAt,
          now,
          existing.id,
        );
      return this.getOccurrence(existing.id);
    }

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO fund_sip_occurrences (
          id, plan_id, scheduled_date, status, amount_cents, quantity_micros, nav_micros,
          fees_cents, ledger_entry_id, skip_reason, confirmed_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, '', ?, ?, ?)`,
      )
      .run(
        id,
        planId,
        scheduledDate,
        toCents(payload.amount),
        toQuantityMicros(payload.quantity),
        toPriceMicros(payload.nav),
        toCents(payload.fees),
        payload.ledgerEntryId,
        payload.confirmedAt,
        now,
        now,
      );
    return this.getOccurrence(id);
  }

  listPlansBySymbol(accountId: string, symbol: string): FundSipPlan[] {
    const normalized = normalizeSymbol(symbol);
    return this.listPlans().filter((plan) => plan.accountId === accountId && plan.symbol === normalized);
  }

  private assertScheduleInput(input: CreateFundSipPlanInput): void {
    if (input.amount <= 0) throw new Error('每期金额必须大于 0');
    if (!input.thesis.trim()) throw new Error('请填写定投逻辑');
    if (input.frequency === 'monthly') {
      if (!input.dayOfMonth || input.dayOfMonth < 1 || input.dayOfMonth > 28) {
        throw new Error('每月定投日需在 1–28 之间');
      }
    } else if (input.frequency === 'weekly' || input.frequency === 'biweekly') {
      if (!input.dayOfWeek || input.dayOfWeek < 1 || input.dayOfWeek > 7) {
        throw new Error('每周/每两周定投需要指定 weekday（1=周一 … 7=周日）');
      }
    }
  }

  private applyPlanPause(id: string, fromDate: string): FundSipPlan {
    const now = new Date().toISOString();
    this.purgeOccurrencesFromDate(id, fromDate);
    this.db
      .prepare(`UPDATE fund_sip_plans SET status = 'paused', pause_from_date = ?, updated_at = ? WHERE id = ?`)
      .run(fromDate, now, id);
    return this.getPlan(id);
  }

  private purgeOccurrencesFromDate(
    planId: string,
    fromDate: string,
  ): { removedOccurrences: number; removedLedgerEntries: number } {
    const rows = this.db
      .prepare(
        `SELECT id, ledger_entry_id FROM fund_sip_occurrences
         WHERE plan_id = ? AND scheduled_date >= ?`,
      )
      .all(planId, fromDate) as unknown as Array<{ id: string; ledger_entry_id: string | null }>;

    let removedLedgerEntries = 0;
    for (const row of rows) {
      if (!row.ledger_entry_id) continue;
      this.db.prepare('DELETE FROM portfolio_ledger WHERE id = ?').run(row.ledger_entry_id);
      removedLedgerEntries += 1;
    }

    const result = this.db
      .prepare(`DELETE FROM fund_sip_occurrences WHERE plan_id = ? AND scheduled_date >= ?`)
      .run(planId, fromDate);

    return {
      removedOccurrences: Number(result.changes ?? 0),
      removedLedgerEntries,
    };
  }

  private assertIsoDate(value: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error('暂停日期格式无效');
    }
  }

  private mapPlan(row: FundSipPlanRow): FundSipPlan {
    return {
      id: row.id,
      accountId: row.account_id,
      symbol: row.symbol,
      name: row.name,
      kind: row.kind,
      amount: fromCents(row.amount_cents),
      frequency: row.frequency,
      dayOfWeek: row.day_of_week,
      dayOfMonth: row.day_of_month,
      startDate: row.start_date,
      endDate: row.end_date,
      thesis: row.thesis,
      status: row.status,
      pauseFromDate: row.pause_from_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapOccurrence(row: FundSipOccurrenceRow): FundSipOccurrence {
    return {
      id: row.id,
      planId: row.plan_id,
      scheduledDate: row.scheduled_date,
      status: row.status,
      amount: row.amount_cents === null ? null : fromCents(row.amount_cents),
      quantity: row.quantity_micros === null ? null : fromQuantityMicros(row.quantity_micros),
      nav: row.nav_micros === null ? null : fromPriceMicros(row.nav_micros),
      fees: row.fees_cents === null ? null : fromCents(row.fees_cents),
      ledgerEntryId: row.ledger_entry_id,
      skipReason: row.skip_reason,
      confirmedAt: row.confirmed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
