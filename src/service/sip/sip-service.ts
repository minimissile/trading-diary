import type { WorkspaceSnapshot } from '../../shared/api.types';
import type {
  ConfirmFundSipOccurrenceInput,
  ConfirmFundSipOccurrenceResult,
  CreateFundSipPlanInput,
  FundSipOccurrencePreview,
  FundSipOccurrenceView,
  FundSipPlanDetailView,
  FundSipPlanView,
  SipOccurrenceCalendarDay,
  SipPlanPositionLink,
  SipPlanStatus,
  SipPositionMeta,
  SipReviewTemplate,
  SipScanResult,
  SipSchedulePauseResult,
  SipSummaryView,
  UpdateFundSipPlanInput,
} from '../../shared/sip/types';
import type { AppDatabase } from '../database/database';
import { isAllAccountsId } from '../../shared/accounts/constants';
import { aggregatePositions } from '../portfolio/ledger-service';
import { marketService } from '../market/market-service';
import { computeQuantityFromAmount, previewSchedule } from './sip-scheduler';
import {
  buildOccurrenceCalendar,
  buildSipReviewTemplate,
  computeCurrentStreak,
  computeDisciplineRate,
  computeLongestStreak,
  computeTotalInvested,
  countCompletedThisMonth,
  summarizePlanOccurrences,
} from './sip-stats';
import type { SipDatabase } from './sip-database';

const ALLOWED_SIP_KINDS = new Set(['otc_fund', 'etf', 'lof']);

export class SipService {
  constructor(
    private readonly database: AppDatabase,
    private readonly sip: SipDatabase,
  ) {}

  scanDue(): SipScanResult {
    const result = this.sip.scanDue();
    const newlyDueOccurrences = result.newlyDueIds.map((id) => this.toOccurrenceView(this.sip.getOccurrence(id)));
    return {
      dueCount: result.dueCount,
      newlyDue: result.newlyDue,
      newlyMissed: result.newlyMissed,
      newlyDueOccurrences,
    };
  }

  listPlans(statuses?: SipPlanStatus[]): FundSipPlanView[] {
    return this.sip.listPlans(statuses).map((plan) => this.toPlanView(plan.id));
  }

  getPlan(id: string): FundSipPlanDetailView {
    const occurrences = this.sip.listOccurrences(id).slice(0, 24);
    return {
      ...this.toPlanView(id),
      occurrences,
    };
  }

  async createPlan(input: CreateFundSipPlanInput): Promise<FundSipPlanView> {
    const instrument = await marketService.resolve(input.symbol);
    if (!ALLOWED_SIP_KINDS.has(instrument.kind)) {
      throw new Error('定投仅支持场外基金、ETF 与 LOF');
    }
    const accountId = this.database.portfolio.resolveAccountId(input.accountId);
    const created = this.sip.createPlan(input, {
      name: instrument.name,
      kind: instrument.kind,
      accountId,
    });
    return this.toPlanView(created.id);
  }

  updatePlan(id: string, input: UpdateFundSipPlanInput): FundSipPlanView {
    this.sip.updatePlan(id, input);
    return this.toPlanView(id);
  }

  setPlanStatus(id: string, status: SipPlanStatus): FundSipPlanView {
    this.sip.setPlanStatus(id, status);
    return this.toPlanView(id);
  }

  schedulePlanPause(id: string, fromDate: string): SipSchedulePauseResult {
    const result = this.sip.schedulePlanPause(id, fromDate);
    return {
      plan: this.toPlanView(result.plan.id),
      removedOccurrences: result.removedOccurrences,
      removedLedgerEntries: result.removedLedgerEntries,
    };
  }

  cancelScheduledPause(id: string): FundSipPlanView {
    this.sip.cancelScheduledPause(id);
    return this.toPlanView(id);
  }

  deletePlan(id: string): { deleted: true } {
    this.sip.deletePlan(id);
    return { deleted: true };
  }

  previewSchedule(input: CreateFundSipPlanInput): FundSipOccurrencePreview[] {
    return previewSchedule(input, 6).map((scheduledDate) => ({ scheduledDate }));
  }

  listOccurrences(planId?: string, from?: string, to?: string) {
    return this.sip.listOccurrences(planId, from, to);
  }

  listOccurrenceViews(planId?: string, from?: string, to?: string): FundSipOccurrenceView[] {
    return this.sip.listOccurrences(planId, from, to).map((occurrence) => this.toOccurrenceView(occurrence));
  }

  getOccurrenceCalendar(month: string): SipOccurrenceCalendarDay[] {
    const from = `${month.slice(0, 7)}-01`;
    const to = `${month.slice(0, 7)}-31`;
    const occurrences = this.listOccurrenceViews(undefined, from, to);
    return buildOccurrenceCalendar(month, occurrences);
  }

  getPositionMeta(accountId?: string): SipPositionMeta[] {
    const scopedAccountId =
      accountId && !isAllAccountsId(accountId) ? this.database.portfolio.resolveAccountId(accountId) : undefined;
    const buyCounts = this.sip.countSipBuysBySymbol(scopedAccountId);
    const activePlans = this.sip.listActivePlanNamesBySymbol(scopedAccountId);
    const symbols = new Set([...buyCounts.keys(), ...activePlans.keys()]);
    return [...symbols].map((symbol) => ({
      symbol,
      activePlanNames: activePlans.get(symbol) ?? [],
      confirmedBuyCount: buyCounts.get(symbol) ?? 0,
    }));
  }

