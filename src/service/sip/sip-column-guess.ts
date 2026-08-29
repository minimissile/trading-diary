import type { SipColumnMapping, SipCsvField } from '../../shared/sip/import-types';

const FIELD_PATTERNS: Record<SipCsvField, readonly RegExp[]> = {
  symbol: [/代码/u, /symbol/u, /基金/u, /证券/u, /stock/u, /ticker/u],
  tradeAt: [/时间/u, /日期/u, /date/u, /time/u, /扣款/u, /确认/u, /成交日/u],
  nav: [/净值/u, /nav/u, /单位净值/u, /价格/u, /price/u],
  amount: [/金额/u, /amount/u, /扣款/u, /投入/u, /申购/u],
  quantity: [/份额/u, /quantity/u, /qty/u, /数量/u, /确认份额/u],
  fees: [/费用/u, /fee/u, /佣金/u, /手续费/u, /申购费/u],
};

const REQUIRED_FIELDS: readonly SipCsvField[] = ['symbol', 'tradeAt', 'nav', 'amount'];

function scoreHeader(header: string, patterns: readonly RegExp[]): number {
  const normalized = header.trim().toLowerCase();
  for (const pattern of patterns) {
    if (pattern.test(normalized) || pattern.test(header)) return pattern.source.length;
  }
  return 0;
}

/** 根据表头猜测定投 CSV 列映射。 */
export function guessSipColumnMapping(headers: readonly string[]): SipColumnMapping {
  const mapping: SipColumnMapping = {
    symbol: -1,
    tradeAt: -1,
    nav: -1,
    amount: -1,
    quantity: -1,
    fees: -1,
  };

  const used = new Set<number>();
  for (const field of Object.keys(FIELD_PATTERNS) as SipCsvField[]) {
    let bestIndex = -1;
    let bestScore = 0;
    headers.forEach((header, index) => {
      if (used.has(index)) return;
      const score = scoreHeader(header, FIELD_PATTERNS[field]);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0 && bestScore > 0) {
      mapping[field] = bestIndex;
      used.add(bestIndex);
    }
  }

  return mapping;
}

export function assertRequiredSipMapping(mapping: SipColumnMapping): void {
  const labels: Record<SipCsvField, string> = {
    symbol: '标的代码',
    tradeAt: '扣款日期',
    nav: '净值',
    amount: '扣款金额',
    quantity: '确认份额',
    fees: '手续费',
  };
  for (const field of REQUIRED_FIELDS) {
    if (mapping[field] < 0) {
      throw new Error(`请映射必填列：${labels[field]}`);
    }
  }
}
