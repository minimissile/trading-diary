export function LhbNumber({ value, percent = false }: { value: number | null; percent?: boolean }): React.JSX.Element {
  const tone = value === null || value === 0 ? '' : value > 0 ? 'td-value--profit' : 'td-value--loss';
  return (
    <span className={`lhb-number ${tone}`}>
      {value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}${percent ? '%' : ''}`}
    </span>
  );
}

export function LhbMoney({ cents, signed = false }: { cents: number | null; signed?: boolean }): React.JSX.Element {
  if (cents === null) return <span>—</span>;
  const yuan = cents / 100;
  const amount = Math.abs(yuan) >= 100_000_000 ? `${(yuan / 100_000_000).toFixed(2)}亿` : `${(yuan / 10_000).toFixed(2)}万`;
  const tone = signed && yuan !== 0 ? (yuan > 0 ? 'td-value--profit' : 'td-value--loss') : '';
  return (
    <span
      className={`lhb-number ${tone}`}
      title={`${yuan.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元`}
    >
      {signed && yuan > 0 ? '+' : ''}
      {amount}
    </span>
  );
}