  getReviewTemplate(planId: string): SipReviewTemplate {
    const plan = this.sip.getPlan(planId);
    const occurrences = this.sip.listOccurrences(planId);
    const stats = summarizePlanOccurrences(occurrences);
    const ledger = this.database.portfolio.listLedger(plan.accountId);
    const position = aggregatePositions(ledger).find((item) => item.symbol === plan.symbol);
    return buildSipReviewTemplate(
      plan,
      stats,
      position ? { quantity: position.quantity, avgCost: position.avgCost, unrealizedPnl: null } : undefined,
    );
  }

  getPlanPositionLink(planId: string): SipPlanPositionLink {
    const plan = this.sip.getPlan(planId);
    const ledger = this.database.portfolio.listLedger(plan.accountId);
    const position = aggregatePositions(ledger).find((item) => item.symbol === plan.symbol);
    return {
      planId: plan.id,
      symbol: plan.symbol,
      planName: plan.name,
      accountId: plan.accountId,
      hasPosition: Boolean(position && position.quantity > 0),
      positionQuantity: position?.quantity ?? null,
      avgCost: position?.avgCost ?? null,
      unrealizedPnl: null,
    };
  }

  listPlansBySymbol(accountId: string, symbol: string): FundSipPlanView[] {
    const resolved = this.database.portfolio.resolveAccountId(accountId);
    return this.sip.listPlansBySymbol(resolved, symbol).map((plan) => this.toPlanView(plan.id));
  }

  listDueOccurrenceViews(): FundSipOccurrenceView[] {
    return this.sip.listDueOccurrences().map((occurrence) => this.toOccurrenceView(occurrence));
  }

  skipOccurrence(id: string, reason: string) {
    return this.sip.skipOccurrence(id, reason);
  }

  // Service boundary intentionally converts synchronous database failures to rejected promises.
  // eslint-disable-next-line @typescript-eslint/require-await
  async confirmOccurrence(input: ConfirmFundSipOccurrenceInput): Promise<ConfirmFundSipOccurrenceResult> {
    const occurrence = this.sip.getOccurrence(input.id);
    const plan = this.sip.getPlan(occurrence.planId);
    const fees = input.fees ?? 0;
    const amount = plan.amount;
    const quantity = input.quantity ?? computeQuantityFromAmount(amount, input.nav, fees);
    if (quantity <= 0) throw new Error('确认份额必须大于 0');

    const tradeAt = input.tradeAt ?? new Date().toISOString();
    const ledger = this.database.portfolio.addLedgerEntry({
      accountId: plan.accountId,
      symbol: plan.symbol,
      kind: plan.kind,
      venue: plan.kind === 'otc_fund' ? 'OTC' : undefined,
      side: 'buy',
      quantity,
      price: input.nav,
      fees,
      cashOutflow: plan.kind === 'otc_fund' ? amount : null,
      tradeAt,
      note: `定投 · ${plan.name}`,
      source: 'sip',
      sipOccurrenceId: occurrence.id,
    });

    const confirmed = this.sip.markOccurrenceCompleted(occurrence.id, {
      amount,
      quantity,
      nav: input.nav,
      fees,
      ledgerEntryId: ledger.id,
      confirmedAt: tradeAt,
    });

    return { occurrence: confirmed, ledgerEntryId: ledger.id };
  }

  getSummary(): SipSummaryView {
    const activePlans = this.sip.listPlans(['active']);
    const allOccurrences = this.sip.listOccurrences();
    const yearMonth = new Date().toISOString().slice(0, 7);

    return {
      activePlanCount: activePlans.length,
      dueOccurrenceCount: allOccurrences.filter((item) => item.status === 'due').length,
      completedThisMonth: countCompletedThisMonth(allOccurrences, yearMonth),
      disciplineRate: computeDisciplineRate(allOccurrences),
      currentStreak: computeCurrentStreak(allOccurrences),
      longestStreak: computeLongestStreak(allOccurrences),
      totalInvested: computeTotalInvested(activePlans, allOccurrences),
    };
  }

  extendWorkspaceSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
    const dueSipOccurrences = this.listDueOccurrenceViews().slice(0, 6);
    const activeSipPlanCount = this.sip.listPlans(['active']).length;
    return {
      ...snapshot,
      dueSipOccurrences,
      activeSipPlanCount,
      dueSipOccurrenceCount: dueSipOccurrences.length,
    };
  }

  private toPlanView(planId: string): FundSipPlanView {
    const plan = this.sip.getPlan(planId);
    const occurrences = this.sip.listOccurrences(planId);
    return {
      ...plan,
      ...summarizePlanOccurrences(occurrences),
    };
  }

  private toOccurrenceView(occurrence: ReturnType<SipDatabase['getOccurrence']>): FundSipOccurrenceView {
    const plan = this.sip.getPlan(occurrence.planId);
    return {
      ...occurrence,
      planName: plan.name,
      symbol: plan.symbol,
      kind: plan.kind,
      accountId: plan.accountId,
      plannedAmount: plan.amount,
    };
  }
}

export function createSipService(database: AppDatabase): SipService {
  return new SipService(database, database.sip);
}
