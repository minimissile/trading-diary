import type { LedgerAiTradeChannel } from '../../../shared/portfolio/ledger-import-types';
import type { InstrumentKind } from '../../../shared/market/types';
import { MarketNotFoundError } from '../../../shared/market/errors';
import { eastMoneyPostForm } from './client';
import { listKlines } from './kline-service';
import { resolveInstrument } from './search-service';

interface FundNavHistoryResponse {
  Success?: boolean;
  Datas?: Array<{
    FSRQ?: string;
    DWJZ?: string;
  }>;
  TotalCount?: number;
}

export interface HistoricalPriceLookup {
  nav: number;
  navDate: string;
  exact: boolean;
  kind: InstrumentKind;
}

const MAX_FUND_NAV_PAGES = 12;
const FUND_NAV_PAGE_SIZE = 100;
const NEAREST_LOOKBACK_DAYS = 7;

const FUND_NAV_KINDS = new Set<InstrumentKind>(['otc_fund', 'lof', 'etf']);

/** 通过天天基金历史净值接口查询指定日期净值（不校验标的类型）。 */
export async function queryFundNavHistoryOnDate(
  fcode: string,
  dateKey: string,
): Promise<Omit<HistoricalPriceLookup, 'kind'> | null> {
  let bestPrior: { navDate: string; nav: number } | null = null;

  for (let pageIndex = 1; pageIndex <= MAX_FUND_NAV_PAGES; pageIndex += 1) {
    const payload = await eastMoneyPostForm<FundNavHistoryResponse>(
      'https://fundmobapi.eastmoney.com/FundMNewApi/FundMNHisNetList',
      {
        FCODE: fcode,
        pageIndex: String(pageIndex),
        pageSize: String(FUND_NAV_PAGE_SIZE),
        plat: 'Android',
        appType: 'ttjj',
        product: 'EFund',
        Version: '1',
        deviceid: '1',
      },
      { referer: 'https://fund.eastmoney.com/' },
    );

    const rows = payload.Datas ?? [];
    if (!payload.Success || rows.length === 0) break;

    for (const row of rows) {
      const navDate = row.FSRQ?.trim();
      const nav = parsePositiveNumber(row.DWJZ);
      if (!navDate || nav === null) continue;

      if (navDate === dateKey) {
        return { nav, navDate, exact: true };
      }

      if (navDate < dateKey) {
        if (!bestPrior || navDate > bestPrior.navDate) {
          bestPrior = { navDate, nav };
        }
      }
    }

    const oldestDate = rows.at(-1)?.FSRQ;
    if (oldestDate && oldestDate < subtractDays(dateKey, NEAREST_LOOKBACK_DAYS + 1)) {
      break;
    }

    if ((payload.TotalCount ?? 0) <= pageIndex * FUND_NAV_PAGE_SIZE) {
      break;
    }
  }

  if (!bestPrior || daysBetween(bestPrior.navDate, dateKey) > NEAREST_LOOKBACK_DAYS) {
    return null;
  }

  return {
    nav: bestPrior.nav,
    navDate: bestPrior.navDate,
    exact: false,
  };
}

/** 查询场外基金在指定日期的单位净值（可回退至前若干交易日）。 */
export async function lookupOtcFundNavOnDate(symbolInput: string, dateKey: string): Promise<HistoricalPriceLookup | null> {
  const instrument = await resolveInstrument(symbolInput);
  if (instrument.kind !== 'otc_fund') {
    throw new MarketNotFoundError(`非场外基金：${instrument.symbol}`);
  }

  const lookup = await queryFundNavHistoryOnDate(instrument.symbol, dateKey);
  return lookup ? { ...lookup, kind: instrument.kind } : null;
}

/** 查询场内标的在指定日期的收盘价（可回退至前若干交易日）。 */
export async function lookupExchangeCloseOnDate(symbolInput: string, dateKey: string): Promise<HistoricalPriceLookup | null> {
  const instrument = await resolveInstrument(symbolInput);
  if (instrument.kind === 'otc_fund') {
    throw new MarketNotFoundError(`场外基金请使用净值接口：${instrument.symbol}`);
  }

  let bars;
  try {
    ({ bars } = await listKlines(instrument.symbol, '1d', 'forward', 1023));
  } catch {
    return null;
  }

  let bestPrior: { navDate: string; nav: number } | null = null;

  for (const bar of bars) {
    const navDate = formatDateKey(bar.timestamp);
    const nav = bar.close;
    if (!Number.isFinite(nav) || nav <= 0) continue;

    if (navDate === dateKey) {
      return { nav, navDate, exact: true, kind: instrument.kind };
    }

    if (navDate < dateKey) {
      if (!bestPrior || navDate > bestPrior.navDate) {
        bestPrior = { navDate, nav };
      }
    }
  }

  if (!bestPrior || daysBetween(bestPrior.navDate, dateKey) > NEAREST_LOOKBACK_DAYS) {
    return null;
  }

  return {
    nav: bestPrior.nav,
    navDate: bestPrior.navDate,
    exact: false,
    kind: instrument.kind,
  };
}

const FUND_CODE_PATTERN = /^\d{6}$/u;

/** 按导入交易渠道查询历史价格/净值。 */
export async function lookupImportPriceOnDate(
  symbolInput: string,
  dateKey: string,
  channel: LedgerAiTradeChannel,
): Promise<HistoricalPriceLookup | null> {
  if (channel === 'otc') {
    const instrument = await resolveInstrument(symbolInput);
    const fundNav = await queryFundNavHistoryOnDate(instrument.symbol, dateKey);
    if (fundNav) {
      return { ...fundNav, kind: instrument.kind };
    }
    if (instrument.kind === 'otc_fund') {
      return null;
    }
    return lookupExchangeCloseOnDate(instrument.symbol, dateKey);
  }

  return lookupExchangeCloseOnDate(symbolInput, dateKey);
}

/** 按标的类型查询历史价格/净值。定投确认优先使用基金净值接口。 */
export async function lookupHistoricalPriceOnDate(symbolInput: string, dateKey: string): Promise<HistoricalPriceLookup | null> {
  const instrument = await resolveInstrument(symbolInput);

  // 多数定投标的为 6 位基金代码；即使被行情源误判为股票，仍优先查基金历史净值。
  if (FUND_CODE_PATTERN.test(instrument.symbol) || FUND_NAV_KINDS.has(instrument.kind)) {
    const fundNav = await queryFundNavHistoryOnDate(instrument.symbol, dateKey);
    if (fundNav) {
      return { ...fundNav, kind: instrument.kind };
    }
  }

  if (instrument.kind === 'otc_fund') {
    return null;
  }

  return lookupExchangeCloseOnDate(instrument.symbol, dateKey);
}

function parsePositiveNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,，\s]/gu, '').trim();
  if (!cleaned || cleaned === '--') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function formatDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function subtractDays(dateKey: string, days: number): string {
  const [year = NaN, month = NaN, day = NaN] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - days);
  return formatDateKey(date.getTime());
}

function daysBetween(earlier: string, later: string): number {
  const start = Date.parse(`${earlier}T00:00:00`);
  const end = Date.parse(`${later}T00:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return Number.POSITIVE_INFINITY;
  return Math.round((end - start) / 86_400_000);
}
