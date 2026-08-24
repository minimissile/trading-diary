export function formatBytes(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'unit',
    unit: 'megabyte',
    maximumFractionDigits: 2,
  }).format(value / 1_048_576);
}
