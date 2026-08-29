/** 行情刷新时间（本地时区，YYYY-MM-DD HH:mm）。 */
export function formatQuoteRefreshTime(value: string | null | undefined): string {
  if (!value) return '点击刷新行情获取现价';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '点击刷新行情获取现价';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `更新时间 ${year}-${month}-${day} ${hour}:${minute}`;
}
