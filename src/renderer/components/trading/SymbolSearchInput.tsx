import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AutoComplete, Input, Spin } from 'antd';
import type { InputProps } from 'antd';
import type { InstrumentInfo, MarketSearchHit } from '../../../shared/api.types';
import { useSymbolSearch } from '../../hooks/useSymbolSearch';

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
  placeholder = '输入代码或名称，如 600941、中国移动',
  maxLength = 32,
  disabled,
  ...inputProps
}: SymbolSearchInputProps): React.JSX.Element {
  const { options, loading, search, clear } = useSymbolSearch(searchLimit);
  const lastResolvedSymbol = useRef<string | null>(null);

  useEffect(() => {
    if (!value?.trim()) {
      clear();
      lastResolvedSymbol.current = null;
    }
  }, [value, clear]);

  const resolveSymbol = useCallback(
    async (symbol: string): Promise<void> => {
      if (!onResolve) return;
      const normalized = symbol.trim().toUpperCase();
      if (!normalized || lastResolvedSymbol.current === normalized) return;

      onResolveStart?.();
      try {
        const instrument = await window.desktop.market.resolve(normalized);
        lastResolvedSymbol.current = instrument.symbol;
        onResolve(instrument);
        if (instrument.symbol !== value) onChange?.(instrument.symbol);
      } catch {
        lastResolvedSymbol.current = null;
        onResolve(null);
      }
    },
    [onChange, onResolve, onResolveStart, value],
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
            <small>{hit.securityTypeName ?? kindLabels[hit.kind] ?? hit.kind}</small>
          </div>
        ),
      })),
    [options],
  );

  const handleChange = (text: string): void => {
    onChange?.(text);
    search(text);
  };

  const handleSelect = (symbol: string, option: { hit?: MarketSearchHit }): void => {
    onChange?.(symbol);
    if (option.hit) onHitSelect?.(option.hit);
    void resolveSymbol(symbol);
  };

  const handleBlur = (): void => {
    if (resolveOnBlur && value?.trim()) void resolveSymbol(value);
  };

  return (
    <AutoComplete
      className="symbol-search-input"
      classNames={{ popup: { root: 'trading-select-dropdown' } }}
      getPopupContainer={(trigger) => trigger.ownerDocument.body}
      disabled={disabled}
      options={autoCompleteOptions}
      value={value}
      notFoundContent={loading ? <Spin size="small" /> : '无匹配标的'}
      onSelect={(symbol, option) => handleSelect(symbol, option as { hit?: MarketSearchHit })}
      onBlur={handleBlur}
      onChange={handleChange}
    >
      <Input placeholder={placeholder} maxLength={maxLength} allowClear disabled={disabled} {...inputProps} />
    </AutoComplete>
  );
}
