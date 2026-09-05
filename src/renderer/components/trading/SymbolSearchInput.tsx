import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AutoComplete, Input, Spin } from 'antd';
import type { InputProps } from 'antd';
import type { InstrumentInfo, MarketSearchHit } from '../../../shared/api.types';
import { useSymbolSearch } from '../../hooks/useSymbolSearch';

import { labelForVenue } from '../../../shared/market/venues';

const kindLabels: Record<string, string> = {
  stock: 'A股',
  etf: 'ETF',
  lof: 'LOF',
  otc_fund: '场外基金',
  unknown: '其他',
};

export interface SymbolSearchInputProps extends Omit<InputProps, 'value' | 'onChange' | 'onSelect'> {
  value?: string;
  onChange?: (value: string) => void;
  /** 选中建议项时回调。 */
  onHitSelect?: (hit: MarketSearchHit) => void;
  /** 开始解析标的详情。 */
  onResolveStart?: () => void;
  /** 失焦或选中后解析完成时回调。 */
  onResolve?: (instrument: InstrumentInfo | null) => void;
  /** 是否在失焦时自动 resolve，默认 true。 */
  resolveOnBlur?: boolean;
  /** 搜索建议条数上限。 */
  searchLimit?: number;
  /** 账户可交易市场，控制搜索范围。 */
  marketScopes?: readonly string[];
  assetKind?: 'stock' | 'fund';
}

/**
 * 带远程搜索建议的标的代码输入框，供 Form.Item 直接使用。
 */
export function SymbolSearchInput({
  value,
  onChange,
  onHitSelect,
  onResolveStart,
  onResolve,
  resolveOnBlur = true,
  searchLimit,
  marketScopes = ['CN_A'],
  assetKind,
  placeholder = '输入代码或名称，如 600941、AAPL、00700',
  maxLength = 32,
  disabled,
  ...inputProps
}: SymbolSearchInputProps): React.JSX.Element {
  const { options, loading, error, search, clear } = useSymbolSearch(searchLimit, marketScopes, assetKind);
  const lastResolvedSymbol = useRef<string | null>(null);
  const resolveSequence = useRef(0);
  const scopesKey = marketScopes.join(',');
  useEffect(() => {
    clear();
    lastResolvedSymbol.current = null;
    return () => { resolveSequence.current += 1; };
  }, [assetKind, scopesKey, clear]);

  useEffect(() => {
    if (!value?.trim()) {
      clear();
      resolveSequence.current += 1;
      lastResolvedSymbol.current = null;
    }
  }, [value, clear]);

  const resolveSymbol = useCallback(
    async (symbol: string, selectedHit?: MarketSearchHit): Promise<void> => {
      if (!onResolve) return;
      const normalized = symbol.trim().toUpperCase();
      if (!normalized || lastResolvedSymbol.current === normalized) return;

      const sequence = ++resolveSequence.current;
      onResolveStart?.();
      try {
        let instrument: InstrumentInfo;
        if (assetKind) {
          const hit = selectedHit ?? (await window.desktop.market.search(normalized, 20, scopesKey.split(','), assetKind))
            .find((item) => item.symbol.toUpperCase() === normalized);
          if (!hit || hit.kind === 'unknown' || (assetKind === 'fund' ? hit.kind !== 'otc_fund' : hit.kind === 'otc_fund')) {
            throw new Error('标的与交易渠道不匹配');
          }
          const exchange = hit.venue === 'SH' || hit.venue === 'SZ' ? hit.venue : null;
          instrument = {
            ...hit,
            kind: hit.kind,
            market: exchange,
            secid: exchange ? `${exchange === 'SH' ? '1' : '0'}.${hit.symbol}` : null,
            f10Code: exchange ? `${exchange}${hit.symbol}` : null,
          };
        } else {
          instrument = await window.desktop.market.resolve(normalized);
        }
        if (sequence !== resolveSequence.current) return;
        lastResolvedSymbol.current = instrument.symbol;
        onResolve(instrument);
        if (instrument.symbol !== value) onChange?.(instrument.symbol);
      } catch {
        if (sequence !== resolveSequence.current) return;
        lastResolvedSymbol.current = null;
        onResolve(null);
      }
    },
    [assetKind, scopesKey, onChange, onResolve, onResolveStart, value],
  );

  const autoCompleteOptions = useMemo(
    () =>
      options.map((hit) => ({
        value: hit.symbol,
        hit,
        label: (
          <div className="symbol-search-option">
            <strong>{hit.symbol}</strong>
            <span>{hit.name}</span>
            <small>
              {labelForVenue(hit.venue)} · {hit.securityTypeName ?? kindLabels[hit.kind] ?? hit.kind}
            </small>
          </div>
        ),
      })),
    [options],
  );

  const handleChange = (text: string): void => {
    resolveSequence.current += 1;
    lastResolvedSymbol.current = null;
    onChange?.(text);
    search(text);
  };

  const handleSelect = (symbol: string, option: { hit?: MarketSearchHit }): void => {
    onChange?.(symbol);
    if (option.hit) onHitSelect?.(option.hit);
    void resolveSymbol(symbol, option.hit);
  };

  const handleBlur = (): void => {
    if (resolveOnBlur && value?.trim()) void resolveSymbol(value);
  };

  return (
    <AutoComplete
      className="symbol-search-input"
      getPopupContainer={(trigger: HTMLElement) => trigger.ownerDocument.body}
      disabled={disabled}
      options={autoCompleteOptions}
      value={value}
      notFoundContent={loading ? <Spin size="small" /> : error ? <span role="alert">{error}</span> : '无匹配标的'}
      onSelect={(symbol, option) => handleSelect(symbol, option)}
      onBlur={handleBlur}
      onChange={handleChange}
    >
      <Input placeholder={placeholder} maxLength={maxLength} allowClear disabled={disabled} {...inputProps} />
    </AutoComplete>
  );
}
