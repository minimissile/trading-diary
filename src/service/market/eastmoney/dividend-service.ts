import type { DividendEvent, DividendListResult, InstrumentKind } from '../../../shared/market/types';
import { eastMoneyFetchJson } from './client';
import { resolveInstrument } from './search-service';
import { asNumber, mapDividendStatus, normalizeSymbol, parseEastMoneyDate, toF10Code } from './symbols';

interface ShareBonusRow {
  SECURITY_CODE?: string;
  IMPL_PLAN_PROFILE?: string;
  PRETAX_BONUS_RMB?: number;
  ASSIGN_PROGRESS?: string;
  REPORT_DATE?: string;
  NOTICE_DATE?: string;
  PLAN_NOTICE_DATE?: string;
  EQUITY_RECORD_DATE?: string;
  EX_DIVIDEND_DATE?: string;
  PAY_CASH_DATE?: string;
  EX_DIVIDEND_DAYS?: number;
}

interface ShareBonusResponse {
  success?: boolean;
  result?: {
    count?: number;
    data?: ShareBonusRow[];
  };
}

interface FundBonusRow {
  FSRQ?: string;
  DJR?: string;
  FHFCZ?: string;
  CFBL?: string;
  FHFCBZ?: string;
  CFLX?: string;
  FFR?: string;
  FH?: string;
}

interface FundBonusResponse {
  Success?: boolean;
  Datas?: {
    FHINFO?: FundBonusRow[];
  };
}

export async function listDividends(
  symbolInput: string,
  page = 1,
  pageSize = 20,
): Promise<DividendListResult> {
  const instrument = await resolveInstrument(symbolInput);
  if (instrument.kind === 'otc_fund') {
    return listOtcFundDividends(instrument.symbol, instrument.kind);
  }

  const exchangeResult = await listExchangeDividends(instrument.symbol, instrument.kind, page, pageSize);
  if (exchangeResult.total > 0) {
    return exchangeResult;
  }

  if (instrument.kind === 'etf' || instrument.kind === 'lof') {
    return listOtcFundDividends(instrument.symbol, instrument.kind);
  }

  return exchangeResult;
}

async function listExchangeDividends(
  symbol: string,
  kind: InstrumentKind,
  page: number,
  pageSize: number,
): Promise<DividendListResult> {
  const url = new URL('https://datacenter-web.eastmoney.com/api/data/v1/get');
  url.searchParams.set('reportName', 'RPT_SHAREBONUS_DET');
  url.searchParams.set('columns', 'ALL');
  url.searchParams.set('filter', `(SECURITY_CODE="${normalizeSymbol(symbol)}")`);
  url.searchParams.set('pageNumber', String(page));
  url.searchParams.set('pageSize', String(Math.min(Math.max(pageSize, 1), 50)));
  url.searchParams.set('sortColumns', 'EX_DIVIDEND_DATE');
  url.searchParams.set('sortTypes', '-1');

  const payload = await eastMoneyFetchJson<ShareBonusResponse>(url);
  if (!payload.success) {
    return {
      symbol: normalizeSymbol(symbol),
      kind,
      total: 0,
      items: [],
    };
  }

  const rows = payload.result?.data ?? [];
  return {
    symbol: normalizeSymbol(symbol),
    kind,
    total: payload.result?.count ?? rows.length,
    items: rows.map((row) => mapShareBonusRow(symbol, row)),
  };
}

/** 东方财富 RPT_SHAREBONUS_DET 的 PRETAX_BONUS_RMB 为「每10股」税前分红（如 10派0.27元 → 0.27）。 */
export function exchangePretaxBonusToCashPerShare(pretaxBonusRmb: number | null): number | null {
  if (pretaxBonusRmb === null || pretaxBonusRmb <= 0) return null;
  return pretaxBonusRmb / 10;
}

function mapShareBonusRow(symbol: string, row: ShareBonusRow): DividendEvent {
  const progress = row.ASSIGN_PROGRESS ?? '';
  return {
    symbol: normalizeSymbol(symbol),
    planText: row.IMPL_PLAN_PROFILE ?? '',
    cashPerShare: exchangePretaxBonusToCashPerShare(asNumber(row.PRETAX_BONUS_RMB)),
    status: mapDividendStatus(progress),
    progress,
    reportDate: parseEastMoneyDate(row.REPORT_DATE),
    noticeDate: parseEastMoneyDate(row.NOTICE_DATE ?? row.PLAN_NOTICE_DATE),
    recordDate: parseEastMoneyDate(row.EQUITY_RECORD_DATE),
    exDividendDate: parseEastMoneyDate(row.EX_DIVIDEND_DATE),
    payDate: parseEastMoneyDate(row.PAY_CASH_DATE),
    daysToExDividend: asNumber(row.EX_DIVIDEND_DAYS),
    source: 'eastmoney',
  };
}

async function listOtcFundDividends(symbol: string, kind: InstrumentKind): Promise<DividendListResult> {
  const url = new URL('https://fundmobapi.eastmoney.com/FundMNewApi/FundMNBonusDetail');
  url.searchParams.set('FCODE', normalizeSymbol(symbol));
  url.searchParams.set('pageIndex', '1');
  url.searchParams.set('pageSize', '50');
  url.searchParams.set('plat', 'Android');
  url.searchParams.set('appType', 'ttjj');
  url.searchParams.set('product', 'EFund');
  url.searchParams.set('Version', '1');
  url.searchParams.set('deviceid', '1');

  const payload = await eastMoneyFetchJson<FundBonusResponse>(url, { referer: 'https://fund.eastmoney.com/' });
  const rows = payload.Datas?.FHINFO ?? [];

  return {
    symbol: normalizeSymbol(symbol),
    kind,
    total: rows.length,
    items: rows.map((row) => mapFundBonusRow(symbol, row)),
  };
}

function mapFundBonusRow(symbol: string, row: FundBonusRow): DividendEvent {
  const cashPerShare = asNumber(row.FHFCZ);
  const exDate = parseEastMoneyDate(row.DJR ?? row.FSRQ);
  const isFuture = exDate ? new Date(exDate).getTime() >= Date.now() : false;

  return {
    symbol: normalizeSymbol(symbol),
    planText: row.FH ?? row.CFBL ?? '',
    cashPerShare,
    status: isFuture ? 'announced' : 'implemented',
    progress: row.CFLX ?? '分红',
    reportDate: null,
    noticeDate: parseEastMoneyDate(row.FSRQ),
    recordDate: parseEastMoneyDate(row.DJR),
    exDividendDate: exDate,
    payDate: parseEastMoneyDate(row.FFR),
    daysToExDividend: null,
    source: 'eastmoney',
  };
}

export async function listUpcomingDividends(symbolInput: string, limit = 5): Promise<DividendEvent[]> {
  const result = await listDividends(symbolInput, 1, 50);
  return result.items.filter((item) => item.status !== 'implemented').slice(0, limit);
}

export async function computeOtcFundDividendYield(symbol: string, nav: number | null): Promise<number | null> {
  if (!nav || nav <= 0) return null;
  const { items } = await listOtcFundDividends(symbol, 'otc_fund');
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const trailingCash = items
    .filter((item) => item.exDividendDate && new Date(item.exDividendDate).getTime() >= cutoff)
    .reduce((sum, item) => sum + (item.cashPerShare ?? 0), 0);

  if (trailingCash <= 0) return null;
  return Number(((trailingCash / nav) * 100).toFixed(2));
}

export { toF10Code };
