import type { ExecutionColumnMapping, ExecutionCsvField } from '../../shared/import/types';

const FIELD_PATTERNS: Record<ExecutionCsvField, readonly RegExp[]> = {
  symbol: [/代码/u, /symbol/u, /证券/u, /stock/u, /ticker/u],
  side: [/方向/u, /买卖/u, /side/u, /操作/u, /委托/u, /bs/u],
  quantity: [/数量/u, /qty/u, /quantity/u, /股数/u, /成交数量/u],
  price: [/价格/u, /price/u, /成交价/u, /均价/u],
  fees: [/费用/u, /fee/u, /佣金/u, /手续费/u, /印花税/u],
  tradeAt: [/时间/u, /日期/u, /date/u, /time/u, /成交日/u],
};

const REQUIRED_FIELDS: readonly ExecutionCsvField[] = ['symbol', 'side', 'quantity', 'price', 'tradeAt'];

function scoreHeader(header: string, patterns: readonly RegExp[]): number {
  const normalized = header.trim().toLowerCase();
  for (const pattern of patterns) {
    if (pattern.test(normalized) || pattern.test(header)) return pattern.source.length;
  }
  return 0;
}

/**
 * 根据表头猜测列映射。
 */
export function guessExecutionColumnMapping(headers: readonly string[]): ExecutionColumnMapping {
  const mapping: ExecutionColumnMapping = {
    symbol: -1,
    side: -1,
    quantity: -1,
    price: -1,
    fees: -1,
    tradeAt: -1,
  };

  const used = new Set<number>();
  for (const field of Object.keys(FIELD_PATTERNS) as ExecutionCsvField[]) {
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

export function assertRequiredMapping(mapping: ExecutionColumnMapping): void {
  for (const field of REQUIRED_FIELDS) {
    if (mapping[field] < 0) {
      const labels: Record<ExecutionCsvField, string> = {
        symbol: '标的代码',
        side: '买卖方向',
        quantity: '成交数量',
        price: '成交价格',
        fees: '手续费',
        tradeAt: '成交时间',
      };
      throw new Error(`请映射必填列：${labels[field]}`);
    }
  }
}
